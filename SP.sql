-- SP.sql
-- Base PostgreSQL/Supabase para registrar compras, historico de precios,
-- recetas y costeo completo de una pastelera.
--
-- En PostgreSQL las "SP" se suelen exponer como funciones RPC. Este archivo
-- deja todas las operaciones principales encapsuladas en funciones.

create extension if not exists pgcrypto;

create table if not exists settings (
  id boolean primary key default true,
  hourly_rate numeric(12, 2) not null default 0,
  utilities_cost numeric(12, 2) not null default 0,
  other_cost numeric(12, 2) not null default 0,
  target_margin numeric(5, 2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint settings_single_row check (id = true)
);

create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_unit text not null check (base_unit in ('g', 'ml', 'unidad')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  purchase_date date not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'unidad')),
  total_price numeric(12, 2) not null check (total_price >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  servings integer not null check (servings > 0),
  labor_hours numeric(8, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'unidad')),
  unique (recipe_id, ingredient_id, unit)
);

insert into settings (id)
values (true)
on conflict (id) do nothing;

create or replace function sp_base_quantity(p_quantity numeric, p_unit text)
returns numeric
language sql
immutable
as $$
  select case
    when p_unit in ('kg', 'l') then p_quantity * 1000
    else p_quantity
  end;
$$;

create or replace function sp_upsert_settings(
  p_hourly_rate numeric,
  p_utilities_cost numeric,
  p_other_cost numeric,
  p_target_margin numeric
)
returns settings
language plpgsql
as $$
declare
  v_settings settings;
begin
  insert into settings (id, hourly_rate, utilities_cost, other_cost, target_margin, updated_at)
  values (true, p_hourly_rate, p_utilities_cost, p_other_cost, p_target_margin, now())
  on conflict (id) do update set
    hourly_rate = excluded.hourly_rate,
    utilities_cost = excluded.utilities_cost,
    other_cost = excluded.other_cost,
    target_margin = excluded.target_margin,
    updated_at = now()
  returning * into v_settings;

  return v_settings;
end;
$$;

create or replace function sp_get_settings()
returns settings
language sql
stable
as $$
  select *
  from settings
  where id = true;
$$;

create or replace function sp_save_ingredient(
  p_name text,
  p_base_unit text,
  p_id uuid default null
)
returns ingredients
language plpgsql
as $$
declare
  v_ingredient ingredients;
begin
  if p_id is null then
    insert into ingredients (name, base_unit)
    values (trim(p_name), p_base_unit)
    returning * into v_ingredient;
  else
    update ingredients
    set name = trim(p_name),
        base_unit = p_base_unit,
        updated_at = now()
    where id = p_id
    returning * into v_ingredient;
  end if;

  return v_ingredient;
end;
$$;

create or replace function sp_list_ingredients()
returns table (
  id uuid,
  name text,
  base_unit text,
  latest_unit_price numeric,
  latest_purchase_date date
)
language sql
stable
as $$
  select
    i.id,
    i.name,
    i.base_unit,
    lp.total_price / nullif(sp_base_quantity(lp.quantity, lp.unit), 0) as latest_unit_price,
    lp.purchase_date as latest_purchase_date
  from ingredients i
  left join lateral (
    select p.*
    from purchases p
    where p.ingredient_id = i.id
    order by p.purchase_date desc, p.created_at desc
    limit 1
  ) lp on true
  order by i.name;
$$;

create or replace function sp_save_purchase(
  p_ingredient_id uuid,
  p_purchase_date date,
  p_quantity numeric,
  p_unit text,
  p_total_price numeric,
  p_notes text default null
)
returns purchases
language plpgsql
as $$
declare
  v_purchase purchases;
begin
  insert into purchases (
    ingredient_id,
    purchase_date,
    quantity,
    unit,
    total_price,
    notes
  )
  values (
    p_ingredient_id,
    p_purchase_date,
    p_quantity,
    p_unit,
    p_total_price,
    p_notes
  )
  returning * into v_purchase;

  return v_purchase;
end;
$$;

create or replace function sp_list_purchases(
  p_ingredient_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  id uuid,
  purchase_date date,
  ingredient_id uuid,
  ingredient_name text,
  quantity numeric,
  unit text,
  total_price numeric,
  unit_price numeric,
  notes text
)
language sql
stable
as $$
  select
    p.id,
    p.purchase_date,
    p.ingredient_id,
    i.name as ingredient_name,
    p.quantity,
    p.unit,
    p.total_price,
    p.total_price / nullif(sp_base_quantity(p.quantity, p.unit), 0) as unit_price,
    p.notes
  from purchases p
  join ingredients i on i.id = p.ingredient_id
  where (p_ingredient_id is null or p.ingredient_id = p_ingredient_id)
    and (p_from is null or p.purchase_date >= p_from)
    and (p_to is null or p.purchase_date <= p_to)
  order by p.purchase_date desc, p.created_at desc;
$$;

create or replace function sp_save_recipe(
  p_name text,
  p_servings integer,
  p_labor_hours numeric default 0,
  p_id uuid default null
)
returns recipes
language plpgsql
as $$
declare
  v_recipe recipes;
begin
  if p_id is null then
    insert into recipes (name, servings, labor_hours)
    values (trim(p_name), p_servings, coalesce(p_labor_hours, 0))
    returning * into v_recipe;
  else
    update recipes
    set name = trim(p_name),
        servings = p_servings,
        labor_hours = coalesce(p_labor_hours, 0),
        updated_at = now()
    where id = p_id
    returning * into v_recipe;
  end if;

  return v_recipe;
end;
$$;

create or replace function sp_replace_recipe_ingredients(
  p_recipe_id uuid,
  p_items jsonb
)
returns table (
  id uuid,
  recipe_id uuid,
  ingredient_id uuid,
  quantity numeric,
  unit text
)
language plpgsql
as $$
begin
  delete from recipe_ingredients
  where recipe_ingredients.recipe_id = p_recipe_id;

  insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
  select
    p_recipe_id,
    (item->>'ingredient_id')::uuid,
    (item->>'quantity')::numeric,
    item->>'unit'
  from jsonb_array_elements(p_items) as item;

  return query
  select
    ri.id,
    ri.recipe_id,
    ri.ingredient_id,
    ri.quantity,
    ri.unit
  from recipe_ingredients ri
  where ri.recipe_id = p_recipe_id
  order by ri.id;
end;
$$;

create or replace function sp_list_recipes()
returns table (
  id uuid,
  name text,
  servings integer,
  labor_hours numeric,
  active boolean,
  ingredients jsonb
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    r.servings,
    r.labor_hours,
    r.active,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'recipe_ingredient_id', ri.id,
          'ingredient_id', i.id,
          'ingredient_name', i.name,
          'quantity', ri.quantity,
          'unit', ri.unit
        )
        order by i.name
      ) filter (where ri.id is not null),
      '[]'::jsonb
    ) as ingredients
  from recipes r
  left join recipe_ingredients ri on ri.recipe_id = r.id
  left join ingredients i on i.id = ri.ingredient_id
  where r.active = true
  group by r.id
  order by r.name;
$$;

create or replace function sp_calculate_recipe_cost(
  p_recipe_id uuid,
  p_target_servings integer default null,
  p_labor_hours numeric default null,
  p_hourly_rate numeric default null,
  p_utilities_cost numeric default null,
  p_other_cost numeric default null,
  p_target_margin numeric default null
)
returns table (
  recipe_id uuid,
  recipe_name text,
  base_servings integer,
  target_servings integer,
  ingredient_cost numeric,
  labor_cost numeric,
  overhead_cost numeric,
  total_cost numeric,
  cost_per_serving numeric,
  suggested_price numeric
)
language sql
stable
as $$
  with cfg as (
    select
      coalesce(p_hourly_rate, s.hourly_rate) as hourly_rate,
      coalesce(p_utilities_cost, s.utilities_cost) as utilities_cost,
      coalesce(p_other_cost, s.other_cost) as other_cost,
      coalesce(p_target_margin, s.target_margin) as target_margin
    from settings s
    where s.id = true
  ),
  recipe_data as (
    select
      r.*,
      coalesce(p_target_servings, r.servings) as target_servings,
      coalesce(p_labor_hours, r.labor_hours) as labor_hours
    from recipes r
    where r.id = p_recipe_id
  ),
  latest_prices as (
    select distinct on (p.ingredient_id)
      p.ingredient_id,
      p.total_price / nullif(sp_base_quantity(p.quantity, p.unit), 0) as unit_price
    from purchases p
    order by p.ingredient_id, p.purchase_date desc, p.created_at desc
  ),
  ingredient_total as (
    select
      rd.id as recipe_id,
      coalesce(sum(
        coalesce(lp.unit_price, 0)
        * sp_base_quantity(ri.quantity, ri.unit)
        * (rd.target_servings::numeric / rd.servings::numeric)
      ), 0) as ingredient_cost
    from recipe_data rd
    left join recipe_ingredients ri on ri.recipe_id = rd.id
    left join latest_prices lp on lp.ingredient_id = ri.ingredient_id
    group by rd.id
  ),
  totals as (
    select
      rd.id as recipe_id,
      rd.name as recipe_name,
      rd.servings as base_servings,
      rd.target_servings,
      it.ingredient_cost,
      rd.labor_hours * cfg.hourly_rate as labor_cost,
      cfg.utilities_cost + cfg.other_cost as overhead_cost,
      it.ingredient_cost + (rd.labor_hours * cfg.hourly_rate) + cfg.utilities_cost + cfg.other_cost as total_cost,
      cfg.target_margin
    from recipe_data rd
    cross join cfg
    join ingredient_total it on it.recipe_id = rd.id
  )
  select
    t.recipe_id,
    t.recipe_name,
    t.base_servings,
    t.target_servings,
    round(t.ingredient_cost, 2) as ingredient_cost,
    round(t.labor_cost, 2) as labor_cost,
    round(t.overhead_cost, 2) as overhead_cost,
    round(t.total_cost, 2) as total_cost,
    round(t.total_cost / nullif(t.target_servings, 0), 2) as cost_per_serving,
    round(
      case
        when t.target_margin >= 100 then t.total_cost
        else t.total_cost / (1 - (t.target_margin / 100))
      end,
      2
    ) as suggested_price
  from totals t;
$$;

create or replace function sp_recipe_cost_summary()
returns table (
  recipe_id uuid,
  recipe_name text,
  servings integer,
  ingredient_cost numeric
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    r.servings,
    coalesce(sum(
      coalesce(lp.unit_price, 0) * sp_base_quantity(ri.quantity, ri.unit)
    ), 0) as ingredient_cost
  from recipes r
  left join recipe_ingredients ri on ri.recipe_id = r.id
  left join lateral (
    select p.total_price / nullif(sp_base_quantity(p.quantity, p.unit), 0) as unit_price
    from purchases p
    where p.ingredient_id = ri.ingredient_id
    order by p.purchase_date desc, p.created_at desc
    limit 1
  ) lp on true
  where r.active = true
  group by r.id
  order by r.name;
$$;

create or replace function sp_delete_recipe(p_recipe_id uuid)
returns void
language sql
as $$
  update recipes
  set active = false,
      updated_at = now()
  where id = p_recipe_id;
$$;

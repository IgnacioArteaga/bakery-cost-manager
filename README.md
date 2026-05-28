# bakery-cost-manager

Aplicacion personal para registrar compras de pasteleria, mantener historico de precios por medida, crear recetas y calcular costos con mano de obra, gastos y margen.

## Local

```bash
python -m http.server 5173
```

Abrir:

```txt
http://localhost:5173/index.html
```

## Supabase

1. Ejecutar `SP.sql` completo en Supabase SQL Editor.
2. Crear cuenta desde la app.
3. Para hacer admin a un usuario, copiar su `id` desde `Authentication > Users` y ejecutar:

```sql
insert into app_admins (user_id)
values ('USER_ID_AQUI')
on conflict (user_id) do nothing;
```

## Deploy

Publicar el repositorio en Vercel como proyecto estatico. No requiere build command ni output directory especial.

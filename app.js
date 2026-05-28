import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

const demoData = {
  settings: {
    hourlyRate: 4500,
    utilities: 1800,
    otherCosts: 1200,
    margin: 35
  },
  ingredients: [
    { name: "Harina sin polvos", baseUnit: "g" },
    { name: "Azucar granulada", baseUnit: "g" },
    { name: "Huevo", baseUnit: "unidad" },
    { name: "Mantequilla", baseUnit: "g" },
    { name: "Leche", baseUnit: "ml" },
    { name: "Cacao amargo", baseUnit: "g" }
  ],
  purchases: [
    { ingredient: "Harina sin polvos", date: "2026-05-01", quantity: 1, unit: "kg", price: 1350 },
    { ingredient: "Azucar granulada", date: "2026-05-02", quantity: 1, unit: "kg", price: 1190 },
    { ingredient: "Huevo", date: "2026-05-03", quantity: 30, unit: "unidad", price: 7200 },
    { ingredient: "Mantequilla", date: "2026-05-06", quantity: 250, unit: "g", price: 2590 },
    { ingredient: "Leche", date: "2026-05-08", quantity: 1, unit: "l", price: 1150 },
    { ingredient: "Cacao amargo", date: "2026-05-10", quantity: 180, unit: "g", price: 3290 }
  ],
  recipes: [
    {
      name: "Brownie familiar",
      servings: 10,
      laborHours: 3,
      items: [
        { ingredient: "Harina sin polvos", quantity: 180, unit: "g" },
        { ingredient: "Azucar granulada", quantity: 260, unit: "g" },
        { ingredient: "Huevo", quantity: 4, unit: "unidad" },
        { ingredient: "Mantequilla", quantity: 180, unit: "g" },
        { ingredient: "Cacao amargo", quantity: 70, unit: "g" }
      ]
    },
    {
      name: "Queque vainilla",
      servings: 12,
      laborHours: 2.5,
      items: [
        { ingredient: "Harina sin polvos", quantity: 320, unit: "g" },
        { ingredient: "Azucar granulada", quantity: 220, unit: "g" },
        { ingredient: "Huevo", quantity: 3, unit: "unidad" },
        { ingredient: "Leche", quantity: 200, unit: "ml" },
        { ingredient: "Mantequilla", quantity: 125, unit: "g" }
      ]
    }
  ]
};

let state = {
  session: null,
  isAdmin: false,
  adminUsers: [],
  adminDetail: null,
  settings: {
    hourlyRate: 0,
    utilities: 0,
    otherCosts: 0,
    margin: 0
  },
  ingredients: [],
  purchases: [],
  recipes: [],
  recipeCosts: []
};

const views = {
  dashboard: "Resumen",
  purchases: "Compras",
  ingredients: "Ingredientes",
  recipes: "Recetas",
  costing: "Costeo",
  settings: "Costos fijos",
  admin: "Administracion"
};

const els = {
  authForm: document.querySelector("#authForm"),
  authMessage: document.querySelector("#authMessage"),
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  viewTitle: document.querySelector("#viewTitle"),
  seedDataBtn: document.querySelector("#seedDataBtn"),
  signOutBtn: document.querySelector("#signOutBtn"),
  refreshAdminBtn: document.querySelector("#refreshAdminBtn"),
  adminUserRows: document.querySelector("#adminUserRows"),
  adminDetail: document.querySelector("#adminDetail"),
  purchaseForm: document.querySelector("#purchaseForm"),
  ingredientForm: document.querySelector("#ingredientForm"),
  recipeForm: document.querySelector("#recipeForm"),
  settingsForm: document.querySelector("#settingsForm"),
  costForm: document.querySelector("#costForm"),
  recipeIngredientLines: document.querySelector("#recipeIngredientLines"),
  addRecipeLine: document.querySelector("#addRecipeLine"),
  costRecipeSelect: document.querySelector("#costRecipeSelect")
};

function unitLabel(unit) {
  return unit === "unidad" ? "unid." : unit;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function baseQuantity(quantity, unit) {
  if (unit === "kg" || unit === "l") return Number(quantity) * 1000;
  return Number(quantity);
}

function ingredientById(id) {
  return state.ingredients.find((item) => item.id === id);
}

function ingredientByName(name) {
  return state.ingredients.find((item) => item.name.toLowerCase() === name.toLowerCase());
}

function latestUnitCost(ingredientId) {
  const ingredient = ingredientById(ingredientId);
  if (Number(ingredient?.latestUnitPrice) > 0) return Number(ingredient.latestUnitPrice);

  const latest = state.purchases
    .filter((purchase) => purchase.ingredientId === ingredientId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  return latest ? Number(latest.unitPrice) : 0;
}

function recipeIngredientCost(recipe, targetServings = recipe.servings) {
  const multiplier = Number(targetServings) / Number(recipe.servings);
  return recipe.items.reduce((total, item) => {
    const cost = latestUnitCost(item.ingredientId);
    return total + cost * baseQuantity(item.quantity, item.unit) * multiplier;
  }, 0);
}

function mapSettings(row) {
  return row
    ? {
        hourlyRate: Number(row.hourly_rate),
        utilities: Number(row.utilities_cost),
        otherCosts: Number(row.other_cost),
        margin: Number(row.target_margin)
      }
    : { ...demoData.settings };
}

function mapIngredient(row) {
  return {
    id: row.id,
    name: row.name,
    baseUnit: row.base_unit,
    latestUnitPrice: Number(row.latest_unit_price ?? 0),
    latestPurchaseDate: row.latest_purchase_date
  };
}

function mapPurchase(row) {
  return {
    id: row.id,
    date: row.purchase_date,
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    quantity: Number(row.quantity),
    unit: row.unit,
    price: Number(row.total_price),
    unitPrice: Number(row.unit_price ?? 0),
    notes: row.notes
  };
}

function mapRecipe(row) {
  return {
    id: row.id,
    name: row.name,
    servings: Number(row.servings),
    laborHours: Number(row.labor_hours ?? 0),
    active: row.active,
    items: (row.ingredients ?? []).map((item) => ({
      recipeIngredientId: item.recipe_ingredient_id,
      ingredientId: item.ingredient_id,
      ingredientName: item.ingredient_name,
      quantity: Number(item.quantity),
      unit: item.unit
    }))
  };
}

function setBusy(button, busyText) {
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  return () => {
    button.disabled = false;
    button.textContent = oldText;
  };
}

function showAuthMessage(message) {
  els.authMessage.textContent = message ?? "";
}

function handleError(error, fallback = "Ocurrio un error.") {
  console.error(error);
  alert(error?.message ?? fallback);
}

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

async function ensureSettings() {
  const current = await rpc("sp_get_settings");
  if (current) return mapSettings(current);

  const saved = await rpc("sp_upsert_app_settings", {
    p_hourly_rate: demoData.settings.hourlyRate,
    p_utilities_cost: demoData.settings.utilities,
    p_other_cost: demoData.settings.otherCosts,
    p_target_margin: demoData.settings.margin
  });
  return mapSettings(saved);
}

async function loadData() {
  state.isAdmin = await rpc("sp_is_admin");
  document.body.classList.toggle("is-admin", state.isAdmin);

  state.settings = await ensureSettings();
  const [ingredients, purchases, recipes, recipeCosts] = await Promise.all([
    rpc("sp_list_ingredients"),
    rpc("sp_list_purchases"),
    rpc("sp_list_recipes"),
    rpc("sp_recipe_cost_summary")
  ]);

  state.ingredients = ingredients.map(mapIngredient);
  state.purchases = purchases.map(mapPurchase);
  state.recipes = recipes.map(mapRecipe);
  state.recipeCosts = recipeCosts.map((item) => ({
    recipeId: item.recipe_id,
    recipeName: item.recipe_name,
    servings: Number(item.servings),
    ingredientCost: Number(item.ingredient_cost)
  }));
}

function setView(viewName) {
  if (viewName === "admin" && !state.isAdmin) return;
  els.navItems.forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewName));
  els.viewTitle.textContent = views[viewName];

  if (viewName === "admin") {
    loadAdminOverview().catch((error) => handleError(error, "No se pudo cargar la vista administrador."));
  }
}

function fillIngredientOptions() {
  const options = state.ingredients
    .map((ingredient) => `<option value="${ingredient.id}">${ingredient.name}</option>`)
    .join("");

  document.querySelectorAll('select[name="ingredientId"]').forEach((select) => {
    const current = select.value;
    select.innerHTML = options;
    if (current) select.value = current;
  });

  els.costRecipeSelect.innerHTML = state.recipes
    .map((recipe) => `<option value="${recipe.id}">${recipe.name}</option>`)
    .join("");
}

function renderDashboard() {
  document.querySelector("#metricIngredients").textContent = state.ingredients.length;
  document.querySelector("#metricRecipes").textContent = state.recipes.length;
  document.querySelector("#metricPurchases").textContent = state.purchases.length;

  const mostExpensive = state.recipeCosts.length
    ? Math.max(...state.recipeCosts.map((recipe) => recipe.ingredientCost))
    : 0;
  document.querySelector("#metricExpensive").textContent = money.format(mostExpensive);

  const recentRows = [...state.purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map((purchase) => `
      <tr>
        <td>${purchase.date}</td>
        <td>${purchase.ingredientName}</td>
        <td>${purchase.quantity} ${unitLabel(purchase.unit)}</td>
        <td class="num">${money.format(purchase.unitPrice)} / ${unitLabel(ingredientById(purchase.ingredientId)?.baseUnit ?? purchase.unit)}</td>
      </tr>
    `)
    .join("");

  document.querySelector("#recentPurchases").innerHTML = recentRows || `<tr><td colspan="4">Sin compras todavia.</td></tr>`;

  document.querySelector("#recipeCostList").innerHTML = state.recipeCosts.map((recipe) => `
    <article class="item">
      <div class="item-header">
        <strong>${recipe.recipeName}</strong>
        <strong>${money.format(recipe.ingredientCost)}</strong>
      </div>
      <span class="item-meta">${recipe.servings} porciones, solo ingredientes</span>
    </article>
  `).join("") || `<p class="empty">Agrega una receta para verla aca.</p>`;
}

function renderPurchases() {
  const rows = [...state.purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((purchase) => `
      <tr>
        <td>${purchase.date}</td>
        <td>${purchase.ingredientName}</td>
        <td>${purchase.quantity} ${unitLabel(purchase.unit)} por ${money.format(purchase.price)}</td>
        <td class="num">${money.format(purchase.unitPrice)} / ${unitLabel(ingredientById(purchase.ingredientId)?.baseUnit ?? purchase.unit)}</td>
      </tr>
    `)
    .join("");

  document.querySelector("#purchaseRows").innerHTML = rows || `<tr><td colspan="4">Sin compras registradas.</td></tr>`;
}

function renderIngredients() {
  document.querySelector("#ingredientCards").innerHTML = state.ingredients.map((ingredient) => `
    <article class="ingredient-card">
      <strong>${ingredient.name}</strong>
      <span>Unidad base: ${unitLabel(ingredient.baseUnit)}</span>
      <span>Ultimo precio: ${ingredient.latestUnitPrice ? `${money.format(ingredient.latestUnitPrice)} / ${unitLabel(ingredient.baseUnit)}` : "sin compras"}</span>
    </article>
  `).join("") || `<p class="empty">Agrega ingredientes para comenzar.</p>`;
}

function recipeLineTemplate(line = {}) {
  const id = line.ingredientId ?? state.ingredients[0]?.id ?? "";
  const unit = line.unit ?? ingredientById(id)?.baseUnit ?? "g";
  return `
    <div class="line-grid recipe-line">
      <label>
        Ingrediente
        <select name="ingredientId" required>${state.ingredients.map((ingredient) => `
          <option value="${ingredient.id}" ${ingredient.id === id ? "selected" : ""}>${ingredient.name}</option>
        `).join("")}</select>
      </label>
      <label>
        Cantidad
        <input name="quantity" type="number" min="0.01" step="0.01" value="${line.quantity ?? 100}" required>
      </label>
      <label>
        Unidad
        <select name="unit" required>
          ${["g", "kg", "ml", "l", "unidad"].map((item) => `
            <option value="${item}" ${item === unit ? "selected" : ""}>${unitLabel(item)}</option>
          `).join("")}
        </select>
      </label>
      <button class="remove-line" type="button" aria-label="Quitar ingrediente">x</button>
    </div>
  `;
}

function addRecipeLine(line) {
  els.recipeIngredientLines.insertAdjacentHTML("beforeend", recipeLineTemplate(line));
}

function renderRecipes() {
  document.querySelector("#recipeCards").innerHTML = state.recipes.map((recipe) => {
    const ingredientCost = state.recipeCosts.find((item) => item.recipeId === recipe.id)?.ingredientCost ?? recipeIngredientCost(recipe);
    const items = recipe.items.map((item) => `${item.ingredientName}: ${item.quantity} ${unitLabel(item.unit)}`).join(", ");

    return `
      <article class="item">
        <div class="item-header">
          <strong>${recipe.name}</strong>
          <strong>${money.format(ingredientCost)}</strong>
        </div>
        <p class="item-meta">${recipe.servings} porciones</p>
        <p>${items}</p>
      </article>
    `;
  }).join("") || `<p class="empty">Todavia no hay recetas.</p>`;
}

async function renderCosting() {
  if (!state.recipes.length) {
    document.querySelector("#costIngredients").textContent = money.format(0);
    document.querySelector("#costLabor").textContent = money.format(0);
    document.querySelector("#costOverhead").textContent = money.format(0);
    document.querySelector("#costTotal").textContent = money.format(0);
    document.querySelector("#costPerServing").textContent = money.format(0);
    document.querySelector("#costSuggested").textContent = money.format(0);
    return;
  }

  const recipe = state.recipes.find((item) => item.id === els.costRecipeSelect.value) ?? state.recipes[0];
  els.costRecipeSelect.value = recipe.id;

  const values = Object.fromEntries(new FormData(els.costForm).entries());
  const targetServings = Number(values.targetServings) || recipe.servings;
  const [result] = await rpc("sp_calculate_recipe_cost", {
    p_recipe_id: recipe.id,
    p_target_servings: targetServings,
    p_labor_hours: Number(values.laborHours),
    p_hourly_rate: Number(values.hourlyRate),
    p_utilities_cost: Number(values.utilities),
    p_other_cost: Number(values.otherCosts),
    p_target_margin: Number(values.margin)
  });

  document.querySelector("#costIngredients").textContent = money.format(Number(result?.ingredient_cost ?? 0));
  document.querySelector("#costLabor").textContent = money.format(Number(result?.labor_cost ?? 0));
  document.querySelector("#costOverhead").textContent = money.format(Number(result?.overhead_cost ?? 0));
  document.querySelector("#costTotal").textContent = money.format(Number(result?.total_cost ?? 0));
  document.querySelector("#costPerServing").textContent = money.format(Number(result?.cost_per_serving ?? 0));
  document.querySelector("#costSuggested").textContent = money.format(Number(result?.suggested_price ?? 0));
}

function renderSettings() {
  els.settingsForm.elements.hourlyRate.value = state.settings.hourlyRate;
  els.settingsForm.elements.utilities.value = state.settings.utilities;
  els.settingsForm.elements.otherCosts.value = state.settings.otherCosts;
  els.settingsForm.elements.margin.value = state.settings.margin;
}

async function loadAdminOverview() {
  if (!state.isAdmin) return;
  state.adminUsers = await rpc("sp_admin_overview");
  renderAdminOverview();
}

async function loadAdminDetail(userId) {
  if (!state.isAdmin) return;
  state.adminDetail = await rpc("sp_admin_user_details", { p_user_id: userId });
  renderAdminOverview(userId);
  renderAdminDetail();
}

function renderAdminOverview(activeUserId) {
  if (!els.adminUserRows) return;

  els.adminUserRows.innerHTML = state.adminUsers.map((user) => `
    <tr class="admin-user-row ${user.user_id === activeUserId ? "active" : ""}" data-user-id="${user.user_id}">
      <td>
        <strong>${escapeHtml(user.email)}</strong>
        <div class="item-meta">${escapeHtml(user.created_at?.slice(0, 10) ?? "")}</div>
      </td>
      <td class="num">${Number(user.purchase_count ?? 0)}</td>
      <td class="num">${Number(user.recipe_count ?? 0)}</td>
      <td class="num">${money.format(Number(user.total_purchase_amount ?? 0))}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">No hay usuarios registrados.</td></tr>`;
}

function renderAdminDetail() {
  const detail = state.adminDetail;
  if (!els.adminDetail || !detail) return;

  const purchases = detail.purchases ?? [];
  const recipes = detail.recipes ?? [];
  const ingredients = detail.ingredients ?? [];
  const settings = detail.settings;

  els.adminDetail.innerHTML = `
    <article class="item">
      <div class="item-header">
        <strong>${escapeHtml(detail.user?.email)}</strong>
        <span class="item-meta">${escapeHtml(detail.user?.created_at?.slice(0, 10) ?? "")}</span>
      </div>
      <p class="item-meta">Ultimo acceso: ${escapeHtml(detail.user?.last_sign_in_at?.slice(0, 10) ?? "sin registro")}</p>
    </article>

    <section class="detail-section">
      <h3>Parametros</h3>
      <div class="pill-list">
        <span class="pill">Hora: ${money.format(Number(settings?.hourly_rate ?? 0))}</span>
        <span class="pill">Gastos: ${money.format(Number(settings?.utilities_cost ?? 0) + Number(settings?.other_cost ?? 0))}</span>
        <span class="pill">Margen: ${Number(settings?.target_margin ?? 0)}%</span>
      </div>
    </section>

    <section class="detail-section">
      <h3>Ingredientes</h3>
      <div class="pill-list">
        ${ingredients.map((item) => `<span class="pill">${escapeHtml(item.name)} - ${unitLabel(item.base_unit)}</span>`).join("") || `<span class="item-meta">Sin ingredientes.</span>`}
      </div>
    </section>

    <section class="detail-section">
      <h3>Ultimas compras</h3>
      ${purchases.slice(0, 8).map((purchase) => `
        <article class="item">
          <div class="item-header">
            <strong>${escapeHtml(purchase.ingredient_name)}</strong>
            <strong>${money.format(Number(purchase.total_price ?? 0))}</strong>
          </div>
          <span class="item-meta">${escapeHtml(purchase.purchase_date)} - ${Number(purchase.quantity)} ${unitLabel(purchase.unit)}</span>
        </article>
      `).join("") || `<p class="empty">Sin compras.</p>`}
    </section>

    <section class="detail-section">
      <h3>Recetas</h3>
      ${recipes.map((recipe) => `
        <article class="item">
          <div class="item-header">
            <strong>${escapeHtml(recipe.name)}</strong>
            <span class="item-meta">${Number(recipe.servings)} porciones</span>
          </div>
          <p>${(recipe.ingredients ?? []).map((item) => `${escapeHtml(item.ingredient_name)}: ${Number(item.quantity)} ${unitLabel(item.unit)}`).join(", ") || "Sin ingredientes."}</p>
        </article>
      `).join("") || `<p class="empty">Sin recetas.</p>`}
    </section>
  `;
}

function setCostDefaults() {
  const recipe = state.recipes[0];
  els.costForm.elements.targetServings.value = recipe?.servings ?? 10;
  els.costForm.elements.laborHours.value = recipe?.laborHours ?? 3;
  els.costForm.elements.hourlyRate.value = state.settings.hourlyRate;
  els.costForm.elements.utilities.value = state.settings.utilities;
  els.costForm.elements.otherCosts.value = state.settings.otherCosts;
  els.costForm.elements.margin.value = state.settings.margin;
}

async function renderAll() {
  fillIngredientOptions();
  renderDashboard();
  renderPurchases();
  renderIngredients();
  renderRecipes();
  renderSettings();
  await renderCosting();
}

async function refresh() {
  await loadData();
  if (!els.recipeIngredientLines.children.length) addRecipeLine();
  setCostDefaults();
  await renderAll();
}

async function loadDemoData() {
  await rpc("sp_upsert_app_settings", {
    p_hourly_rate: demoData.settings.hourlyRate,
    p_utilities_cost: demoData.settings.utilities,
    p_other_cost: demoData.settings.otherCosts,
    p_target_margin: demoData.settings.margin
  });

  await loadData();
  for (const ingredient of demoData.ingredients) {
    if (!ingredientByName(ingredient.name)) {
      await rpc("sp_save_ingredient", {
        p_name: ingredient.name,
        p_base_unit: ingredient.baseUnit
      });
    }
  }

  await loadData();
  for (const purchase of demoData.purchases) {
    const ingredient = ingredientByName(purchase.ingredient);
    await rpc("sp_save_purchase", {
      p_ingredient_id: ingredient.id,
      p_purchase_date: purchase.date,
      p_quantity: purchase.quantity,
      p_unit: purchase.unit,
      p_total_price: purchase.price
    });
  }

  await loadData();
  for (const recipe of demoData.recipes) {
    if (state.recipes.some((item) => item.name.toLowerCase() === recipe.name.toLowerCase())) continue;

    const savedRecipe = await rpc("sp_save_recipe", {
      p_name: recipe.name,
      p_servings: recipe.servings,
      p_labor_hours: recipe.laborHours
    });

    const items = recipe.items.map((item) => ({
      ingredient_id: ingredientByName(item.ingredient).id,
      quantity: item.quantity,
      unit: item.unit
    }));

    await rpc("sp_replace_recipe_ingredients", {
      p_recipe_id: savedRecipe.id,
      p_items: items
    });
  }

  await refresh();
}

els.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const release = setBusy(submitter, submitter.value === "signup" ? "Creando..." : "Entrando...");
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());

  try {
    const response = submitter.value === "signup"
      ? await supabase.auth.signUp({ email: data.email, password: data.password })
      : await supabase.auth.signInWithPassword({ email: data.email, password: data.password });

    if (response.error) throw response.error;
    if (!response.data.session) {
      showAuthMessage("Cuenta creada. Revisa tu correo si Supabase pide confirmacion.");
      return;
    }

    state.session = response.data.session;
    document.body.classList.add("authenticated");
    showAuthMessage("");
    await refresh();
  } catch (error) {
    showAuthMessage(error.message);
  } finally {
    release();
  }
});

els.signOutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  state.session = null;
  state.isAdmin = false;
  document.body.classList.remove("authenticated");
  document.body.classList.remove("is-admin");
  setView("dashboard");
});

els.navItems.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.jump));
});

els.refreshAdminBtn.addEventListener("click", async () => {
  const release = setBusy(els.refreshAdminBtn, "Actualizando...");
  try {
    await loadAdminOverview();
  } catch (error) {
    handleError(error, "No se pudo actualizar la vista administrador.");
  } finally {
    release();
  }
});

els.adminUserRows.addEventListener("click", async (event) => {
  const row = event.target.closest(".admin-user-row");
  if (!row) return;

  try {
    await loadAdminDetail(row.dataset.userId);
  } catch (error) {
    handleError(error, "No se pudo cargar el detalle del usuario.");
  }
});

els.seedDataBtn.addEventListener("click", async () => {
  const release = setBusy(els.seedDataBtn, "Cargando...");
  try {
    await loadDemoData();
  } catch (error) {
    handleError(error, "No se pudo cargar la demo.");
  } finally {
    release();
  }
});

els.ingredientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const release = setBusy(button, "Guardando...");
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());

  try {
    await rpc("sp_save_ingredient", {
      p_name: data.name.trim(),
      p_base_unit: data.baseUnit
    });
    event.currentTarget.reset();
    await refresh();
  } catch (error) {
    handleError(error, "No se pudo guardar el ingrediente.");
  } finally {
    release();
  }
});

els.purchaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const release = setBusy(button, "Guardando...");
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());

  try {
    await rpc("sp_save_purchase", {
      p_ingredient_id: data.ingredientId,
      p_purchase_date: data.date,
      p_quantity: Number(data.quantity),
      p_unit: data.unit,
      p_total_price: Number(data.price)
    });
    event.currentTarget.reset();
    event.currentTarget.elements.date.valueAsDate = new Date();
    await refresh();
  } catch (error) {
    handleError(error, "No se pudo guardar la compra.");
  } finally {
    release();
  }
});

els.addRecipeLine.addEventListener("click", () => addRecipeLine());

els.recipeIngredientLines.addEventListener("click", (event) => {
  if (!event.target.matches(".remove-line")) return;
  event.target.closest(".recipe-line").remove();
});

els.recipeIngredientLines.addEventListener("change", (event) => {
  if (!event.target.matches('select[name="ingredientId"]')) return;
  const line = event.target.closest(".recipe-line");
  const unitSelect = line.querySelector('select[name="unit"]');
  const ingredient = ingredientById(event.target.value);
  if (ingredient) unitSelect.value = ingredient.baseUnit;
});

els.recipeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const release = setBusy(button, "Guardando...");
  const data = Object.fromEntries(new FormData(form).entries());
  const lines = [...form.querySelectorAll(".recipe-line")].map((line) => ({
    ingredient_id: line.querySelector('select[name="ingredientId"]').value,
    quantity: Number(line.querySelector('input[name="quantity"]').value),
    unit: line.querySelector('select[name="unit"]').value
  }));

  try {
    if (!lines.length) throw new Error("Agrega al menos un ingrediente.");
    const recipe = await rpc("sp_save_recipe", {
      p_name: data.name.trim(),
      p_servings: Number(data.servings),
      p_labor_hours: 0
    });
    await rpc("sp_replace_recipe_ingredients", {
      p_recipe_id: recipe.id,
      p_items: lines
    });
    form.reset();
    els.recipeIngredientLines.innerHTML = "";
    await refresh();
  } catch (error) {
    handleError(error, "No se pudo guardar la receta.");
  } finally {
    release();
  }
});

els.costForm.addEventListener("input", () => {
  renderCosting().catch((error) => handleError(error, "No se pudo calcular el costo."));
});

els.costRecipeSelect.addEventListener("change", () => {
  const recipe = state.recipes.find((item) => item.id === els.costRecipeSelect.value);
  if (recipe) {
    els.costForm.elements.targetServings.value = recipe.servings;
    els.costForm.elements.laborHours.value = recipe.laborHours || 3;
  }
  renderCosting().catch((error) => handleError(error, "No se pudo calcular el costo."));
});

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const release = setBusy(button, "Guardando...");
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());

  try {
    await rpc("sp_upsert_app_settings", {
      p_hourly_rate: Number(data.hourlyRate),
      p_utilities_cost: Number(data.utilities),
      p_other_cost: Number(data.otherCosts),
      p_target_margin: Number(data.margin)
    });
    await refresh();
  } catch (error) {
    handleError(error, "No se pudieron guardar los parametros.");
  } finally {
    release();
  }
});

els.purchaseForm.elements.date.valueAsDate = new Date();

const { data } = await supabase.auth.getSession();
state.session = data.session;

if (state.session) {
  document.body.classList.add("authenticated");
  try {
    await refresh();
  } catch (error) {
    handleError(error, "No se pudo cargar la informacion.");
  }
}

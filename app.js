const storageKey = "pasteleria-costos-v1";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

const demoState = {
  settings: {
    hourlyRate: 4500,
    utilities: 1800,
    otherCosts: 1200,
    margin: 35
  },
  ingredients: [
    { id: "ing-harina", name: "Harina sin polvos", baseUnit: "g" },
    { id: "ing-azucar", name: "Azucar granulada", baseUnit: "g" },
    { id: "ing-huevo", name: "Huevo", baseUnit: "unidad" },
    { id: "ing-mantequilla", name: "Mantequilla", baseUnit: "g" },
    { id: "ing-leche", name: "Leche", baseUnit: "ml" },
    { id: "ing-cacao", name: "Cacao amargo", baseUnit: "g" }
  ],
  purchases: [
    { id: "buy-1", ingredientId: "ing-harina", date: "2026-05-01", quantity: 1, unit: "kg", price: 1350 },
    { id: "buy-2", ingredientId: "ing-azucar", date: "2026-05-02", quantity: 1, unit: "kg", price: 1190 },
    { id: "buy-3", ingredientId: "ing-huevo", date: "2026-05-03", quantity: 30, unit: "unidad", price: 7200 },
    { id: "buy-4", ingredientId: "ing-mantequilla", date: "2026-05-06", quantity: 250, unit: "g", price: 2590 },
    { id: "buy-5", ingredientId: "ing-leche", date: "2026-05-08", quantity: 1, unit: "l", price: 1150 },
    { id: "buy-6", ingredientId: "ing-cacao", date: "2026-05-10", quantity: 180, unit: "g", price: 3290 }
  ],
  recipes: [
    {
      id: "rec-brownie",
      name: "Brownie familiar",
      servings: 10,
      items: [
        { ingredientId: "ing-harina", quantity: 180, unit: "g" },
        { ingredientId: "ing-azucar", quantity: 260, unit: "g" },
        { ingredientId: "ing-huevo", quantity: 4, unit: "unidad" },
        { ingredientId: "ing-mantequilla", quantity: 180, unit: "g" },
        { ingredientId: "ing-cacao", quantity: 70, unit: "g" }
      ]
    },
    {
      id: "rec-queque",
      name: "Queque vainilla",
      servings: 12,
      items: [
        { ingredientId: "ing-harina", quantity: 320, unit: "g" },
        { ingredientId: "ing-azucar", quantity: 220, unit: "g" },
        { ingredientId: "ing-huevo", quantity: 3, unit: "unidad" },
        { ingredientId: "ing-leche", quantity: 200, unit: "ml" },
        { ingredientId: "ing-mantequilla", quantity: 125, unit: "g" }
      ]
    }
  ]
};

let state = loadState();

const views = {
  dashboard: "Resumen",
  purchases: "Compras",
  ingredients: "Ingredientes",
  recipes: "Recetas",
  costing: "Costeo",
  settings: "Costos fijos"
};

const els = {
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  viewTitle: document.querySelector("#viewTitle"),
  seedDataBtn: document.querySelector("#seedDataBtn"),
  purchaseForm: document.querySelector("#purchaseForm"),
  ingredientForm: document.querySelector("#ingredientForm"),
  recipeForm: document.querySelector("#recipeForm"),
  settingsForm: document.querySelector("#settingsForm"),
  costForm: document.querySelector("#costForm"),
  recipeIngredientLines: document.querySelector("#recipeIngredientLines"),
  addRecipeLine: document.querySelector("#addRecipeLine"),
  costRecipeSelect: document.querySelector("#costRecipeSelect")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  return saved ? JSON.parse(saved) : structuredClone(demoState);
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function baseQuantity(quantity, unit) {
  if (unit === "kg" || unit === "l") return Number(quantity) * 1000;
  return Number(quantity);
}

function unitLabel(unit) {
  return unit === "unidad" ? "unid." : unit;
}

function ingredientById(id) {
  return state.ingredients.find((item) => item.id === id);
}

function latestUnitCost(ingredientId) {
  const purchases = state.purchases
    .filter((purchase) => purchase.ingredientId === ingredientId)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!purchases.length) return 0;
  const latest = purchases[0];
  return latest.price / baseQuantity(latest.quantity, latest.unit);
}

function recipeIngredientCost(recipe, targetServings = recipe.servings) {
  const multiplier = Number(targetServings) / Number(recipe.servings);
  return recipe.items.reduce((total, item) => {
    const cost = latestUnitCost(item.ingredientId);
    return total + cost * baseQuantity(item.quantity, item.unit) * multiplier;
  }, 0);
}

function totalRecipeCost(recipe, targetServings, options) {
  const ingredients = recipeIngredientCost(recipe, targetServings);
  const labor = Number(options.laborHours) * Number(options.hourlyRate);
  const overhead = Number(options.utilities) + Number(options.otherCosts);
  const total = ingredients + labor + overhead;
  const margin = Number(options.margin) / 100;
  const suggested = margin >= 1 ? total : total / (1 - margin);

  return { ingredients, labor, overhead, total, suggested };
}

function setView(viewName) {
  els.navItems.forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewName));
  els.viewTitle.textContent = views[viewName];
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

  const costs = state.recipes.map((recipe) => recipeIngredientCost(recipe));
  const mostExpensive = costs.length ? Math.max(...costs) : 0;
  document.querySelector("#metricExpensive").textContent = money.format(mostExpensive);

  const recentRows = [...state.purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map((purchase) => {
      const ingredient = ingredientById(purchase.ingredientId);
      const perUnit = purchase.price / baseQuantity(purchase.quantity, purchase.unit);
      return `
        <tr>
          <td>${purchase.date}</td>
          <td>${ingredient?.name ?? "Sin ingrediente"}</td>
          <td>${purchase.quantity} ${unitLabel(purchase.unit)}</td>
          <td class="num">${money.format(perUnit)} / ${unitLabel(ingredient?.baseUnit ?? purchase.unit)}</td>
        </tr>
      `;
    })
    .join("");

  document.querySelector("#recentPurchases").innerHTML = recentRows || `<tr><td colspan="4">Sin compras todavia.</td></tr>`;

  document.querySelector("#recipeCostList").innerHTML = state.recipes.map((recipe) => `
    <article class="item">
      <div class="item-header">
        <strong>${recipe.name}</strong>
        <strong>${money.format(recipeIngredientCost(recipe))}</strong>
      </div>
      <span class="item-meta">${recipe.servings} porciones, solo ingredientes</span>
    </article>
  `).join("") || `<p class="empty">Agrega una receta para verla aca.</p>`;
}

function renderPurchases() {
  const rows = [...state.purchases]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((purchase) => {
      const ingredient = ingredientById(purchase.ingredientId);
      const perUnit = purchase.price / baseQuantity(purchase.quantity, purchase.unit);
      return `
        <tr>
          <td>${purchase.date}</td>
          <td>${ingredient?.name ?? "Sin ingrediente"}</td>
          <td>${purchase.quantity} ${unitLabel(purchase.unit)} por ${money.format(purchase.price)}</td>
          <td class="num">${money.format(perUnit)} / ${unitLabel(ingredient?.baseUnit ?? purchase.unit)}</td>
        </tr>
      `;
    })
    .join("");

  document.querySelector("#purchaseRows").innerHTML = rows || `<tr><td colspan="4">Sin compras registradas.</td></tr>`;
}

function renderIngredients() {
  document.querySelector("#ingredientCards").innerHTML = state.ingredients.map((ingredient) => {
    const price = latestUnitCost(ingredient.id);
    return `
      <article class="ingredient-card">
        <strong>${ingredient.name}</strong>
        <span>Unidad base: ${unitLabel(ingredient.baseUnit)}</span>
        <span>Ultimo precio: ${price ? `${money.format(price)} / ${unitLabel(ingredient.baseUnit)}` : "sin compras"}</span>
      </article>
    `;
  }).join("") || `<p class="empty">Agrega ingredientes para comenzar.</p>`;
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
    const items = recipe.items.map((item) => {
      const ingredient = ingredientById(item.ingredientId);
      return `${ingredient?.name ?? "Sin ingrediente"}: ${item.quantity} ${unitLabel(item.unit)}`;
    }).join(", ");

    return `
      <article class="item">
        <div class="item-header">
          <strong>${recipe.name}</strong>
          <strong>${money.format(recipeIngredientCost(recipe))}</strong>
        </div>
        <p class="item-meta">${recipe.servings} porciones</p>
        <p>${items}</p>
      </article>
    `;
  }).join("") || `<p class="empty">Todavia no hay recetas.</p>`;
}

function renderCosting() {
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
  const result = totalRecipeCost(recipe, targetServings, values);

  document.querySelector("#costIngredients").textContent = money.format(result.ingredients);
  document.querySelector("#costLabor").textContent = money.format(result.labor);
  document.querySelector("#costOverhead").textContent = money.format(result.overhead);
  document.querySelector("#costTotal").textContent = money.format(result.total);
  document.querySelector("#costPerServing").textContent = money.format(result.total / targetServings);
  document.querySelector("#costSuggested").textContent = money.format(result.suggested);
}

function renderSettings() {
  els.settingsForm.elements.hourlyRate.value = state.settings.hourlyRate;
  els.settingsForm.elements.utilities.value = state.settings.utilities;
  els.settingsForm.elements.otherCosts.value = state.settings.otherCosts;
  els.settingsForm.elements.margin.value = state.settings.margin;
}

function renderAll() {
  fillIngredientOptions();
  renderDashboard();
  renderPurchases();
  renderIngredients();
  renderRecipes();
  renderSettings();
  renderCosting();
}

function setCostDefaults() {
  const recipe = state.recipes[0];
  els.costForm.targetServings.value = recipe?.servings ?? 10;
  els.costForm.laborHours.value = 3;
  els.costForm.hourlyRate.value = state.settings.hourlyRate;
  els.costForm.utilities.value = state.settings.utilities;
  els.costForm.otherCosts.value = state.settings.otherCosts;
  els.costForm.margin.value = state.settings.margin;
}

els.navItems.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.jump));
});

els.seedDataBtn.addEventListener("click", () => {
  state = structuredClone(demoState);
  saveState();
  els.recipeIngredientLines.innerHTML = "";
  addRecipeLine();
  setCostDefaults();
  renderAll();
});

els.ingredientForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  state.ingredients.push({
    id: uid("ing"),
    name: data.name.trim(),
    baseUnit: data.baseUnit
  });
  saveState();
  event.currentTarget.reset();
  renderAll();
});

els.purchaseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  state.purchases.push({
    id: uid("buy"),
    ingredientId: data.ingredientId,
    date: data.date,
    quantity: Number(data.quantity),
    unit: data.unit,
    price: Number(data.price)
  });
  saveState();
  event.currentTarget.reset();
  event.currentTarget.elements.date.valueAsDate = new Date();
  renderAll();
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

els.recipeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const lines = [...form.querySelectorAll(".recipe-line")].map((line) => ({
    ingredientId: line.querySelector('select[name="ingredientId"]').value,
    quantity: Number(line.querySelector('input[name="quantity"]').value),
    unit: line.querySelector('select[name="unit"]').value
  }));

  if (!lines.length) return;

  state.recipes.push({
    id: uid("rec"),
    name: data.name.trim(),
    servings: Number(data.servings),
    items: lines
  });
  saveState();
  form.reset();
  els.recipeIngredientLines.innerHTML = "";
  addRecipeLine();
  renderAll();
});

els.costForm.addEventListener("input", renderCosting);
els.costRecipeSelect.addEventListener("change", () => {
  const recipe = state.recipes.find((item) => item.id === els.costRecipeSelect.value);
  if (recipe) els.costForm.targetServings.value = recipe.servings;
  renderCosting();
});

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  state.settings = {
    hourlyRate: Number(data.hourlyRate),
    utilities: Number(data.utilities),
    otherCosts: Number(data.otherCosts),
    margin: Number(data.margin)
  };
  saveState();
  setCostDefaults();
  renderAll();
});

els.purchaseForm.elements.date.valueAsDate = new Date();
addRecipeLine();
setCostDefaults();
renderAll();

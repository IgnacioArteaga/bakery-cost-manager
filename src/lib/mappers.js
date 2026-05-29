export function mapSettings(row) {
  return row
    ? {
        hourlyRate: Number(row.hourly_rate),
        utilities: Number(row.utilities_cost),
        otherCosts: Number(row.other_cost),
        margin: Number(row.target_margin)
      }
    : { hourlyRate: 0, utilities: 0, otherCosts: 0, margin: 0 };
}

export function mapIngredient(row) {
  return {
    id: row.id,
    name: row.name,
    baseUnit: row.base_unit,
    latestUnitPrice: Number(row.latest_unit_price ?? 0),
    latestPurchaseDate: row.latest_purchase_date
  };
}

export function mapPurchase(row) {
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

export function mapRecipe(row) {
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

export function mapRecipeCost(row) {
  return {
    recipeId: row.recipe_id,
    recipeName: row.recipe_name,
    servings: Number(row.servings),
    ingredientCost: Number(row.ingredient_cost)
  };
}

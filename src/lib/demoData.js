export const demoData = {
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

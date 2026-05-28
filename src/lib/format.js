export const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

export function unitLabel(unit) {
  return unit === "unidad" ? "unid." : unit;
}

export function baseQuantity(quantity, unit) {
  if (unit === "kg" || unit === "l") return Number(quantity) * 1000;
  return Number(quantity);
}

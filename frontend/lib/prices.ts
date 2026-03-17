export const WORK_PRICES: Record<string, { price: number; label: string; pages: string }> = {
  "Реферат":   { price: 199,  label: "Реферат",         pages: "20-25 стр." },
  "Курсовая":  { price: 499,  label: "Курсовая работа", pages: "30-40 стр." },
  "ВКР":       { price: 999,  label: "ВКР",             pages: "60-70 стр." },
  "Доклад":    { price: 149,  label: "Доклад",          pages: "15-20 стр." },
  "Эссе":      { price: 129,  label: "Эссе",            pages: "4-8 стр."   },
  "Сочинение": { price: 99,   label: "Сочинение",       pages: "3-5 стр."   },
}

export const WORK_PAGES: Record<string, { min: number; max: number; default: number }> = {
  "Реферат":   { min: 10, max: 30, default: 20 },
  "Доклад":    { min: 8,  max: 20, default: 15 },
  "Эссе":      { min: 3,  max: 8,  default: 5  },
  "Сочинение": { min: 2,  max: 5,  default: 3  },
  "Курсовая":  { min: 25, max: 45, default: 35 },
  "ВКР":       { min: 60, max: 70, default: 65 },
}

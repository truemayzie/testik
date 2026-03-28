export const WORK_PRICES: Record<string, { price: number; label: string; pages: string }> = {
  "Тест":      { price: 0,    label: "Тест",             pages: "1 стр."     },
  "Сочинение": { price: 99,   label: "Сочинение",       pages: "3-5 стр."   },
  "Эссе":      { price: 149,  label: "Эссе",             pages: "4-8 стр."   },
  "Доклад":    { price: 199,  label: "Доклад",           pages: "15-20 стр." },
  "Реферат":   { price: 299,  label: "Реферат",          pages: "20-25 стр." },
  "Курсовая":  { price: 699,  label: "Курсовая работа",  pages: "30-40 стр." },
  "ВКР":       { price: 1199, label: "ВКР",              pages: "60-70 стр." },
}

export const WORK_PAGES: Record<string, { min: number; max: number; default: number }> = {
  "Тест":      { min: 1,  max: 1,  default: 1  },
  "Сочинение": { min: 3,  max: 5,  default: 3  },
  "Эссе":      { min: 4,  max: 8,  default: 5  },
  "Доклад":    { min: 15, max: 20, default: 15 },
  "Реферат":   { min: 20, max: 25, default: 20 },
  "Курсовая":  { min: 30, max: 40, default: 30 },
  "ВКР":       { min: 60, max: 70, default: 60 },
}

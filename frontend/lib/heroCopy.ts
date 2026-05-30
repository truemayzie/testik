export const HERO_TITLE_BY_WORK_TYPE: Record<string, string> = {
  Сочинение: "Сочинение с помощью нейросети",
  Эссе: "Эссе с помощью нейросети",
  Доклад: "Доклад с помощью нейросети",
  Реферат: "Реферат с помощью нейросети",
  Курсовая: "Курсовая с помощью нейросети",
  ВКР: "ВКР с помощью нейросети",
};

export const HERO_TITLE_DEFAULT = "Учебные работы с оформлением по ГОСТ";

export function getHeroTitle(workType: string): string {
  return HERO_TITLE_BY_WORK_TYPE[workType] ?? HERO_TITLE_DEFAULT;
}

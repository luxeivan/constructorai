export type TopCategory = {
  slug: string;
  name: string;
  keywords: RegExp[];
};

export const TOP_CATEGORIES: TopCategory[] = [
  { slug: "parking", name: "Роллетные шкафы для паркинга", keywords: [/паркинг/i, /роллетн/i] },
  { slug: "mobile-workshops", name: "Передвижные мастерские", keywords: [/передвижная мастерская/i] },
  { slug: "welding", name: "Сварочные столы", keywords: [/сварочн/i, /тиски/i] },
  { slug: "antistatic", name: "Антистатические столы и шкафы", keywords: [/антистатич/i] },
  { slug: "shelving", name: "Стеллажи", keywords: [/стеллаж/i] },
  { slug: "carts", name: "Тележки", keywords: [/тележк/i] },
  {
    slug: "cabinets",
    name: "Шкафы",
    keywords: [/шкаф/i, /антресоль/i, /модуль хранения/i, /модуль для пикапа/i, /вертикальные автоматизированные склады/i],
  },
  { slug: "pedestals", name: "Тумбы", keywords: [/тумб/i, /подкатной модуль/i, /мобильный модуль/i] },
  {
    slug: "workbenches",
    name: "Верстаки и рабочие столы",
    keywords: [/верстак/i, /рабочее место/i, /рабочий стол/i, /слесарный стол/i, /стол-верстак/i],
  },
  { slug: "tables", name: "Промышленные столы", keywords: [/стол/i, /раскройн/i] },
  {
    slug: "components",
    name: "Комплектующие",
    keywords: [
      /кронштейн/i,
      /держатель/i,
      /полка/i,
      /панель/i,
      /комплект/i,
      /контейнер/i,
      /вешалка/i,
      /ножки/i,
      /подставка/i,
      /фитинг/i,
      /ограничитель/i,
      /подпятник/i,
      /стойка/i,
      /лоток/i,
      /кассета/i,
      /делител/i,
      /модуль/i,
    ],
  },
  { slug: "other", name: "Прочее", keywords: [] },
];

export function classifyCategory(name: string): TopCategory {
  for (const category of TOP_CATEGORIES) {
    if (category.keywords.some((keyword) => keyword.test(name))) return category;
  }
  return TOP_CATEGORIES[TOP_CATEGORIES.length - 1]!;
}

export function categorySlugFromSiteName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("паркинг") || normalized.includes("роллет")) return "parking";
  if (normalized.includes("мастерск")) return "mobile-workshops";
  if (normalized.includes("свароч")) return "welding";
  if (normalized.includes("антистат")) return "antistatic";
  if (normalized.includes("стеллаж")) return "shelving";
  if (normalized.includes("тележк")) return "carts";
  if (normalized.includes("шкаф")) return "cabinets";
  if (normalized.includes("тумб")) return "pedestals";
  if (normalized.includes("верстак")) return "workbenches";
  if (normalized.includes("стол")) return "tables";
  if (normalized.includes("комплект") || normalized.includes("прочее")) return "components";
  return "other";
}

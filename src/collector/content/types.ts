// Тексты v2. Каждый факт отсюда должен быть в content/facts.md со ссылкой и статусом ✅ или ☑️.

export interface PaintingInfo {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Ширина и высота холста, см */
  size: [number, number];
  /** public/collector/paintings/<file>-2048.webp */
  file: string;
  /** Цена в игре, франков */
  price: number;
  /** Коротко о картине — 1–2 предложения */
  about: string;
  /** Как картина попала к Морозову */
  provenance: string;
  /** Где сейчас */
  now: string;
  /** Изображение: файл Wikimedia Commons */
  source: { title: string; url: string };
}

export interface ChapterInfo {
  title: string;
  paragraphs: string[];
  sources: { title: string; url: string }[];
}

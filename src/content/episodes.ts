// Тексты эпизодов. Каждый факт в story должен быть в content/facts.md со ссылкой на источник.

export interface Hotspot {
  id: string;
  label: string;
  /** Центр в долях ширины/высоты картины, от левого верхнего угла */
  u: number;
  v: number;
  /** Радиус попадания в долях высоты картины */
  r: number;
  caption: string;
}

export interface Source {
  title: string;
  url: string;
}

export interface Episode {
  id: string;
  title: string;
  artist: string;
  year: string;
  available: boolean;
  painting?: {
    /** Имена файлов в public/paintings без суффикса размера */
    file: string;
    /** Реальный размер холста в метрах */
    width: number;
    height: number;
  };
  intro?: string;
  hotspots: Hotspot[];
  story: string[];
  sources: Source[];
}

export const episodes: Episode[] = [
  {
    id: 'red-vineyards',
    title: 'Красные виноградники в Арле',
    artist: 'Винсент Ван Гог',
    year: '1888',
    available: true,
    painting: { file: 'red-vineyards', width: 0.93, height: 0.75 },
    intro:
      'Вы в зале особняка Ивана Морозова на Пречистенке. Подойдите к картине и найдите на ней три детали.',
    hotspots: [
      {
        id: 'sun',
        label: 'Солнце',
        u: 0.809,
        v: 0.046,
        r: 0.08,
        caption:
          'Низкое солнце заливает поле жёлтым светом. В письме брату Ван Гог упоминал «жёлтые отблески заката».',
      },
      {
        id: 'parasol',
        label: 'Женщина с зонтиком',
        u: 0.435,
        v: 0.27,
        r: 0.09,
        caption: 'Несколько мазков — и среди сборщиков винограда узнаётся фигура под зонтиком.',
      },
      {
        id: 'cart',
        label: 'Повозка с лошадью',
        u: 0.625,
        v: 0.207,
        r: 0.09,
        caption:
          'На дальнем плане — повозка. Сбор урожая здесь показан как тяжёлый ежедневный труд.',
      },
    ],
    story: [
      'Ноябрь 1888 года. Ван Гог пишет сбор винограда в окрестностях аббатства Монмажур под Арлем.',
      'В 1890 году картину показали в Брюсселе на выставке «Группы двадцати». Её купила бельгийская художница Анна Бош за 400 франков. Эту работу считают единственной картиной, проданной при жизни Ван Гога.',
      'Позже «Красные виноградники» оказались в Москве, в собрании Ивана Абрамовича Морозова (1871–1921), в его особняке на Пречистенке, 21.',
      'После революции собрание национализировали, и особняк стал Вторым музеем новой западной живописи. В 1948 году Государственный музей нового западного искусства закрыли, а коллекцию разделили между ГМИИ им. А. С. Пушкина и Эрмитажем. «Красные виноградники» — в Пушкинском музее.',
    ],
    sources: [
      { title: 'Википедия: Красные виноградники в Арле', url: 'https://ru.wikipedia.org/wiki/Красные_виноградники_в_Арле' },
      { title: 'Wikipedia: The Red Vineyard', url: 'https://en.wikipedia.org/wiki/The_Red_Vineyard' },
      { title: 'Википедия: Морозов, Иван Абрамович', url: 'https://ru.wikipedia.org/wiki/Морозов,_Иван_Абрамович' },
      { title: 'Сноб: история ГМНЗИ', url: 'https://snob.ru/selected/entry/60756/' },
      { title: 'Изображение: Wikimedia Commons (public domain)', url: 'https://commons.wikimedia.org/wiki/File:Red_vineyards.jpg' },
    ],
  },
  {
    id: 'boulevard-capucines',
    title: 'Бульвар Капуцинок',
    artist: 'Клод Моне',
    year: '1873',
    available: false,
    hotspots: [],
    story: [],
    sources: [],
  },
  {
    id: 'jeanne-samary',
    title: 'Портрет актрисы Жанны Самари',
    artist: 'Пьер Огюст Ренуар',
    year: '1877',
    available: false,
    hotspots: [],
    story: [],
    sources: [],
  },
];

export function findEpisode(id: string | null): Episode | undefined {
  return episodes.find((e) => e.id === id && e.available);
}

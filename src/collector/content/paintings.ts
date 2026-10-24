import type { ChapterInfo, PaintingInfo } from './types';

// Пять картин, которые И. А. Морозов купил в Париже в 1907–1909 годах у разных торговцев.
// В игре они собраны в одном зале — это стилизация. Источники каждого утверждения — content/facts.md, раздел v2.

/** Бюджет хватает на три картины; торг за «Виноградники» позволяет взять три ван Гога — как в 1909 году */
export const BUDGET = 75_000;

/** Цена после торга: Морозов сбавил запрошенные 30 000 «примерно на треть» */
export const BARGAIN: Record<string, number> = { 'red-vineyard': 20_000 };

export const PAINTINGS: PaintingInfo[] = [
  {
    id: 'red-vineyard',
    title: 'Красные виноградники в Арле',
    artist: 'Винсент Ван Гог',
    year: '1888',
    size: [91, 73],
    file: 'red-vineyard',
    price: 30_000,
    about:
      'Сбор винограда под Арлем, ноябрь 1888 года. В 1890-м картину купила Анна Бош — одна из немногих продаж при жизни художника.',
    provenance:
      'Осенью 1909 года Эжен Дрюэ предложил Морозову пять полотен Ван Гога и просил за «Виноградники» 30 000 франков. Морозов сбавил цену примерно на треть.',
    now: 'Сейчас — в Пушкинском музее.',
    source: {
      title: 'Wikimedia Commons: Red Vineyard at Arles (1888)',
      url: 'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Red_Vineyard_at_Arles_(1888).jpg',
    },
  },
  {
    id: 'prisoners-round',
    title: 'Прогулка заключённых',
    artist: 'Винсент Ван Гог',
    year: '1890',
    size: [64, 80],
    file: 'prisoners-round',
    price: 25_000,
    about: 'Написана в феврале 1890 года по гравюре Гюстава Доре.',
    provenance:
      'Из того же предложения Дрюэ осенью 1909 года — по 25 000 франков за каждое из остальных полотен. Валентин Серов советовал взять её вместе с «Красными виноградниками».',
    now: 'Сейчас — в Пушкинском музее.',
    source: {
      title: 'Wikimedia Commons: The Prison Courtyard (1890)',
      url: 'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_The_Prison_Courtyard_(1890).jpg',
    },
  },
  {
    id: 'auvers-after-rain',
    title: 'Пейзаж в Овере после дождя',
    artist: 'Винсент Ван Гог',
    year: '1890',
    size: [90, 72],
    file: 'auvers-after-rain',
    price: 25_000,
    about: 'Поля под Овером-сюр-Уаз, июнь 1890 года. По дороге едет повозка, вдали идёт поезд.',
    provenance:
      'Морозов купил её у Дрюэ осенью 1909 года — на деньги, сэкономленные при торге за «Красные виноградники».',
    now: 'Сейчас — в Пушкинском музее.',
    source: {
      title: 'Wikimedia Commons: Landscape with a Carriage and a Train (1890)',
      url: 'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Landscape_with_a_Carriage_and_a_Train_(1890).jpg',
    },
  },
  {
    id: 'boulevard-capucines',
    title: 'Бульвар Капуцинок',
    artist: 'Клод Моне',
    year: '1873–1874',
    size: [80, 61],
    file: 'boulevard-capucines',
    price: 20_000,
    about:
      'Парижский бульвар с высоты. Считается, что эту версию показывали на первой выставке импрессионистов в 1874 году.',
    provenance:
      'Продал Морозову в 1907 году Поль Дюран-Рюэль, купивший её годом раньше из собрания Жана-Батиста Фора. Сколько заплатил Морозов, неизвестно — цена в игре условная.',
    now: 'Сейчас — в Пушкинском музее.',
    source: { title: 'Wikimedia Commons: Claude Monet 009', url: 'https://commons.wikimedia.org/wiki/File:Claude_Monet_009.jpg' },
  },
  {
    id: 'sainte-victoire',
    title: 'Гора Сент-Виктуар, вид с дороги на Валькрос',
    artist: 'Поль Сезанн',
    year: '1878–1879',
    size: [72, 58],
    file: 'sainte-victoire',
    price: 20_000,
    about: 'Прованс и гора Сент-Виктуар — мотив, к которому Сезанн возвращался много раз.',
    provenance:
      'Морозов купил её у Амбруаза Воллара 5 октября 1907 года. Цена не найдена — в игре она условная.',
    now: 'Сейчас — в Пушкинском музее.',
    source: {
      title: 'Wikimedia Commons: Cezanne — Ebene mit dem Mont Sainte Victoire',
      url: 'https://commons.wikimedia.org/wiki/File:Cezanne_-_Ebene_mit_dem_Mont_Sainte_Victoire.jpg',
    },
  },
];

export const INTRO = {
  street: 'Париж. Улица торговцев картинами',
  gallery: 'В зале — пять картин, которые Морозов купил в Париже. Бюджет — 75 000 франков.',
  serov: 'Валентин Серов, которого Морозов позвал в арбитры, советовал «Красные виноградники» и «Прогулку заключённых».',
  travel: 'Москва. Пречистенка, 21',
  mansion: 'Ящики из Парижа распакованы. Выберите, где повесить каждую картину.',
};

export const CHAPTER: ChapterInfo = {
  title: 'Коллекционер, который торговался',
  paragraphs: [
    'В 1907 и 1908 годах Иван Морозов купил больше шестидесяти картин, а к 1914-му его западное собрание насчитывало 278 картин и 23 скульптуры.',
    'Осенью 1909 года парижский торговец Эжен Дрюэ предложил ему пять полотен Ван Гога. Арбитром Морозов позвал художника Валентина Серова — тот советовал «Красные виноградники» и «Прогулку заключённых». Морозов сбавил цену «Виноградников» примерно на треть и на сэкономленное купил ещё «Пейзаж в Овере после дождя».',
    'Покупки ехали в особняк на Пречистенке, 21. Ещё в 1904–1906 годах архитектор Лев Кекушев перестроил его: встроил в крышу стеклянный фонарь, отдал верхний этаж под картинную галерею и сделал отделку нейтральной.',
    'Морозов не спешил. Среди сезанновских полотен он годами держал пустое место на стене — ждал «голубого Сезанна». С Сергеем Щукиным они соперничали, но, по словам исследователя Натальи Семёновой, ни разу не перехватили картину друг у друга.',
    'В 1918 году собрание национализировали, в 1923-м объединили с коллекцией Щукина, а в 1948-м разделили между ГМИИ им. А. С. Пушкина и Эрмитажем.',
  ],
  sources: [
    { title: 'The Art Newspaper Russia: Н. Семёнова о покупках Морозова у Дрюэ', url: 'https://www.theartnewspaper.ru/posts/20220627-iiwq/' },
    { title: 'annaboch.com: The Red Vineyard (письмо Музея Ван Гога, 2018)', url: 'https://annaboch.com/theredvineyard/' },
    { title: 'Arzamas: Иван Морозов', url: 'https://arzamas.academy/materials/1439' },
    { title: 'Русский авангард: коллекция Ивана Морозова', url: 'https://rusavangard.ru/online/history/kollektsiya-ivana-morozova/' },
    { title: 'Москва купеческая: особняк на Пречистенке', url: 'https://thecity.m24.ru/articles/11385' },
    { title: 'Cézanne Online Catalogue Raisonné, FWN 127', url: 'https://www.cezannecatalogue.com/catalogue/entry.php?id=393' },
    { title: 'Isaacson: Monet’s Le Boulevard des Capucines (19th-Century Art Worldwide)', url: 'https://19thc-artworldwide.org/spring21/isaacson-on-monet-le-boulevard-des-capucines-en-carnival' },
    { title: 'Википедия: Морозов, Иван Абрамович', url: 'https://ru.wikipedia.org/wiki/Морозов,_Иван_Абрамович' },
  ],
};

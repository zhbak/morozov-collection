# Изображения и модели

| Файл | Что | Лицензия | Источник |
|---|---|---|---|
| `public/paintings/red-vineyards-*.webp` | В. Ван Гог, «Красные виноградники в Арле», 1888 | Public domain (PD-old-100-expired, CC PD Mark 1.0) | [Wikimedia Commons: Red_vineyards.jpg](https://commons.wikimedia.org/wiki/File:Red_vineyards.jpg) |
| `public/models/armchair.glb` | Кресло в стиле модерн | Сгенерировано Meshy (Text-to-3D) по промпту из `assets/models.json`; условия использования — по тарифу Meshy | meshy.ai |
| Зал, рамы, паркет | Процедурно в `src/scene/room.ts` | — | — |

## v2 «Коллекционер»

### Картины (public domain, Wikimedia Commons)

| Файл | Что | Лицензия | Источник |
|---|---|---|---|
| `public/collector/paintings/red-vineyard-*.webp` | В. Ван Гог, «Красные виноградники в Арле», 1888 | PD-Art, PD-old-100-expired | [Commons](https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Red_Vineyard_at_Arles_(1888).jpg) |
| `public/collector/paintings/prisoners-round-*.webp` | В. Ван Гог, «Прогулка заключённых», 1890 | PD-Art, PD-old-100-expired | [Commons](https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_The_Prison_Courtyard_(1890).jpg) |
| `public/collector/paintings/auvers-after-rain-*.webp` | В. Ван Гог, «Пейзаж в Овере после дождя», 1890 | PD-Art, PD-old-100-expired | [Commons](https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Landscape_with_a_Carriage_and_a_Train_(1890).jpg) |
| `public/collector/paintings/boulevard-capucines-*.webp` | К. Моне, «Бульвар Капуцинок», 1873–1874 | PD-Art-YorckProject | [Commons](https://commons.wikimedia.org/wiki/File:Claude_Monet_009.jpg) |
| `public/collector/paintings/sainte-victoire-*.webp` | П. Сезанн, «Гора Сент-Виктуар, вид с дороги на Валькрос», 1878–1879 | PD-Art, PD-old-auto-expired | [Commons](https://commons.wikimedia.org/wiki/File:Cezanne_-_Ebene_mit_dem_Mont_Sainte_Victoire.jpg) |

Исходники — `assets/raw/collector/` (до 3000 px), список — `assets/collector-paintings.json`, скрипт — `npm run assets:paintings-v2`.

### Текстуры и модели Poly Haven (CC0 1.0, https://polyhaven.com/license)

Текстуры `public/collector/textures/`: cobblestone_floor_02, worn_asphalt, marble_01, beige_wall_001, roof_slates_03,
black_painted_planks, herringbone_parquet, old_wooden_floor_01, velour_velvet, plastered_wall_02.
Модели `public/collector/models/`: street_lamp_01, Chandelier_03, ArmChair_01, ClassicConsole_01, sofa_03.
Список — `assets/polyhaven.json`, скрипт — `npm run assets:polyhaven`.

### Модели Meshy

| Файл | Что | Как сделано |
|---|---|---|
| `public/collector/models/morozov.glb`, `morozov-anims.glb` | Персонаж «Морозов» — стилизация по мотивам портрета работы В. Серова (1910), без попытки точного лица | Концепт: Meshy Text-to-Image (nano-banana-pro, три вида, A-поза) → Multi-Image-to-3D → Rigging → Animation (Idle, Short Breathe and Look Around, Casual Walk, Run 2, Gentlemans Bow, Mirror Viewing). Промпты — `assets/characters.json` |
| `public/collector/models/{fiacre,morris_column,bistro_set,easel,dealer_desk,flower_cart,bench,crates,passerby_woman,passerby_man,porter}.glb` | Пропсы и прохожие улицы, галереи и особняка | Meshy Text-to-3D (meshy-7.1, текстуры PBR), промпты — `assets/models.json` |

Условия использования моделей Meshy — по тарифу Meshy.

### Шрифты

Cormorant Garamond и PT Serif — Google Fonts, SIL Open Font License 1.1.

### Процедурное

Фасады, мостовая, рамы картин, залы галереи и особняка собираются в коде (`src/collector/scenes`). Вывески — общие французские
слова без имён торговцев.

# Коллекция Морозова — браузерная 3D-игра

Прототип для питча: посетитель зала сканирует QR у картины → на телефоне короткий 3D-эпизод
(найти детали на картине → глава истории собрания И. А. Морозова). Без бренда и изображений музея.

## Стек
Vite + TypeScript + Three.js (WebGLRenderer, NeutralToneMapping). PWA (vite-plugin-pwa) — офлайн в зале.
Деплой: GitHub Pages через `.github/workflows/deploy.yml`, `BASE=/morozov-collection/`.

## Структура
- `src/content/episodes.ts` — тексты и детали эпизодов. Координаты деталей `u,v` — доли от левого верхнего угла картины, радиус в долях высоты.
- `src/game/` — чистая логика (покрыта vitest), `src/scene/` — Three.js, `src/main.ts` — UI и связка.
- `content/facts.md` — каждый факт из `story` со ссылкой на источник. Факта нет там — нет и в игре.
- `content/credits.md` — лицензии изображений и моделей.
- `assets/raw/` — исходники (jpg картин), `assets/models.json` — промпты Meshy, `assets/cache/` — сырые GLB (в git не идут).

## Правила
- Картины — только public domain из Wikimedia Commons. Нейросетью картины не генерировать.
- Бюджеты: весь `dist` ≤ 8 МБ (`npm run check:size`), модель ≤ 1.5 МБ и ≤ 8000 треугольников, текстуры ≤ 1024.
- Модели: `npm run assets:gen` (тратит кредиты Meshy, кэш по хэшу промпта) → `npm run assets:optimize` (meshopt + webp). Draco/KTX2 не использовать — загрузчик настроен на meshopt.
- Не править `.unity`-подобные бинарники руками — здесь всё код; сцены собираются в `src/scene`.

## Цикл проверки
1. `npm run dev`, затем `npm run shot -- "?ep=red-vineyards" --mobile --act=start,focus,tap:0.81:0.05` — скриншот в `shots/`, печатает состояние и ошибки консоли. Посмотреть скриншот глазами.
2. `?debug=1` рисует красными кругами зоны попадания деталей.
3. `window.__game` — состояние (`screen`, `found`, `fps`) и действия (`start`, `focus`, `unfocus`, `tapUV`).
4. Перед коммитом: `npm test && npm run build && npm run check:size && npm run e2e`.

// Полученные главы храним в localStorage; в приватном режиме он может быть недоступен — тогда прогресс просто не сохраняется
const KEY = 'morozov:collected';

export function loadCollected(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function saveCollected(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    /* без сохранения */
  }
}

// Пресеты качества графики. Чистые данные — чтобы мобильную версию можно было собрать
// понижением пресета, а не переписыванием сцен.

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface Quality {
  level: QualityLevel;
  /** Верхняя граница devicePixelRatio */
  pixelRatio: number;
  shadowMapSize: number;
  /** gtao — AO в непрямой свет; ssgi — AO + отражённый свет, самый дорогой */
  ao: 'off' | 'gtao' | 'ssgi';
  /** Временное сглаживание; без него — MSAA в проходе сцены */
  traa: boolean;
  bloom: boolean;
  godrays: boolean;
  /** Шагов raymarching для объёмного света */
  volumeSteps: number;
}

export const PRESETS: Record<QualityLevel, Omit<Quality, 'level'>> = {
  low: { pixelRatio: 1, shadowMapSize: 1024, ao: 'off', traa: false, bloom: false, godrays: false, volumeSteps: 0 },
  medium: { pixelRatio: 1.5, shadowMapSize: 2048, ao: 'gtao', traa: true, bloom: true, godrays: false, volumeSteps: 8 },
  high: { pixelRatio: 2, shadowMapSize: 2048, ao: 'gtao', traa: true, bloom: true, godrays: true, volumeSteps: 12 },
  ultra: { pixelRatio: 2, shadowMapSize: 4096, ao: 'ssgi', traa: true, bloom: true, godrays: true, volumeSteps: 16 },
};

const LEVELS = Object.keys(PRESETS) as QualityLevel[];

export function isQualityLevel(v: unknown): v is QualityLevel {
  return typeof v === 'string' && (LEVELS as string[]).includes(v);
}

/** ?q=<level> побеждает; иначе телефон — low, десктоп — high */
export function pickQuality(param: string | null, opts: { mobile: boolean }): Quality {
  const level: QualityLevel = isQualityLevel(param) ? param : opts.mobile ? 'low' : 'high';
  return { level, ...PRESETS[level] };
}

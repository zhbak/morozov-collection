import { describe, expect, it } from 'vitest';
import { pickQuality, PRESETS } from './quality';

describe('pickQuality', () => {
  it('десктоп по умолчанию — high, телефон — low', () => {
    expect(pickQuality(null, { mobile: false }).level).toBe('high');
    expect(pickQuality(null, { mobile: true }).level).toBe('low');
  });

  it('параметр ?q= побеждает, мусор игнорируется', () => {
    expect(pickQuality('ultra', { mobile: true })).toEqual({ level: 'ultra', ...PRESETS.ultra });
    expect(pickQuality('max', { mobile: false }).level).toBe('high');
  });

  it('пресеты упорядочены по цене', () => {
    expect(PRESETS.low.shadowMapSize).toBeLessThanOrEqual(PRESETS.ultra.shadowMapSize);
    expect(PRESETS.low.ao).toBe('off');
    expect(PRESETS.ultra.ao).toBe('ssgi');
  });
});

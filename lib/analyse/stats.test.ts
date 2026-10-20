import { describe, it, expect } from 'vitest';
import { regressionLineaire, correlationPearson, interpreterCorrelation } from './stats';

describe('analyse/stats', () => {
  it('trouve la pente d’une droite', () => {
    const r = regressionLineaire([1, 3, 5, 7]);
    expect(r.pente).toBeCloseTo(2);
    expect(r.r2).toBeCloseTo(1);
  });
  it('corrélation parfaite', () => {
    expect(correlationPearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });
  it('interprète en français et en anglais', () => {
    expect(interpreterCorrelation(-0.9)).toBe('très forte et négative');
    expect(interpreterCorrelation(0.5, 'en')).toBe('moderate and positive');
  });
});
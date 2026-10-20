import { describe, it, expect } from 'vitest';
import { calculerTdc, calculerTdcAvecLimite } from './tdc';

const donnees = {
  entetes: ['Region', 'Statut', 'Superficie'],
  corps: [
    ['Lagunes', 'Approuvé', '10'],
    ['Lagunes', 'Rejeté', '20'],
    ['Gbêkê', 'Approuvé', '50'],
    ['Gbêkê', 'Approuvé', ''],
  ],
};

describe('TDC', () => {
  it('comptage croisé', () => {
    const r = calculerTdc(donnees, ['Region'], ['Statut'], [], 'nombre');
    expect(r.lignes).toEqual(['Gbêkê', 'Lagunes']);
    expect(r.matrice).toEqual([[2, null], [1, 1]]);
  });
  it('somme et moyenne, en ignorant les vides', () => {
    expect(calculerTdc(donnees, ['Region'], [], ['Superficie'], 'somme').matrice).toEqual([[50], [30]]);
    expect(calculerTdc(donnees, ['Region'], [], ['Superficie'], 'moyenne').matrice).toEqual([[50], [15]]);
  });
  it('limite à 30 lignes', () => {
    const grand = {
      entetes: ['A', 'B'],
      corps: Array.from({ length: 40 }, (_, i) => [`L${String(i).padStart(2, '0')}`, 'x']),
    };
    const r = calculerTdcAvecLimite(grand, ['A'], [], [], 'nombre');
    expect(r.tronque).toBe(true);
    expect(r.donnees.lignes).toHaveLength(30);
  });
});
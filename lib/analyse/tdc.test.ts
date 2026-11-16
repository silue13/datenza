import { describe, it, expect } from 'vitest';
import { calculerTdc, calculerTdcAvecLimite, NB_MAX_LIGNES_TDC } from './tdc';

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
  it('limite le nombre de lignes affichées', () => {
    const grand = {
      entetes: ['A', 'B'],
      corps: Array.from({ length: NB_MAX_LIGNES_TDC + 10 }, (_, i) => [`L${String(i).padStart(3, '0')}`, 'x']),
    };
    const r = calculerTdcAvecLimite(grand, ['A'], [], [], 'nombre');
    expect(r.tronque).toBe(true);
    expect(r.donnees.lignes).toHaveLength(NB_MAX_LIGNES_TDC);
  });
  it('range les périodes dans l\'ordre du calendrier', () => {
    const d = { entetes: ['Mois', 'V'], corps: [['Mars', 3], ['Janvier', 1], ['Février', 2]] };
    expect(calculerTdc(d, ['Mois'], [], ['V'], 'somme').lignes).toEqual(['Janvier', 'Février', 'Mars']);
  });
  it('lit les nombres comme le reste de l\'application', () => {
    const d = { entetes: ['R', 'V'], corps: [['A', '1 250,50 FCFA'], ['A', '(250,50)'], ['A', '192.168.1.1']] };
    expect(calculerTdc(d, ['R'], [], ['V'], 'somme').matrice).toEqual([[1000]]);
  });
});

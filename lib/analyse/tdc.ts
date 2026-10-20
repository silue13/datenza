// lib/analyse/tdc.ts — autonome, aucune dépendance interne

export type Cell = string | number | boolean | null | undefined;
export type Row = Cell[];
export interface Donnees {
  entetes: string[];
  corps: Row[];
}
export type Agregation = 'nombre' | 'somme' | 'moyenne' | 'min' | 'max';
export interface ColonneTdc {
  colonneBase: string;
  champValeur: string;
}
export interface ResultatTdc {
  lignes: string[];
  colonnes: ColonneTdc[];
  matrice: (number | null)[][];
  avecColonnes: boolean;
}

export const COMPTE = '__compte__';
export const VALEUR_UNIQUE = '__valeur__';
export const NB_MAX_LIGNES_TDC = 30;
export const NB_MAX_COLONNES_TDC = 10;

const arrondir = (v: number): number => Math.round(v * 100) / 100;

export function valeurTdcInvalide(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  return ['', 'n/a', 'na', 'n.a.', '#n/a', 'null', 'undefined', '-', '—'].includes(
    String(v).trim().toLowerCase()
  );
}

function cleComposite(ligne: Row, indices: number[]): string | null {
  const morceaux: string[] = [];
  for (const i of indices) {
    const brut = i >= 0 ? ligne[i] : undefined;
    if (valeurTdcInvalide(brut)) return null;
    morceaux.push(String(brut).trim());
  }
  return morceaux.join(' / ');
}

interface Acc {
  n: number;
  sum: number;
  min: number;
  max: number;
}
const nouvelAcc = (): Acc => ({ n: 0, sum: 0, min: Infinity, max: -Infinity });
function ajouter(a: Acc, x: number) {
  a.n++;
  a.sum += x;
  if (x < a.min) a.min = x;
  if (x > a.max) a.max = x;
}

function agreger(a: Acc, champ: string, agregation: Agregation): number | null {
  if (!a.n) return null;
  if (champ === COMPTE || agregation === 'nombre') return a.n;
  if (agregation === 'somme') return arrondir(a.sum);
  if (agregation === 'moyenne') return arrondir(a.sum / a.n);
  if (agregation === 'min') return arrondir(a.min);
  return arrondir(a.max);
}

export function calculerTdc(
  d: Donnees,
  champsLignes: string[],
  champsColonnes: string[],
  champsValeurs: string[],
  agregation: Agregation
): ResultatTdc {
  if (!champsLignes.length) throw new Error('Choisis au moins une colonne pour les lignes.');

  const avecColonnes = champsColonnes.length > 0;
  const champsVal = champsValeurs.length ? champsValeurs : [COMPTE];
  const idx = (nom: string) => d.entetes.indexOf(nom);
  const iLignes = champsLignes.map(idx);
  const iCols = champsColonnes.map(idx);
  const iVals = champsVal.map((c) => (c === COMPTE ? -1 : idx(c)));

  const lignesVues = new Set<string>();
  const colsVues = new Set<string>();
  const cellules = new Map<string, Map<string, Acc[]>>();

  for (const ligne of d.corps) {
    const cleL = cleComposite(ligne, iLignes);
    if (cleL === null) continue;
    const cleC = avecColonnes ? cleComposite(ligne, iCols) : VALEUR_UNIQUE;
    if (cleC === null) continue;

    lignesVues.add(cleL);
    colsVues.add(cleC);
    let parCol = cellules.get(cleL);
    if (!parCol) {
      parCol = new Map();
      cellules.set(cleL, parCol);
    }
    let accs = parCol.get(cleC);
    if (!accs) {
      accs = champsVal.map(nouvelAcc);
      parCol.set(cleC, accs);
    }

    for (let k = 0; k < champsVal.length; k++) {
      if (champsVal[k] === COMPTE) {
        ajouter(accs[k], 1);
        continue;
      }
      const brut = iVals[k] >= 0 ? ligne[iVals[k]] : undefined;
      if (valeurTdcInvalide(brut)) continue;
      if (agregation === 'nombre') {
        ajouter(accs[k], 1);
        continue;
      }
      const n = Number(typeof brut === 'string' ? brut.trim().replace(',', '.') : brut);
      if (!Number.isNaN(n)) ajouter(accs[k], n);
    }
  }

  const lignes = Array.from(lignesVues).sort();
  const colsBase = avecColonnes ? Array.from(colsVues).sort() : [VALEUR_UNIQUE];
  const colonnes: ColonneTdc[] = colsBase.flatMap((colonneBase) =>
    champsVal.map((champValeur) => ({ colonneBase, champValeur }))
  );
  const matrice = lignes.map((l) =>
    colonnes.map((col) => {
      const accs = cellules.get(l)?.get(col.colonneBase);
      if (!accs) return null;
      return agreger(accs[champsVal.indexOf(col.champValeur)], col.champValeur, agregation);
    })
  );
  return { lignes, colonnes, matrice, avecColonnes };
}

export function calculerTdcAvecLimite(
  d: Donnees,
  champsLignes: string[],
  champsColonnes: string[],
  champsValeurs: string[],
  agregation: Agregation
): { donnees: ResultatTdc; tronque: boolean } {
  const brut = calculerTdc(d, champsLignes, champsColonnes, champsValeurs, agregation);
  let { lignes, colonnes, matrice } = brut;
  let tronque = false;
  const somme = (row: (number | null)[]) => row.reduce<number>((a, b) => a + (b ?? 0), 0);

  if (lignes.length > NB_MAX_LIGNES_TDC) {
    const gardes = matrice
      .map((row, i) => ({ i, total: somme(row) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, NB_MAX_LIGNES_TDC)
      .map((x) => x.i)
      .sort((a, b) => a - b);
    lignes = gardes.map((i) => brut.lignes[i]);
    matrice = gardes.map((i) => brut.matrice[i]);
    tronque = true;
  }

  if (colonnes.length > NB_MAX_COLONNES_TDC) {
    const gardees = colonnes
      .map((_, j) => ({ j, total: matrice.reduce((a, row) => a + (row[j] ?? 0), 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, NB_MAX_COLONNES_TDC)
      .map((x) => x.j)
      .sort((a, b) => a - b);
    const sources = colonnes;
    colonnes = gardees.map((j) => sources[j]);
    matrice = matrice.map((row) => gardees.map((j) => row[j]));
    tronque = true;
  }

  return { donnees: { lignes, colonnes, matrice, avecColonnes: brut.avecColonnes }, tronque };
}
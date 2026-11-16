// lib/analyse/tdc.ts
import { parseNombre, estValeurVide, estLigneTotal, arrondir } from './utils';
import { trierChronologiquement } from './dates';

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

// Limites étendues pour préserver l'ensemble des 33 régions de CI et les séries historiques de 65+ ans
export const NB_MAX_LIGNES_TDC = 100;
export const NB_MAX_COLONNES_TDC = 25;


/** Même lecture des nombres que le reste de l'application (un seul analyseur, plus de divergence). */
export function parseNombreTdc(val: Cell): number | null {
  if (typeof val === 'boolean') return null;
  return parseNombre(val);
}

export function valeurTdcInvalide(v: Cell): boolean {
  return estValeurVide(v);
}

const estLigneTotalTdc = (ligne: Row): boolean => estLigneTotal(ligne);

function cleComposite(ligne: Row, indices: number[]): string | null {
  const morceaux: string[] = [];
  for (const i of indices) {
    const brut = i >= 0 ? ligne[i] : undefined;
    if (valeurTdcInvalide(brut)) return null;
    morceaux.push(String(brut).replace(/["'«»“”]/g, '').trim());
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
  if (agregation === 'min') return a.min === Infinity ? null : arrondir(a.min);
  return a.max === -Infinity ? null : arrondir(a.max);
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
    // Écarte les lignes de totalisation administrative
    if (estLigneTotalTdc(ligne)) continue;

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
      const n = parseNombreTdc(brut);
      if (n !== null && Number.isFinite(n)) ajouter(accs[k], n);
    }
  }

  const tri = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });
  // Périodes (mois, trimestres, dates…) dans l'ordre du calendrier, le reste par ordre alphabétique
  const ordonner = (vues: Set<string>) => {
    const liste = Array.from(vues);
    return trierChronologiquement(liste, (x) => x) ?? liste.sort(tri);
  };
  const lignes = ordonner(lignesVues);
  const colsBase = avecColonnes ? ordonner(colsVues) : [VALEUR_UNIQUE];
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

  const scoreVecteur = (vals: (number | null)[]) => {
    const valides = vals.filter((v): v is number => v !== null && !isNaN(v));
    if (!valides.length) return 0;
    if (agregation === 'moyenne') return valides.reduce((a, b) => a + b, 0) / valides.length;
    if (agregation === 'min') return Math.min(...valides);
    if (agregation === 'max') return Math.max(...valides);
    return valides.reduce((a, b) => a + b, 0);
  };

  if (lignes.length > NB_MAX_LIGNES_TDC) {
    const gardes = matrice
      .map((row, i) => ({ i, score: scoreVecteur(row) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, NB_MAX_LIGNES_TDC)
      .map((x) => x.i)
      .sort((a, b) => a - b);
    lignes = gardes.map((i) => brut.lignes[i]);
    matrice = gardes.map((i) => brut.matrice[i]);
    tronque = true;
  }

  if (colonnes.length > NB_MAX_COLONNES_TDC) {
    const gardees = colonnes
      .map((_, j) => ({ j, score: scoreVecteur(matrice.map((row) => row[j])) }))
      .sort((a, b) => b.score - a.score)
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
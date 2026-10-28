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

// Limites étendues pour préserver l'ensemble des 33 régions de CI et les séries historiques de 65+ ans
export const NB_MAX_LIGNES_TDC = 100;
export const NB_MAX_COLONNES_TDC = 25;

const arrondir = (v: number): number => Math.round(v * 100) / 100;

export function parseNombreTdc(val: Cell): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;

  let str = String(val).replace(/^\uFEFF/, '').trim();
  if (str === '') return null;

  // 1. Purge des guillemets doubles et simples (ex: "-402,6" -> -402,6)
  str = str.replace(/["'«»“”]/g, '').trim();

  // 2. Gestion de la notation comptable négative entre parenthèses : (1 250) -> -1250
  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.slice(1, -1);
  }

  // 3. Normalisation des tirets négatifs (Unicode minus, en-dash, em-dash)
  str = str.replace(/^[−–—]\s*/, '-');

  // 4. Nettoyage des devises, unités monétaires et pourcentages
  str = str.replace(/\b(FCFA|CFA|XOF|EUR|USD|GBP)\b/gi, '').trim();
  str = str.replace(/[€$£%]/g, '').trim();

  // 5. Suppression des espaces standards et insécables (\u00A0, \u202F)
  str = str.replace(/[\s\u00A0\u202F]+/g, '');

  if (str === '' || str === '-' || str === '+' || str === '—' || str === '.') return null;

  // 6. Normalisation de la virgule et du point décimal
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') < str.lastIndexOf('.')) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if ((str.match(/,/g) || []).length > 1) {
    str = str.replace(/,/g, '');
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, '');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const num = Number(str);
  return isNaN(num) ? null : num;
}

export function valeurTdcInvalide(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v)
    .replace(/^\uFEFF/, '')
    .replace(/["'«»“”]/g, '')
    .trim()
    .toLowerCase();
  return (
    s === '' ||
    s === '-' ||
    s === '—' ||
    s === '–' ||
    s === '.' ||
    s === '..' ||
    /^(n\/?a|na|n\.?a\.?|#n\/a|null|undefined|none|vide|missing|n\.?d\.?|nd|s\/?o|so)$/i.test(s)
  );
}

/**
 * Détecte et exclut les lignes de totalisation ou calculées
 * (ex: "Variation 2023/2022", "TOTAL", "Sous-total").
 */
function estLigneTotalTdc(ligne: Row): boolean {
  if (!ligne || ligne.length === 0) return true;
  const premierNonVide = ligne.find((c) => !valeurTdcInvalide(c));
  if (!premierNonVide) return true;
  const s = String(premierNonVide)
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return /^(total|sous[- ]?total|variation|moyenne|ensemble|general|bilan|somme|ecart)/i.test(s);
}

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
  const lignes = Array.from(lignesVues).sort(tri);
  const colsBase = avecColonnes ? Array.from(colsVues).sort(tri) : [VALEUR_UNIQUE];
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
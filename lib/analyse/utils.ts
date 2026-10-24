// src/lib/analyse/utils.ts
// Portage TypeScript des fonctions de base du moteur d'analyse DATENZA
// (estValeurVideUniverselle, versNumeriques, statistiquesNumeriquesLocales...)

export type Cellule = string | number | boolean | null | undefined;

export interface StatsNumeriques {
  n: number;
  moyenne: number | null;
  mediane: number | null;
  ecartType: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  atypiques: number;
}
/**
 * Détecte l'unité monétaire ou le pourcentage dominant dans un échantillon de valeurs brutes d'une colonne.
 */
export function detecterUniteColonne(valeursBrutes: Cellule[]): string | null {
  const echantillon = valeursBrutes
    .filter((v) => !estValeurVide(v))
    .slice(0, 50)
    .map((v) => String(v).trim().toUpperCase());

  if (echantillon.length === 0) return null;

  let comptePourcentage = 0;
  let compteFCFA = 0;
  let compteEuro = 0;
  let compteDollar = 0;

  for (const v of echantillon) {
    if (v.includes('%')) comptePourcentage++;
    else if (v.includes('FCFA') || v.includes('CFA')) compteFCFA++;
    else if (v.includes('€') || v.includes('EUR')) compteEuro++;
    else if (v.includes('$') || v.includes('USD')) compteDollar++;
  }

  const seuil = echantillon.length * 0.5; // Doit être présent dans 50% des lignes non vides

  if (comptePourcentage >= seuil) return '%';
  if (compteFCFA >= seuil) return 'FCFA';
  if (compteEuro >= seuil) return '€';
  if (compteDollar >= seuil) return '$';

  return null;
}

/**
 * Formate un nombre selon l'unité détectée
 */
export function formaterValeurAvecUnite(valeur: number, unite: string | null): string {
  // On s'assure d'avoir max 2 décimales pour l'affichage
  const valArrondie = Math.round(valeur * 100) / 100;
  
  // Formatage avec séparateur de milliers (ex: 14 155)
  const chaineFormatee = valArrondie.toLocaleString('fr-FR');

  if (!unite) return chaineFormatee;
  
  if (unite === '%') return `${chaineFormatee} %`;
  if (unite === 'FCFA') return `${chaineFormatee} FCFA`;
  if (unite === '€') return `${chaineFormatee} €`;
  if (unite === '$') return `$ ${chaineFormatee}`;
  
  return chaineFormatee;
}

export function arrondir(v: number): number {
  return Math.round(v * 100) / 100;
}

export function parseNombre(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;

  let str = String(val).trim();
  if (str === '') return null;

  // Gestion des formats comptables entre parenthèses : (15%) -> -15%
  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.slice(1, -1);
  }

  // 1. Nettoyage des devises, du symbole % et des symboles monétaires
  str = str.replace(/(FCFA|CFA|EUR|USD|GBP|[€$£Ff%])/gi, '').trim();

  // 2. Remplacer les espaces insécables et espaces normaux
  str = str.replace(/[\s\u00A0\u202F]+/g, '');

  if (str === '' || str === '-' || str === '+') return null;

  // 3. Gestion des virgules comme séparateur décimal
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf(',') < str.indexOf('.')) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(/\./g, '').replace(',', '.');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const num = Number(str);
  return isNaN(num) ? null : num;
}

/** Vrai pour null, undefined, chaîne vide ou marqueurs courants (N/A, null, vide...). */
export function estValeurVide(v: Cellule): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || /^(n\/?a|na|nan|null|undefined|none|vide|missing)$/i.test(s);
}

/** Convertit une cellule en nombre : délègue à parseNombre pour supporter devises, espaces insécables et formats FR/US. */
export function versNombre(v: Cellule): number | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  return parseNombre(v);
}

/** Convertit une colonne brute en nombres (ignore les cellules vides ou non numériques). */
export function versNumeriques(valeurs: Cellule[]): number[] {
  return valeurs.map(versNombre).filter((n): n is number => n !== null);
}

/** Percentile par interpolation linéaire sur un tableau déjà trié. */
export function percentile(trie: number[], p: number): number {
  const idx = p * (trie.length - 1);
  const bas = Math.floor(idx);
  const haut = Math.ceil(idx);
  if (bas === haut) return trie[bas];
  return trie[bas] + (trie[haut] - trie[bas]) * (idx - bas);
}

export function statistiquesNumeriques(valeurs: number[]): StatsNumeriques {
  if (!valeurs.length) {
    return {
      n: 0, moyenne: null, mediane: null, ecartType: null,
      min: null, max: null, q1: null, q3: null, iqr: null, atypiques: 0,
    };
  }

  const trie = [...valeurs].sort((a, b) => a - b);
  const n = trie.length;
  const moyenne = trie.reduce((s, x) => s + x, 0) / n;
  const variance = trie.reduce((s, x) => s + (x - moyenne) ** 2, 0) / n;

  const q1 = percentile(trie, 0.25);
  const q3 = percentile(trie, 0.75);
  const iqr = q3 - q1;
  const atypiques = trie.filter(
    (x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr
  ).length;

  return {
    n,
    moyenne: arrondir(moyenne),
    mediane: arrondir(percentile(trie, 0.5)),
    ecartType: arrondir(Math.sqrt(variance)),
    min: arrondir(trie[0]),
    max: arrondir(trie[n - 1]),
    q1: arrondir(q1),
    q3: arrondir(q3),
    iqr: arrondir(iqr),
    atypiques,
  };
}
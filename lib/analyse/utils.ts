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

export function arrondir(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Vrai pour null, undefined, chaîne vide ou marqueurs courants (N/A, null, vide...). */
export function estValeurVide(v: Cellule): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || /^(n\/?a|na|nan|null|undefined|none|vide|missing)$/i.test(s);
}

/** Convertit une colonne brute en nombres (accepte la virgule décimale). */
export function versNumeriques(valeurs: Cellule[]): number[] {
  return valeurs
    .map((v) => (typeof v === "string" ? v.trim().replace(",", ".") : v))
    .filter((v) => v !== "" && v !== null && v !== undefined)
    .map(Number)
    .filter((v) => !Number.isNaN(v));
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
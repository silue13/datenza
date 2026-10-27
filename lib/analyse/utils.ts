// src/lib/analyse/utils.ts
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

  const seuil = echantillon.length * 0.5;

  if (comptePourcentage >= seuil) return '%';
  if (compteFCFA >= seuil) return 'FCFA';
  if (compteEuro >= seuil) return '€';
  if (compteDollar >= seuil) return '$';

  return null;
}

export function formaterValeurAvecUnite(valeur: number, unite: string | null): string {
  const valArrondie = Math.round(valeur * 100) / 100;
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

  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.slice(1, -1);
  }

  str = str.replace(/(FCFA|CFA|EUR|USD|GBP|[€$£Ff%])/gi, '').trim();
  str = str.replace(/[\s\u00A0\u202F]+/g, '');

  if (str === '' || str === '-' || str === '+') return null;

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

export function estValeurVide(v: Cellule): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || /^(n\/?a|na|nan|null|undefined|none|vide|missing)$/i.test(s);
}

export function versNombre(v: Cellule): number | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  return parseNombre(v);
}

export function versNumeriques(valeurs: Cellule[]): number[] {
  return valeurs.map(versNombre).filter((n): n is number => n !== null);
}

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
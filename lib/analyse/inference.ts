/**
 * Statistique inférentielle : dire si un écart observé dépasse ce que le hasard produit.
 *
 * - Comparaison de 2 groupes : test t de Welch (ne suppose pas des variances égales).
 * - Comparaison de 3 groupes ou plus : ANOVA de Welch (même robustesse), ANOVA classique en repli.
 * - Lien entre deux catégories : test du khi-deux d'indépendance, avec le V de Cramér.
 * - Corrélation : test de nullité du coefficient de Pearson.
 *
 * Les lois (Student, Fisher, khi-deux) sont calculées ici, sans dépendance : fonctions bêta et
 * gamma incomplètes régularisées (fractions continues de Lentz, méthode classique de
 * « Numerical Recipes »). Les résultats sont vérifiés contre SciPy dans inference.test.ts.
 */

// ---------------------------------------------------------------------------
// Fonctions spéciales
// ---------------------------------------------------------------------------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) pour x > 0 (approximation de Lanczos, g = 7). */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const z = x - 1;
  let s = LANCZOS[0];
  for (let i = 1; i < 9; i++) s += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(s);
}

const EPS = 1e-14;
const TOUT_PETIT = 1e-300;
const MAX_ITER = 500;

function fractionBeta(a: number, b: number, x: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TOUT_PETIT) d = TOUT_PETIT;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TOUT_PETIT) d = TOUT_PETIT;
    c = 1 + aa / c;
    if (Math.abs(c) < TOUT_PETIT) c = TOUT_PETIT;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TOUT_PETIT) d = TOUT_PETIT;
    c = 1 + aa / c;
    if (Math.abs(c) < TOUT_PETIT) c = TOUT_PETIT;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Fonction bêta incomplète régularisée I_x(a, b). */
export function betaIncompleteReg(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const ln = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const facteur = Math.exp(ln);
  return x < (a + 1) / (a + b + 2) ? (facteur * fractionBeta(a, b, x)) / a : 1 - (facteur * fractionBeta(b, a, 1 - x)) / b;
}

/** Fonction gamma incomplète supérieure régularisée Q(a, x) = 1 − P(a, x). */
export function gammaIncompleteSupReg(a: number, x: number): number {
  if (x <= 0) return 1;
  const lnPrefixe = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    // Série pour P(a, x)
    let terme = 1 / a, somme = terme, ap = a;
    for (let n = 0; n < MAX_ITER; n++) {
      ap += 1;
      terme *= x / ap;
      somme += terme;
      if (Math.abs(terme) < Math.abs(somme) * EPS) break;
    }
    return Math.max(0, 1 - somme * Math.exp(lnPrefixe));
  }
  // Fraction continue pour Q(a, x)
  let b = x + 1 - a, c = 1 / TOUT_PETIT, d = 1 / b, h = d;
  for (let i = 1; i <= MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TOUT_PETIT) d = TOUT_PETIT;
    c = b + an / c;
    if (Math.abs(c) < TOUT_PETIT) c = TOUT_PETIT;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.min(1, Math.exp(lnPrefixe) * h);
}

/** p-valeur bilatérale d'une statistique t de Student à `ddl` degrés de liberté. */
export function pStudentBilateral(t: number, ddl: number): number {
  if (!isFinite(t)) return 0;
  return betaIncompleteReg(ddl / 2, 0.5, ddl / (ddl + t * t));
}

/** p-valeur (queue droite) d'une statistique F de Fisher. */
export function pFisher(f: number, ddl1: number, ddl2: number): number {
  if (f <= 0) return 1;
  if (!isFinite(f)) return 0;
  return betaIncompleteReg(ddl2 / 2, ddl1 / 2, ddl2 / (ddl2 + ddl1 * f));
}

/** p-valeur (queue droite) d'une statistique du khi-deux. */
export function pKhiDeux(x: number, ddl: number): number {
  return gammaIncompleteSupReg(ddl / 2, x / 2);
}

// ---------------------------------------------------------------------------
// Descriptifs par groupe
// ---------------------------------------------------------------------------

export interface ResumeGroupe {
  nom: string;
  n: number;
  moyenne: number;
  ecartType: number;
  mediane: number;
  q1: number;
  q3: number;
  /** Moustaches de Tukey : valeurs extrêmes situées à moins de 1,5 × IQR des quartiles. */
  moustacheBasse: number;
  moustacheHaute: number;
  nbAtypiques: number;
}

function quantile(trie: number[], p: number): number {
  const pos = (trie.length - 1) * p;
  const bas = Math.floor(pos), haut = Math.ceil(pos);
  return trie[bas] + (trie[haut] - trie[bas]) * (pos - bas);
}

const moyenneDe = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const varianceDe = (v: number[], m = moyenneDe(v)) => (v.length > 1 ? v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1) : 0);

export function resumerGroupe(nom: string, valeurs: number[]): ResumeGroupe {
  const trie = [...valeurs].sort((a, b) => a - b);
  const moyenne = moyenneDe(trie);
  const q1 = quantile(trie, 0.25), q3 = quantile(trie, 0.75);
  const iqr = q3 - q1;
  const dedans = trie.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
  return {
    nom,
    n: trie.length,
    moyenne,
    ecartType: Math.sqrt(varianceDe(trie, moyenne)),
    mediane: quantile(trie, 0.5),
    q1,
    q3,
    moustacheBasse: dedans[0] ?? trie[0],
    moustacheHaute: dedans[dedans.length - 1] ?? trie[trie.length - 1],
    nbAtypiques: trie.length - dedans.length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export type Ampleur = "negligeable" | "faible" | "moyenne" | "forte";

export interface ResultatTest {
  statistique: number;
  ddl: number | [number, number];
  pValeur: number;
  /** Taille d'effet : d de Cohen (2 groupes), η² (ANOVA) ou V de Cramér (khi-deux). */
  effet: number;
  ampleur: Ampleur;
}

const ampleurD = (d: number): Ampleur => { const a = Math.abs(d); return a >= 0.8 ? "forte" : a >= 0.5 ? "moyenne" : a >= 0.2 ? "faible" : "negligeable"; };
const ampleurEta2 = (e: number): Ampleur => (e >= 0.14 ? "forte" : e >= 0.06 ? "moyenne" : e >= 0.01 ? "faible" : "negligeable");
const ampleurV = (v: number): Ampleur => (v >= 0.5 ? "forte" : v >= 0.3 ? "moyenne" : v >= 0.1 ? "faible" : "negligeable");

/** Test t de Welch. Renvoie null si les deux groupes sont constants (aucune variabilité à tester). */
export function testWelch(a: number[], b: number[]): ResultatTest | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = moyenneDe(a), mb = moyenneDe(b);
  const va = varianceDe(a, ma), vb = varianceDe(b, mb);
  const sa = va / a.length, sb = vb / b.length;
  const se2 = sa + sb;
  if (se2 <= 0) return null;
  const t = (ma - mb) / Math.sqrt(se2);
  const ddl = (se2 * se2) / ((sa * sa) / (a.length - 1) + (sb * sb) / (b.length - 1));
  const sp = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  const d = sp > 0 ? (ma - mb) / sp : 0;
  return { statistique: t, ddl, pValeur: pStudentBilateral(t, ddl), effet: d, ampleur: ampleurD(d) };
}

/**
 * ANOVA à un facteur. Version de Welch si chaque groupe varie (robuste aux variances inégales),
 * ANOVA classique sinon. La taille d'effet est l'η² (part de la variance expliquée par les groupes).
 */
export function anova(groupes: number[][]): (ResultatTest & { methode: "welch" | "classique" }) | null {
  const g = groupes.filter((x) => x.length >= 2);
  const k = g.length;
  if (k < 2) return null;
  const n = g.map((x) => x.length);
  const m = g.map(moyenneDe);
  const v = g.map((x, i) => varianceDe(x, m[i]));
  const N = n.reduce((s, x) => s + x, 0);
  const mGlobale = g.reduce((s, x, i) => s + m[i] * x.length, 0) / N;
  const sce = g.reduce((s, _, i) => s + n[i] * (m[i] - mGlobale) ** 2, 0);
  const scr = g.reduce((s, _, i) => s + (n[i] - 1) * v[i], 0);
  const sct = sce + scr;
  if (sct <= 0) return null;
  const eta2 = sce / sct;

  if (v.every((x) => x > 0)) {
    const w = n.map((ni, i) => ni / v[i]);
    const W = w.reduce((s, x) => s + x, 0);
    const mp = w.reduce((s, wi, i) => s + wi * m[i], 0) / W;
    const A = w.reduce((s, wi, i) => s + wi * (m[i] - mp) ** 2, 0) / (k - 1);
    const tmp = w.reduce((s, wi, i) => s + (1 - wi / W) ** 2 / (n[i] - 1), 0);
    const B = 1 + ((2 * (k - 2)) / (k * k - 1)) * tmp;
    const F = A / B;
    const ddl2 = (k * k - 1) / (3 * tmp);
    return { statistique: F, ddl: [k - 1, ddl2], pValeur: pFisher(F, k - 1, ddl2), effet: eta2, ampleur: ampleurEta2(eta2), methode: "welch" };
  }
  if (N - k <= 0) return null;
  const F = scr > 0 ? sce / (k - 1) / (scr / (N - k)) : Infinity;
  return { statistique: F, ddl: [k - 1, N - k], pValeur: pFisher(F, k - 1, N - k), effet: eta2, ampleur: ampleurEta2(eta2), methode: "classique" };
}

export interface ResultatKhiDeux extends ResultatTest {
  /** Vrai si plus de 20 % des effectifs attendus sont inférieurs à 5 (le test devient approximatif). */
  approximatif: boolean;
  /** Case la plus sur-représentée par rapport à l'indépendance (résidu standardisé maximal). */
  ecartMax: { ligne: string; colonne: string; observe: number; attendu: number } | null;
}

/** Test du khi-deux d'indépendance sur un tableau de contingence (lignes × colonnes). */
export function testKhiDeux(table: number[][], libellesLignes: string[] = [], libellesColonnes: string[] = []): ResultatKhiDeux | null {
  const r = table.length, c = table[0]?.length ?? 0;
  if (r < 2 || c < 2) return null;
  const totL = table.map((l) => l.reduce((s, x) => s + x, 0));
  const totC = table[0].map((_, j) => table.reduce((s, l) => s + l[j], 0));
  const N = totL.reduce((s, x) => s + x, 0);
  if (N === 0 || totL.some((x) => x === 0) || totC.some((x) => x === 0)) return null;
  let khi2 = 0, petits = 0, residuMax = -Infinity;
  let ecartMax: ResultatKhiDeux["ecartMax"] = null;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const att = (totL[i] * totC[j]) / N;
      khi2 += (table[i][j] - att) ** 2 / att;
      if (att < 5) petits++;
      const residu = (table[i][j] - att) / Math.sqrt(att);
      if (residu > residuMax) {
        residuMax = residu;
        ecartMax = { ligne: libellesLignes[i] ?? String(i), colonne: libellesColonnes[j] ?? String(j), observe: table[i][j], attendu: att };
      }
    }
  }
  const ddl = (r - 1) * (c - 1);
  const V = Math.sqrt(khi2 / (N * (Math.min(r, c) - 1)));
  return {
    statistique: khi2,
    ddl,
    pValeur: pKhiDeux(khi2, ddl),
    effet: V,
    ampleur: ampleurV(V),
    approximatif: petits / (r * c) > 0.2,
    ecartMax,
  };
}

/** p-valeur bilatérale du test « le coefficient de corrélation de Pearson est nul ». */
export function pCorrelation(r: number, n: number): number | null {
  if (n < 3) return null;
  if (Math.abs(r) >= 1) return 0;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  return pStudentBilateral(t, n - 2);
}

/** Correction de Holm-Bonferroni : p-valeurs ajustées, dans l'ordre d'origine. */
export function corrigerHolm(pValeurs: number[]): number[] {
  const m = pValeurs.length;
  const ordre = pValeurs.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const ajustees = new Array<number>(m);
  let max = 0;
  ordre.forEach(({ p, i }, rang) => {
    max = Math.max(max, Math.min(1, (m - rang) * p));
    ajustees[i] = max;
  });
  return ajustees;
}

// ---------------------------------------------------------------------------
// Formatage et interprétation
// ---------------------------------------------------------------------------

export const SEUIL_SIGNIFICATIVITE = 0.05;

export function formaterP(p: number, langue: "fr" | "en" = "fr"): string {
  const virgule = (s: string) => (langue === "fr" ? s.replace(".", ",") : s);
  if (p < 0.001) return `p < ${virgule("0.001")}`;
  // La correction de Holm plafonne à 1 : « p = 1,00 » laisserait croire à une certitude
  if (p > 0.99) return `p > ${virgule("0.99")}`;
  return `p = ${virgule(p < 0.01 ? p.toFixed(3) : p.toFixed(2))}`;
}

/** Accord au masculin, pour « un effet fort », « un effet moyen ». */
export const LIBELLES_EFFET: Record<Ampleur, { fr: string; en: string }> = {
  negligeable: { fr: "négligeable", en: "negligible" },
  faible: { fr: "faible", en: "small" },
  moyenne: { fr: "moyen", en: "medium" },
  forte: { fr: "fort", en: "large" },
};

export const LIBELLES_AMPLEUR: Record<Ampleur, { fr: string; en: string }> = {
  negligeable: { fr: "négligeable", en: "negligible" },
  faible: { fr: "faible", en: "small" },
  moyenne: { fr: "moyenne", en: "medium" },
  forte: { fr: "forte", en: "large" },
};

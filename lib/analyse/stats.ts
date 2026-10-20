import { arrondir, estValeurVide, type Cellule } from "./utils";

export function regressionLineaire(y: number[]) {
  const n = y.length;
  const mx = (n - 1) / 2;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0, sce = 0, sct = 0;
  y.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  const pente = den ? num / den : 0;
  const origine = my - pente * mx;
  y.forEach((v, i) => { sce += (v - (pente * i + origine)) ** 2; sct += (v - my) ** 2; });
  return { pente, origine, r2: sct ? 1 - sce / sct : 0 };
}

export function calculerTendance(valeurs: number[]) {
  if (valeurs.length < 3) return null;
  const { pente, origine, r2 } = regressionLineaire(valeurs);
  return {
    direction: pente > 0.0001 ? "hausse" : pente < -0.0001 ? "baisse" : "stable",
    pente: arrondir(pente),
    r2: arrondir(r2),
    predictionProchaineValeur: arrondir(pente * valeurs.length + origine),
  };
}

export function correlationPearson(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
    vy += (y[i] - my) ** 2;
  }
  return vx && vy ? arrondir(cov / Math.sqrt(vx * vy)) : 0;
}

export function interpreterCorrelation(r: number, langue: "fr" | "en" = "fr") {
  const a = Math.abs(r);
  const f = langue === "en"
    ? (a >= 0.8 ? "very strong" : a >= 0.6 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "almost zero")
    : (a >= 0.8 ? "très forte" : a >= 0.6 ? "forte" : a >= 0.4 ? "modérée" : a >= 0.2 ? "faible" : "quasi nulle");
  const sens = langue === "en" ? (r >= 0 ? "positive" : "negative") : (r >= 0 ? "positive" : "négative");
  return `${f} ${langue === "en" ? "and" : "et"} ${sens}`;
}

export function calculerFrequences(valeurs: Cellule[]) {
  const compteur = new Map<string, number>();
  let total = 0;
  for (const v of valeurs) {
    if (estValeurVide(v)) continue;
    const k = String(v).trim();
    compteur.set(k, (compteur.get(k) ?? 0) + 1);
    total++;
  }
  const trie = [...compteur]
    .map(([valeur, effectif]) => ({ valeur, effectif, pourcentage: arrondir((100 * effectif) / total) }))
    .sort((a, b) => b.effectif - a.effectif);
  return { total, nbCategoriesDistinctes: trie.length, topValeurs: trie.slice(0, 5) };
}
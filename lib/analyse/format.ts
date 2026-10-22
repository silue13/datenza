export type NatureValeur = "prix" | "pourcentage" | "nombre";

const PRIX = /^(prix|montants?|couts?|tarifs?|salaires?|revenus?|recettes?|depenses?|budgets?|loyers?|frais|paiements?|price|cost|amount|revenue|salary|fees?)$/;
const POURCENT = /^(taux|pourcent\w*|pct|ratio|rate|percent\w*)$/;

/** Devine la nature d'une colonne d'après son nom (mots entiers : « frais » ne matche pas « fraise »). */
export function natureValeur(nom: string): NatureValeur {
  const mots = nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (mots.some((m) => PRIX.test(m))) return "prix";
  if (mots.some((m) => POURCENT.test(m))) return "pourcentage";
  return "nombre";
}

export function creerFormateurs(langue: "fr" | "en", devise = "FCFA") {
  const loc = langue === "en" ? "en-US" : "fr-FR";
  const sansDecimale = ["FCFA", "XOF", "XAF"].includes(devise.toUpperCase());
  const nf = (max: number) => new Intl.NumberFormat(loc, { maximumFractionDigits: max });
  const nombre = (v: number) => nf(2).format(v);
  const prix = (v: number) => `${nf(sansDecimale ? 0 : 2).format(v)}\u00A0${devise}`;
  const pourcent = (v: number) => `${nf(2).format(v)}${langue === "en" ? "" : "\u00A0"}%`;
  return {
    nombre,
    prix,
    pourcent,
    pour: (nature: NatureValeur) => (nature === "prix" ? prix : nature === "pourcentage" ? pourcent : nombre),
  };
}
// lib/analyse/utils.ts
import { convertirDate, estAnnee, estPeriode } from "./dates";

export type Cellule = string | number | boolean | null | undefined;

export interface StatsNumeriques {
  n: number;
  somme: number | null;
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
 * Normalise une chaîne de caractères :
 * Supprime le BOM UTF-8, retire les accents et passe en minuscules.
 */
export function normaliserTexte(txt: string | null | undefined): string {
  if (!txt) return "";
  return String(txt)
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Découpe un nom de colonne en mots simples : « Nb_Clients (2024) » -> ["nb", "clients", "2024"]. */
function motsDe(nom: string): string[] {
  return normaliserTexte(nom)
    .replace(/n°/g, " numero ")
    .split(/[^a-z0-9%€$£]+/)
    .filter(Boolean);
}

/**
 * Nettoie une liste d'en-têtes en purgeant le BOM et les guillemets résiduels.
 */
export function nettoyerEntetes(entetes: string[]): string[] {
  return entetes.map((h) =>
    String(h ?? "")
      .replace(/^﻿/, "")
      .replace(/^["']|["']$/g, "")
      .trim()
  );
}

const RE_LIGNE_TOTAL =
  /^(grand[- ]?total|sous[- ]?totaux?|sub[- ]?totals?|totaux?|totals?|somme|sum|ensemble|moyenne|average|variation|ecart|bilan)(\s*(general|generale|generaux|global|globale|cumule|cumulee|\(.*\)|[:=].*|\d.*))?$/;

/**
 * Détecte si une ligne est une ligne de calcul parasite (Total, Sous-total, Variation 2023/2022…).
 * Le mot doit constituer le libellé à lui seul : « Moyenne gamme », « Totalgaz » ou « Sommelier »
 * sont de vraies données et sont conservées.
 */
export function estLigneTotal(ligne: Cellule[]): boolean {
  if (!ligne || ligne.length === 0) return true;
  const premierNonVide = ligne.find((c) => !estValeurVide(c));
  if (premierNonVide === undefined) return true;
  if (typeof premierNonVide !== "string") return false;
  const s = normaliserTexte(premierNonVide).replace(/["'«»“”*]/g, "").replace(/\s+/g, " ").trim();
  if (RE_LIGNE_TOTAL.test(s)) return true;
  // « Total Poro », « Sous-total Nord » : sous-totaux par groupe
  return /^(sous[- ]?total|sub[- ]?total|total)\s+\S/.test(s) && ligne.filter((c) => !estValeurVide(c)).length >= 2
    ? !/^total\s?(energies|gaz|fina|sa|sarl|ci)\b/.test(s)
    : false;
}

const RE_VIDE =
  /^(n\/?a|na|nan|null|undefined|none|vide|missing|n\.?d\.?|nd|s\/?o|so|n\.?c\.?|-+|—+|–+|\.+|\?+|#n\/a|#na|#div\/0!?|#value!?|#valeur!?|#ref!?|#nom\??|#name\??|#null!?|#nul!?|#num!?|#nombre!?)$/i;

/**
 * Vérifie si une cellule est vide ou correspond à une mention d'absence de donnée
 * (ex: "-", "—", "ND", "N/A", "SO", "#DIV/0!").
 */
export function estValeurVide(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return Number.isNaN(v);
  if (typeof v === "boolean") return false;
  const s = String(v)
    .replace(/^﻿/, "")
    .replace(/["'«»“”]/g, "")
    .trim();
  return s === "" || RE_VIDE.test(s);
}

const RE_DEVISE =
  /(f\.?\s?cfa|fcfa|cfa|xof|xaf|eur|euros?|usd|gbp|chf|cad|mad|dhs?|tnd|dzd|ngn|ghs|kes|zar|jpy|cny|dollars?|francs?|€|\$|£|¥|₦|₵|%|‰)/gi;
const UNITES_COLLEES =
  /^(kg|g|mg|t|km|m|cm|mm|ha|m2|m²|m3|m³|km2|km²|l|ml|cl|hl|h|mn|min|s|j|ans?|mois|°c|°f|°|kwh|mwh|gwh|kw|mw|w|v|go|mo|ko|gb|mb|kb|pts?|f|x)$/i;
const UNITES_MOTS =
  /^(jours?|heures?|minutes?|secondes?|semaines?|annees?|pieces?|unites?|personnes?|habitants?|hab|tonnes?|litres?|points?|sacs?|tetes?|plants?|pieds?|hectares?|kilos?|kg\/ha|t\/ha|hab\/km2|hab\/km²|km\/h|m\/s|fois)$/i;
const MULTIPLICATEURS: Record<string, number> = {
  k: 1e3, K: 1e3, M: 1e6, Md: 1e9, Mds: 1e9, Mrd: 1e9, Mrds: 1e9, Bn: 1e9, B: 1e9,
  millier: 1e3, milliers: 1e3, mille: 1e3, million: 1e6, millions: 1e6, milliard: 1e9, milliards: 1e9,
};

/**
 * Convertit toute cellule en nombre exploitable, ou null si ce n'en est pas un.
 * Gère : « 1 250,50 », « 1,250.50 », « 1.250,50 », « 1'250 », « (1 250) », « 1250- », « −12 »,
 * « 12 % », « 1 500 FCFA », « $ 1,200 », « 35 kg », « 1,5 M », « 2,3 milliards », « 1.2e3 ».
 * Refuse : dates, adresses IP, numéros de version, « 12A », « Infinity », texte.
 */
export function parseNombre(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val !== "string") return null;

  let str = val.replace(/^﻿/, "").trim();
  if (str === "" || str.length > 40) return null;

  // 1. Guillemets d'encadrement
  str = str.replace(/["«»“”]/g, "").replace(/^['’]+|['’]+$/g, "").trim();
  if (!/\d/.test(str)) return null;

  // 2. Négatifs : notation comptable (1 250), tirets typographiques, signe moins final (SAP)
  let signe = 1;
  if (/^\(.*\)$/.test(str)) {
    signe = -1;
    str = str.slice(1, -1).trim();
  }
  str = str.replace(/^[−–—]\s*/, "-");
  if (/\d\s*-$/.test(str) && !str.startsWith("-")) str = "-" + str.replace(/\s*-$/, "");

  // 3. Devises et pourcentages, où qu'ils soient
  str = str.replace(RE_DEVISE, " ").trim();

  // 4. Multiplicateur ou unité en fin de valeur : « 1,5 M », « 35 kg », « 12 ans »
  let facteur = 1;
  const fin = str.match(/^([-+]?[\d\s   .,'’]*\d)\s*([^\d\s][^\d]*)$/);
  if (fin) {
    const suffixe = fin[2].trim();
    const colle = !/\s/.test(str.slice(fin[1].length, fin[1].length + 1));
    if (MULTIPLICATEURS[suffixe] !== undefined) facteur = MULTIPLICATEURS[suffixe];
    else if (MULTIPLICATEURS[suffixe.toLowerCase()] !== undefined && suffixe.length > 2) facteur = MULTIPLICATEURS[suffixe.toLowerCase()];
    else if (UNITES_COLLEES.test(suffixe) || (!colle && UNITES_MOTS.test(normaliserTexte(suffixe)))) facteur = 1;
    else return null;
    str = fin[1];
  }

  // 5. Espaces (dont insécables) et apostrophes de milliers
  str = str.replace(/[\s   ]+/g, "").replace(/(\d)['’](?=\d{3})/g, "$1");
  if (str === "") return null;

  // 6. Séparateurs de milliers et de décimales
  const nbVirgules = (str.match(/,/g) || []).length;
  const nbPoints = (str.match(/\./g) || []).length;
  if (nbVirgules && nbPoints) {
    if (str.lastIndexOf(",") < str.lastIndexOf(".")) {
      if (nbPoints > 1) return null;
      str = str.replace(/,/g, "");
    } else {
      if (nbVirgules > 1) return null;
      str = str.replace(/\./g, "").replace(",", ".");
    }
  } else if (nbVirgules > 1) {
    if (!/^[-+]?\d{1,3}(,\d{3})+$/.test(str)) return null;
    str = str.replace(/,/g, "");
  } else if (nbPoints > 1) {
    if (!/^[-+]?\d{1,3}(\.\d{3})+$/.test(str)) return null;
    str = str.replace(/\./g, "");
  } else if (nbVirgules === 1) {
    str = str.replace(",", ".");
  }

  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(str)) return null;
  const num = Number(str) * signe * facteur;
  return Number.isFinite(num) ? num : null;
}

export function versNombre(v: Cellule): number | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  return parseNombre(v);
}

export function versNumeriques(valeurs: Cellule[]): number[] {
  return valeurs.map(versNombre).filter((n): n is number => n !== null);
}

/**
 * Arrondi d'affichage : 2 décimales pour les valeurs courantes,
 * 4 chiffres significatifs pour les petites valeurs (0,00342 ne devient plus 0).
 */
export function arrondir(v: number): number {
  if (!Number.isFinite(v)) return v;
  const a = Math.abs(v);
  if (a === 0 || a >= 1) return Math.round(v * 100) / 100;
  return Number(v.toPrecision(4));
}

const MOTS_MESURE = new Set([
  "prix", "cout", "couts", "revenu", "revenus", "montant", "montants", "budget", "budgets", "chiffre", "ca", "marge",
  "benefice", "valeur", "valeurs", "effectif", "effectifs", "poids", "superficie", "surface", "quantite", "quantites",
  "qte", "volume", "solde", "score", "depense", "depenses", "salaire", "salaires", "taux", "ratio", "pourcentage",
  "nombre", "nb", "nbre", "total", "totaux", "somme", "part", "duree", "age", "production", "rendement", "recette",
  "recettes", "vente", "ventes", "stock", "population", "distance", "note", "moyenne", "amount", "price", "cost",
  "revenue", "sales", "quantity", "qty", "count", "rate", "weight", "profit", "balance",
]);
const MOTS_ID_FORTS = new Set([
  "id", "ids", "uuid", "guid", "identifiant", "matricule", "ref", "reference", "numero", "num", "no", "code", "codes",
  "tel", "telephone", "phone", "mobile", "cin", "cni", "siret", "siren", "iban", "rib", "email", "mail", "courriel",
  "isbn", "sku", "postal", "zip", "immatriculation", "cle", "key",
]);
const MOTS_ID_FAIBLES = new Set([
  "dossier", "demande", "parcelle", "compte", "client", "ordre", "rang", "index", "sequence", "lot", "titre",
  "facture", "commande", "ticket", "contrat",
]);

/**
 * Détermine si une colonne est un identifiant / numéro de référence
 * et ne doit jamais faire l'objet de calculs additifs (sommes, moyennes, prévisions).
 * Une vraie mesure (« Nombre de dossiers », « Montant », ventes toutes différentes) n'est jamais écartée.
 */
export function estColonneIdentifiant(nomColonne: string, valeurs: Cellule[]): boolean {
  const mots = motsDe(nomColonne);

  // 1. Un mot de mesure ou une unité monétaire dans le nom : ce n'est jamais un identifiant
  if (mots.some((m) => MOTS_MESURE.has(m))) return false;
  if (/(fcfa|cfa|xof|eur|usd|gbp|[€$£%])/i.test(normaliserTexte(nomColonne))) return false;

  // 2. Mots-clés sans ambiguïté
  if (mots.some((m) => MOTS_ID_FORTS.has(m))) return true;

  const nonVides = valeurs.filter((v) => !estValeurVide(v));
  if (nonVides.length < 10) return false;
  const echantillon = nonVides.length > 5000 ? nonVides.slice(0, 5000) : nonVides;
  const uniques = new Set(echantillon.map((v) => String(v).trim()));
  const tauxUnicite = uniques.size / echantillon.length;

  // 3. Mots-clés ambigus (« Client », « Dossier ») : identifiant seulement si les valeurs ne se répètent presque pas
  if (mots.some((m) => MOTS_ID_FAIBLES.has(m))) return tauxUnicite >= 0.9;

  // 4. Détection statistique : entiers uniques formant une numérotation
  if (tauxUnicite < 0.98 || echantillon.length < 20) return false;
  const nombres = echantillon.map(versNombre);
  if (!nombres.every((n) => n !== null && Number.isInteger(n) && n >= 0)) return false;
  const entiers = nombres as number[];
  if (entiers.every((n) => n >= 1800 && n <= 2100)) return false;

  const textes = echantillon.map((v) => String(v).trim());
  if (textes.some((s) => /^0\d/.test(s))) return true; // zéros initiaux : « 00123 »

  let min = Infinity;
  let max = -Infinity;
  for (const n of entiers) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return max - min + 1 <= echantillon.length * 1.2; // suite dense : 1001, 1002, 1003…
}

const MOTS_TEMPS = new Set([
  "annee", "annees", "an", "date", "dates", "periode", "periodes", "mois", "trimestre", "trimestres", "semestre",
  "semaine", "semaines", "exercice", "exercices", "campagne", "jour", "year", "years", "month", "months", "quarter",
  "week", "day", "period", "time", "timestamp", "millesime",
]);
const MOTS_PAS_TEMPS = new Set([
  "duree", "nombre", "nb", "nbre", "age", "montant", "total", "delai", "anciennete", "par", "en", "taux", "prix",
  "cout", "moyenne", "moyen", "valeur", "quantite",
]);

/**
 * Détecte si une colonne représente un axe temporel (date, année, mois, trimestre, campagne).
 * Le nom ne suffit plus : les valeurs doivent ressembler à des périodes
 * (« Durée en mois » ou « Mise à jour par » ne sont pas des axes de temps).
 */
export function estColonneTemporelle(nomColonne: string, valeurs: Cellule[]): boolean {
  const mots = motsDe(nomColonne);
  const tous = valeurs.filter((v) => !estValeurVide(v));
  if (tous.length === 0) return false;
  const nonVides = tous.length > 3000 ? tous.slice(0, 3000) : tous;
  const total = nonVides.length;

  let nbAnnees = 0;
  let nbDates = 0;
  let nbPeriodes = 0;
  let nbPetitsEntiers = 0;
  for (const v of nonVides) {
    if (estAnnee(v)) nbAnnees++;
    else if (convertirDate(v)) nbDates++;
    else if (typeof v === "string" && estPeriode(v)) nbPeriodes++;
    else {
      const n = versNombre(v);
      if (n !== null && Number.isInteger(n) && n >= 1 && n <= 53) nbPetitsEntiers++;
    }
  }

  if (nbDates / total >= 0.8) return true;
  if ((nbDates + nbPeriodes + nbAnnees) / total >= 0.9 && nbDates + nbPeriodes > 0) return true;
  if (normaliserTexte(nomColonne) === "indicateur" && nbAnnees / total >= 0.7) return true;

  const aMotTemps = mots.some((m) => MOTS_TEMPS.has(m));
  const aMotContraire = mots.some((m) => MOTS_PAS_TEMPS.has(m));
  if (aMotTemps && !aMotContraire) {
    return (nbDates + nbPeriodes + nbAnnees + nbPetitsEntiers) / total >= 0.6;
  }

  // Sans indice dans le nom : une colonne d'années pures et peu nombreuses (2015, 2016, … répétées)
  if (!aMotContraire && nbAnnees / total >= 0.95) {
    const distinctes = new Set(nonVides.map((v) => String(v).trim())).size;
    return distinctes <= 200 && !mots.some((m) => MOTS_MESURE.has(m));
  }
  return false;
}

export function detecterUniteColonne(nomColonne: string, valeursBrutes: Cellule[]): string | null {
  const nomNorm = nomColonne.toUpperCase();
  if (nomNorm.includes("%")) return "%";
  if (nomNorm.includes("FCFA") || nomNorm.includes("CFA")) return "FCFA";
  if (/\bMILLIARDS?\b|\bMDS?\b|\bMRDS?\b/.test(nomNorm)) return "milliards";
  if (nomNorm.includes("€") || nomNorm.includes("EUR")) return "€";
  if (nomNorm.includes("$") || nomNorm.includes("USD")) return "$";

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
    if (v.includes("%")) comptePourcentage++;
    else if (v.includes("FCFA") || v.includes("CFA")) compteFCFA++;
    else if (v.includes("€") || v.includes("EUR")) compteEuro++;
    else if (v.includes("$") || v.includes("USD")) compteDollar++;
  }

  const seuil = echantillon.length * 0.4;
  if (comptePourcentage >= seuil) return "%";
  if (compteFCFA >= seuil) return "FCFA";
  if (compteEuro >= seuil) return "€";
  if (compteDollar >= seuil) return "$";

  return null;
}

export function formaterValeurAvecUnite(valeur: number, unite: string | null): string {
  const valArrondie = Math.round(valeur * 100) / 100;
  const chaineFormatee = valArrondie.toLocaleString("fr-FR");

  if (!unite) return chaineFormatee;
  if (unite === "%") return `${chaineFormatee} %`;
  if (unite === "FCFA") return `${chaineFormatee} FCFA`;
  if (unite === "milliards") return `${chaineFormatee} Mrd`;
  if (unite === "€") return `${chaineFormatee} €`;
  if (unite === "$") return `$ ${chaineFormatee}`;

  return `${chaineFormatee} ${unite}`;
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
      n: 0,
      somme: null,
      moyenne: null,
      mediane: null,
      ecartType: null,
      min: null,
      max: null,
      q1: null,
      q3: null,
      iqr: null,
      atypiques: 0,
    };
  }

  const trie = [...valeurs].sort((a, b) => a - b);
  const n = trie.length;
  const somme = trie.reduce((s, x) => s + x, 0);
  const moyenne = somme / n;
  // Écart-type d'échantillon (n - 1), comme Excel ECARTYPE et Power BI
  const variance = n > 1 ? trie.reduce((s, x) => s + (x - moyenne) ** 2, 0) / (n - 1) : 0;

  const q1 = percentile(trie, 0.25);
  const q3 = percentile(trie, 0.75);
  const iqr = q3 - q1;
  // Sans dispersion centrale (iqr = 0, ex. colonne remplie de zéros), la règle de Tukey
  // classerait toute valeur différente comme atypique : on ne signale rien dans ce cas.
  const atypiques = iqr > 0 ? trie.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr).length : 0;

  return {
    n,
    somme: arrondir(somme),
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

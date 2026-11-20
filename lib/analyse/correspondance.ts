// lib/analyse/correspondance.ts — rapprochement des colonnes de plusieurs fichiers, même quand leurs noms diffèrent
// (« CA » = « Chiffre d'affaires » = « Ventes », « Code client » = « Réf client » = « Code », « Nom » = « Client »).
import { parseNombre, estValeurVide, type Cellule } from "./utils";
import { convertirDate, formaterDateISO } from "./dates";
import { detecterTypeColonne } from "./detection";

export interface FichierAComparer {
  nom: string;
  entetes: string[];
  corps: Cellule[][];
}

export type NatureColonne = "numerique" | "date" | "texte";

/** Une colonne « unifiée » : la même information dans chaque fichier, quel que soit son nom. */
export interface ColonneUnifiee {
  /** Nom retenu : celui du premier fichier qui la contient. */
  nom: string;
  /** Position de la colonne dans chaque fichier (-1 si le fichier ne l'a pas). */
  indices: number[];
  /** Nom de la colonne dans chaque fichier ("" si absente). */
  variantes: string[];
  /** Pour chaque fichier : correspondance choisie à la main (true) ou trouvée automatiquement (false). */
  manuelle: boolean[];
  nature: NatureColonne;
}

/**
 * Correspondances choisies à la main, par nom de fichier :
 * { "paiements.csv": { "Montant TTC": "Montant réglé", "Client": null } }.
 * La clé intérieure est le nom de la colonne dans le premier fichier ; null = « aucune colonne ».
 */
export type CorrespondancesManuelles = Record<string, Record<string, string | null>>;

export const COLONNE_SOURCE = "Fichier Source";

// ---------------------------------------------------------------------------
// Valeurs : normalisation commune à la clé et au rapprochement
// ---------------------------------------------------------------------------

const RE_NOMBRE_SEUL = /^[-+−]?\d[\d\s  ]*([.,]\d+)?$/;
const RE_DATE_COMPLETE = /^(\d{1,2}[/\-.]\d{1,2}[/\-.](\d{4}|\d{2})|\d{4}[/\-]\d{1,2}[/\-]\d{1,2})([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;

/**
 * Valeur de rapprochement d'une cellule, quel que soit son type :
 * - nombres : 1001, « 1001 », « 1 001 » et « 1001,00 » se retrouvent ;
 * - dates : une date Excel, « 05/01/2025 » et « 2025-01-05 » se retrouvent ;
 * - texte : sans casse, sans accents, espaces superflus retirés (« F2025-0001 » = « f2025-0001 »).
 */
export function normaliserValeurCle(v: Cellule | Date): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : formaterDateISO(v).slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? `n:${Number(v.toPrecision(15))}` : "";
  if (typeof v === "boolean") return v ? "vrai" : "faux";
  const s = String(v).trim();
  if (!s || estValeurVide(s)) return "";
  if (RE_NOMBRE_SEUL.test(s)) {
    const n = parseNombre(s);
    if (n !== null) return `n:${Number(n.toPrecision(15))}`;
  }
  if (RE_DATE_COMPLETE.test(s)) {
    const d = convertirDate(s);
    if (d) return formaterDateISO(d).slice(0, 10);
  }
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Noms de colonnes : mots, synonymes et score de ressemblance
// ---------------------------------------------------------------------------

/** Nom de colonne réduit à l'essentiel (sans casse, accents, espaces ni ponctuation). */
export function cleNomColonne(nom: string): string {
  return sansAccents(nom).replace(/[^a-z0-9]/g, "");
}

function sansAccents(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "en", "et", "a", "au", "aux", "par", "pour", "the", "of"]);

/** Mots équivalents ramenés à un même sens. */
const SYNONYMES: Record<string, string> = {};
const groupes: [string, string[]][] = [
  ["#id", ["n", "no", "nr", "num", "numero", "ref", "reference", "code", "id", "identifiant", "matricule"]],
  ["quantite", ["qte", "qt", "quantite", "quantites", "qty", "quantity"]],
  ["ville", ["ville", "localite", "commune", "city", "lieu", "localisation", "town"]],
  ["categorie", ["categorie", "categories", "famille", "category", "gamme", "rayon"]],
  ["produit", ["produit", "produits", "article", "articles", "item", "designation", "product"]],
  ["statut", ["statut", "status", "etat", "state"]],
  ["montant", ["montant", "amount"]],
  ["solde", ["solde", "encours", "balance"]],
  ["client", ["client", "clients", "customer"]],
  ["nom", ["nom", "name"]],
  ["ca", ["ca", "revenue", "turnover"]],
  ["prix", ["prix", "price", "tarif"]],
  ["date", ["date", "dates"]],
  ["mois", ["mois", "month"]],
  ["annee", ["annee", "an", "year"]],
];
for (const [sens, mots] of groupes) for (const m of mots) SYNONYMES[m] = sens;

/** Noms entiers équivalents à un mot : « Chiffre d'affaires » ou « Ventes » seuls valent « CA ». */
const NOMS_ENTIERS: [RegExp, string][] = [
  [/^(chiffre d ?affaires?|chiffres? affaires?|ca ttc|ca ht|ventes?|sales)$/, "ca"],
  [/^raison sociale$/, "nom"],
];

/** Mots porteurs de sens d'un nom de colonne, synonymes ramenés à une forme unique. */
export function motsColonne(nom: string): Set<string> {
  const texte = sansAccents(nom).replace(/[^a-z0-9]+/g, " ").trim();
  for (const [re, sens] of NOMS_ENTIERS) if (re.test(texte)) return new Set([sens]);
  const mots = texte
    .split(" ")
    .filter((m) => m && !MOTS_VIDES.has(m))
    .map((m) => SYNONYMES[m] ?? m);
  return new Set(mots);
}

/** Ressemblance de deux noms de colonnes, de 0 à 1. */
export function scoreNoms(a: string, b: string): number {
  if (cleNomColonne(a) === cleNomColonne(b)) return 1;
  const A = motsColonne(a);
  const B = motsColonne(b);
  if (!A.size || !B.size) return 0;
  let communs = 0;
  for (const m of A) if (B.has(m)) communs++;
  if (communs === 0) return 0;
  if (communs === A.size && communs === B.size) return 0.95;
  const jaccard = communs / (A.size + B.size - communs);
  const inclusion = communs / Math.min(A.size, B.size);
  return 0.5 * jaccard + 0.4 * inclusion;
}

// ---------------------------------------------------------------------------
// Profil des colonnes et rapprochement
// ---------------------------------------------------------------------------

interface Profil {
  nom: string;
  nature: NatureColonne;
  /** Valeurs distinctes normalisées (colonnes texte seulement). */
  valeurs: Set<string> | null;
}

function natureDe(nom: string, valeurs: Cellule[]): NatureColonne {
  const { type } = detecterTypeColonne(nom, valeurs);
  if (type === "numerique") return "numerique";
  if (type === "date") return "date";
  return "texte";
}

function profiler(f: FichierAComparer): Profil[] {
  const echantillon = f.corps.slice(0, 3000);
  return f.entetes.map((nom, i) => {
    const vals = echantillon.map((l) => l[i]);
    const nature = natureDe(nom, vals);
    return {
      nom,
      nature,
      valeurs: nature === "texte" ? new Set(vals.map(normaliserValeurCle).filter(Boolean)) : null,
    };
  });
}

/** Part des valeurs distinctes du plus petit ensemble retrouvées dans l'autre. */
function recouvrement(a: Set<string>, b: Set<string>): number {
  const [petit, grand] = a.size <= b.size ? [a, b] : [b, a];
  if (!petit.size) return 0;
  let n = 0;
  for (const v of petit) if (grand.has(v)) n++;
  return n / petit.size;
}

export const SEUIL_RAPPROCHEMENT = 0.6;

/** Score de rapprochement entre deux colonnes : leurs noms, leur nature et, pour le texte, leurs valeurs communes. */
function scoreColonnes(a: Profil, b: Profil): number {
  const noms = scoreNoms(a.nom, b.nom);
  if (noms === 1) return 1;
  // Un montant ne correspond pas à un libellé
  if ((a.nature === "numerique") !== (b.nature === "numerique")) return 0;
  if (a.valeurs && b.valeurs && Math.min(a.valeurs.size, b.valeurs.size) >= 3) {
    const ov = recouvrement(a.valeurs, b.valeurs);
    // Noms proches mais aucune valeur commune (« Code client » / « Client ») : douteux
    const parNoms = ov >= 0.2 ? noms : noms * 0.5;
    // Mêmes valeurs (« Nom » / « Client » remplis des mêmes noms) : c'est la même information
    const parValeurs = ov >= 0.5 && Math.min(a.valeurs.size, b.valeurs.size) >= 5 ? 0.6 + 0.4 * ov : 0;
    return Math.max(parNoms, parValeurs);
  }
  return noms;
}

/**
 * Rapproche les colonnes de tous les fichiers sur celles du premier.
 * - Les correspondances manuelles passent d'abord ; les autres sont trouvées automatiquement.
 * - garderNonAppariees : les colonnes sans équivalent dans le premier fichier sont ajoutées (empilement).
 * - exact : rapprochement sur le nom seul (sans casse ni accents), sans synonymes.
 */
export function unifierColonnes(
  fichiers: FichierAComparer[],
  options: { manuelles?: CorrespondancesManuelles; garderNonAppariees?: boolean; exact?: boolean } = {}
): ColonneUnifiee[] {
  if (fichiers.length === 0) return [];
  const profils = fichiers.map(profiler);
  const n = fichiers.length;
  const unifiees: (ColonneUnifiee & { profils: (Profil | null)[] })[] = [];

  const nouvelle = (k: number, i: number): ColonneUnifiee & { profils: (Profil | null)[] } => {
    const c = {
      nom: fichiers[k].entetes[i].trim(),
      indices: new Array(n).fill(-1),
      variantes: new Array(n).fill(""),
      manuelle: new Array(n).fill(false),
      nature: profils[k][i].nature,
      profils: new Array(n).fill(null),
    };
    c.indices[k] = i;
    c.variantes[k] = fichiers[k].entetes[i];
    c.profils[k] = profils[k][i];
    return c;
  };

  const dejaVues = new Set<string>();
  fichiers[0].entetes.forEach((h, i) => {
    const cle = cleNomColonne(h);
    if (h === COLONNE_SOURCE || !cle || dejaVues.has(cle)) return;
    dejaVues.add(cle);
    unifiees.push(nouvelle(0, i));
  });

  for (let k = 1; k < n; k++) {
    const f = fichiers[k];
    const utilisees = new Set<number>();
    const pourvues = new Set<number>();
    const manuelles = options.manuelles?.[f.nom] ?? {};

    // 1. Correspondances choisies à la main
    unifiees.forEach((u, iu) => {
      if (!(u.nom in manuelles)) return;
      pourvues.add(iu);
      const choix = manuelles[u.nom];
      const i = choix ? f.entetes.indexOf(choix) : -1;
      if (i === -1 || utilisees.has(i)) return;
      utilisees.add(i);
      u.indices[k] = i;
      u.variantes[k] = f.entetes[i];
      u.manuelle[k] = true;
      u.profils[k] = profils[k][i];
    });

    // 2. Rapprochement automatique : les meilleures paires d'abord, chaque colonne une seule fois
    const paires: { iu: number; i: number; score: number }[] = [];
    f.entetes.forEach((h, i) => {
      if (h === COLONNE_SOURCE || utilisees.has(i)) return;
      unifiees.forEach((u, iu) => {
        if (pourvues.has(iu) || u.indices[k] !== -1) return;
        let score = 0;
        u.profils.forEach((p) => {
          if (!p) return;
          const s = options.exact ? (cleNomColonne(p.nom) === cleNomColonne(h) ? 1 : 0) : scoreColonnes(p, profils[k][i]);
          if (s > score) score = s;
        });
        if (score >= (options.exact ? 1 : SEUIL_RAPPROCHEMENT)) paires.push({ iu, i, score });
      });
    });
    paires.sort((a, b) => b.score - a.score);
    for (const { iu, i } of paires) {
      const u = unifiees[iu];
      if (utilisees.has(i) || u.indices[k] !== -1) continue;
      utilisees.add(i);
      u.indices[k] = i;
      u.variantes[k] = f.entetes[i];
      u.profils[k] = profils[k][i];
    }

    // 3. Colonnes restées seules
    if (options.garderNonAppariees) {
      f.entetes.forEach((h, i) => {
        if (h === COLONNE_SOURCE || utilisees.has(i) || !cleNomColonne(h)) return;
        if (unifiees.some((u) => cleNomColonne(u.nom) === cleNomColonne(h) && u.indices[k] === -1)) return;
        unifiees.push(nouvelle(k, i));
      });
    }
  }

  return unifiees.map((u) => {
    // La nature d'une colonne rapprochée est relue sur l'ensemble de ses fichiers
    const nature = u.profils.some((p) => p && p.nature !== u.nature)
      ? natureDe(u.nom, fichiers.flatMap((f, k) => (u.indices[k] === -1 ? [] : f.corps.slice(0, 1000).map((l) => l[u.indices[k]]))))
      : u.nature;
    return { nom: u.nom, indices: u.indices, variantes: u.variantes, manuelle: u.manuelle, nature };
  });
}

/** Colonnes présentes dans tous les fichiers. */
export function colonnesCommunes(
  fichiers: FichierAComparer[],
  manuelles?: CorrespondancesManuelles
): ColonneUnifiee[] {
  return unifierColonnes(fichiers, { manuelles }).filter((c) => c.indices.every((i) => i !== -1));
}

/** Colonnes rapprochées malgré des noms différents, pour l'expliquer à l'utilisateur. */
export function descriptionRapprochements(colonnes: ColonneUnifiee[]): string[] {
  return colonnes
    .map((c) => c.variantes.filter((v, i, t) => v && t.findIndex((x) => cleNomColonne(x) === cleNomColonne(v)) === i))
    .filter((v) => v.length > 1)
    .map((v) => v.join(" = "));
}

// ---------------------------------------------------------------------------
// Clé de rapprochement proposée
// ---------------------------------------------------------------------------

export interface PropositionCle {
  colonne: ColonneUnifiee;
  /** Pour chaque fichier : part des lignes du premier fichier dont la clé s'y retrouve (1 pour le premier). */
  taux: number[];
  /** Part de valeurs uniques de la clé dans le premier fichier. */
  unicite: number;
}

/** Évalue chaque colonne commune comme clé : valeurs retrouvées d'un fichier à l'autre et unicité. */
export function evaluerCles(fichiers: FichierAComparer[], colonnes: ColonneUnifiee[]): PropositionCle[] {
  const propositions: PropositionCle[] = [];
  for (const c of colonnes) {
    if (c.indices.some((i) => i === -1)) continue;
    const mots = motsColonne(c.nom);
    if (c.nature === "numerique" && !mots.has("#id")) continue;
    const valeursRef = fichiers[0].corps.map((l) => normaliserValeurCle(l[c.indices[0]])).filter(Boolean);
    if (!valeursRef.length) continue;
    const unicite = new Set(valeursRef).size / valeursRef.length;
    const taux = fichiers.map((f, k) => {
      if (k === 0) return 1;
      const ens = new Set(f.corps.map((l) => normaliserValeurCle(l[c.indices[k]])).filter(Boolean));
      return valeursRef.filter((v) => ens.has(v)).length / valeursRef.length;
    });
    propositions.push({ colonne: c, taux, unicite });
  }
  const score = (p: PropositionCle) => Math.min(...p.taux.slice(1)) * (0.3 + 0.7 * p.unicite);
  return propositions.sort((a, b) => score(b) - score(a));
}

/** Meilleure clé : des valeurs qui se retrouvent d'un fichier à l'autre (au moins 30 %), uniques de préférence. */
export function proposerCle(fichiers: FichierAComparer[], colonnes: ColonneUnifiee[]): PropositionCle | null {
  const meilleure = evaluerCles(fichiers, colonnes)[0];
  return meilleure && Math.min(...meilleure.taux.slice(1)) >= 0.3 ? meilleure : null;
}

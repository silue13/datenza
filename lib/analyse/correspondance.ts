// lib/analyse/correspondance.ts — rapprochement des colonnes qui désignent la même chose sous des noms différents
// (« CA » / « Chiffre d'affaires », « Qté » / « Quantité », « Localité » / « Ville »), avant une comparaison ou une fusion.
import type { FichierEntree } from "./fusion";

/** Groupes de noms équivalents (comparés sans accents, casse ni ponctuation). */
const SYNONYMES: string[][] = [
  ["ca", "chiffre affaires", "chiffre d affaires", "chiffres affaires", "ventes", "montant ventes", "revenu", "revenus", "recette", "recettes", "turnover", "revenue", "sales"],
  ["montant", "amount", "valeur", "somme", "total", "montant total"],
  ["quantite", "qte", "qt", "qty", "quantity", "nombre", "nb", "volume", "quantites"],
  ["prix", "prix unitaire", "pu", "price", "unit price", "tarif", "cout unitaire"],
  ["date", "jour", "day", "date operation", "date transaction"],
  ["client", "clients", "nom client", "customer", "raison sociale", "nom du client"],
  ["ville", "localite", "commune", "city", "lieu", "localisation", "town"],
  ["region", "regions", "province"],
  ["departement", "prefecture"],
  ["produit", "produits", "article", "articles", "designation", "libelle", "item", "product", "nom produit"],
  ["code", "reference", "ref", "id", "identifiant", "numero", "num", "no", "matricule"],
  ["categorie", "famille", "category", "type produit", "rayon"],
  ["agence", "site", "magasin", "boutique", "point de vente", "pdv", "store", "succursale"],
  ["vendeur", "commercial", "agent", "representant", "conseiller", "seller"],
  ["telephone", "tel", "phone", "contact", "mobile", "portable"],
  ["sexe", "genre", "gender"],
  ["age", "ages"],
  ["population", "habitants", "nombre habitants", "nb habitants"],
  ["remise", "reduction", "rabais", "discount", "ristourne"],
  ["marge", "benefice", "profit", "margin"],
  ["stock", "inventaire", "quantite en stock", "stock disponible"],
  ["fournisseur", "supplier", "vendor"],
  ["paiement", "reglement", "payment", "versement"],
  ["statut", "etat", "status", "situation"],
];

const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "en", "par", "a", "au", "aux", "et", "the", "of"]);

function mots(nom: string): string[] {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !MOTS_VIDES.has(m));
}
const forme = (nom: string) => mots(nom).join(" ");

const GROUPE_DE = new Map<string, number>();
SYNONYMES.forEach((g, i) => g.forEach((n) => GROUPE_DE.set(forme(n), i)));

/** Ressemblance de deux noms de colonnes, de 0 (aucune) à 1 (même nom). */
export function ressemblanceNoms(a: string, b: string): number {
  const fa = forme(a);
  const fb = forme(b);
  if (!fa || !fb) return 0;
  if (fa === fb || fa.replace(/ /g, "") === fb.replace(/ /g, "")) return 1;
  const ga = GROUPE_DE.get(fa);
  if (ga !== undefined && ga === GROUPE_DE.get(fb)) return 0.9;
  const ma = new Set(fa.split(" "));
  const mb = new Set(fb.split(" "));
  const communs = [...ma].filter((m) => mb.has(m)).length;
  if (!communs) return 0;
  // Mots qualifiants qui changent le sens : « Montant HT » n'est pas « Montant TTC »
  const opposes = [["ht", "ttc"], ["debut", "fin"], ["min", "max"], ["achat", "vente"], ["prevu", "realise"], ["n", "n1"]];
  if (opposes.some(([x, y]) => (ma.has(x) && mb.has(y)) || (ma.has(y) && mb.has(x)))) return 0;
  const inclus = communs === Math.min(ma.size, mb.size);
  const jaccard = communs / new Set([...ma, ...mb]).size;
  return inclus ? Math.max(0.65, jaccard) : jaccard >= 0.5 ? 0.6 * jaccard + 0.2 : 0;
}

export const SEUIL_SUGGESTION = 0.6;

/**
 * Pour chaque colonne de `ref`, la colonne de `autre` qui désigne sans doute la même chose (ou null).
 * Chaque colonne n'est utilisée qu'une fois, en commençant par les rapprochements les plus sûrs.
 */
export function suggererCorrespondance(ref: FichierEntree, autre: FichierEntree, exclusRef: string[] = [], exclusAutre: string[] = []): Record<string, string | null> {
  const colsRef = ref.entetes.filter((c) => c !== "Fichier Source" && !exclusRef.includes(c));
  const colsAutre = autre.entetes.filter((c) => c !== "Fichier Source" && !exclusAutre.includes(c));
  const paires: { r: string; a: string; s: number }[] = [];
  for (const r of colsRef) for (const a of colsAutre) {
    const s = ressemblanceNoms(r, a);
    if (s >= SEUIL_SUGGESTION) paires.push({ r, a, s });
  }
  paires.sort((x, y) => y.s - x.s);
  const resultat: Record<string, string | null> = Object.fromEntries(colsRef.map((c) => [c, null]));
  const prises = new Set<string>();
  for (const p of paires) {
    if (resultat[p.r] !== null || prises.has(p.a)) continue;
    resultat[p.r] = p.a;
    prises.add(p.a);
  }
  return resultat;
}

/**
 * Renomme dans `autre` les colonnes rapprochées pour qu'elles portent le nom de la colonne de référence.
 * Une colonne de `autre` qui porterait déjà ce nom sans lui correspondre est renommée « nom (2) » pour éviter toute confusion.
 */
export function appliquerCorrespondance(autre: FichierEntree, correspondance: Record<string, string | null | undefined>): FichierEntree {
  const versRef = new Map<string, string>();
  Object.entries(correspondance).forEach(([colRef, colAutre]) => {
    if (colAutre && colAutre !== colRef) versRef.set(colAutre, colRef);
  });
  if (!versRef.size) return autre;
  const cibles = new Set(versRef.values());
  const entetes = autre.entetes.map((h) => versRef.get(h) ?? (cibles.has(h) ? `${h} (2)` : h));
  return { ...autre, entetes };
}

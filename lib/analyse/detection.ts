import { estValeurVide, versNumeriques, estColonneIdentifiant, estColonneTemporelle, type Cellule } from "./utils";
import { convertirDate, detecterOrdreDate, estAnnee, estPeriode } from "./dates";

export { convertirDate, detecterOrdreDate };
export type TypeColonne = "numerique" | "date" | "booleen" | "identifiant" | "categorielle";

const RE_BOOL = /^(true|false|vrai|faux|yes|no|oui|non|o|n|y|1|0)$/;
const RE_STATUT = /(statut|status|state|etat|validation|decision|resultat|approval|approbation)/;
const RE_GEO = /(^|[^a-z])(pays|country|ville|city|region|departement|department|commune|localite|locality|village|prefecture|district|province|quartier|adresse|lieu|location|aeroport|airport|iata|icao|origin|destination|port|terminal|postal|zip)($|[^a-z])/;

export function normaliser(v: Cellule): string {
  return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function estColonneGeographique(nom: string): boolean {
  return RE_GEO.test(normaliser(nom));
}

/**
 * Type et rôle d'une colonne, décidés d'abord par ses valeurs, ensuite par son nom.
 * Ordre : identifiant > temps > statut > booléen > mesure numérique > texte libre > dimension.
 */
export function detecterTypeColonne(nom: string, valeurs: Cellule[]) {
  const geo = estColonneGeographique(nom);
  const tous = valeurs.filter((v) => !estValeurVide(v));
  if (!tous.length) return { type: "categorielle" as TypeColonne, role: "dimension", geo };

  const nonVides = tous.length > 5000 ? tous.slice(0, 5000) : tous;
  const n = normaliser(nom);
  const total = nonVides.length;
  const distincts = new Set(nonVides.map((v) => String(v).trim())).size;
  const ratioNum = versNumeriques(nonVides).length / total;
  const ratioBool = nonVides.filter((v) => RE_BOOL.test(normaliser(v))).length / total;

  if (estColonneIdentifiant(nom, tous)) return { type: "identifiant" as TypeColonne, role: "identifiant", geo: false };
  if (estColonneTemporelle(nom, tous)) return { type: "date" as TypeColonne, role: "temps", geo };
  if (RE_STATUT.test(n) && ratioNum < 0.8) return { type: "categorielle" as TypeColonne, role: "statut", geo };
  if (ratioBool >= 0.95 && distincts <= 2) return { type: "booleen" as TypeColonne, role: "indicateur", geo };
  if (ratioNum >= 0.8) return { type: "numerique" as TypeColonne, role: "mesure", geo };

  // Texte libre (noms, adresses, commentaires) : presque chaque ligne est différente,
  // un classement par fréquence n'aurait aucun sens.
  if (!geo && total >= 20 && distincts / total >= 0.95) {
    return { type: "identifiant" as TypeColonne, role: "identifiant", geo };
  }
  return { type: "categorielle" as TypeColonne, role: "dimension", geo };
}

/** Lit une valeur de colonne temporelle : date complète, ou année seule (2023 -> 1er janvier 2023). */
export function lireDateOuAnnee(v: Cellule, ordre: "JMA" | "MJA" = "JMA"): Date | null {
  if (estAnnee(v)) return new Date(Number(String(v).replace(/["'«»“”]/g, "").trim()), 0, 1);
  return convertirDate(v, ordre);
}

export { estAnnee, estPeriode };

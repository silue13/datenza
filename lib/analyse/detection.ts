import { estValeurVide, versNumeriques, type Cellule } from "./utils";

export type TypeColonne = "numerique" | "date" | "booleen" | "identifiant" | "categorielle";

const RE_ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const RE_FR = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const RE_BOOL = /^(true|false|vrai|faux|yes|no|oui|non|1|0)$/;
const RE_ID = /(identifiant|(^|[\s_-])id($|[\s_-])|code|matricule|reference|numero|\bn[°o]?\s?de\b|dossier|demande|telephone|phone|email|e mail)/;
const RE_DATE = /(date|jour|mois|annee|heure|time|timestamp|echeance|naissance)/;
const RE_STATUT = /(statut|status|state|etat|validation|decision|resultat|approval|approbation)/;
const RE_GEO = /(^|[^a-z])(pays|country|ville|city|region|departement|department|commune|localite|locality|village|prefecture|district|province|quartier|adresse|lieu|location|aeroport|airport|iata|icao|origin|destination|port|terminal|postal|zip)($|[^a-z])/;

export function normaliser(v: Cellule): string {
  return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function convertirDate(v: Cellule): Date | null {
  const s = String(v ?? "").trim();
  const iso = s.match(RE_ISO);
  const m = iso ?? s.match(RE_FR);
  if (!m) return null;
  const [a, mo, j] = iso ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
  const d = new Date(a, mo - 1, j, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return d.getFullYear() === a && d.getMonth() === mo - 1 && d.getDate() === j ? d : null;
}

export function estColonneGeographique(nom: string): boolean {
  return RE_GEO.test(normaliser(nom));
}

export function detecterTypeColonne(nom: string, valeurs: Cellule[]) {
  const geo = estColonneGeographique(nom);
  const nonVides = valeurs.filter((v) => !estValeurVide(v));
  if (!nonVides.length) return { type: "categorielle" as TypeColonne, role: "dimension", geo };

  const n = normaliser(nom);
  const total = nonVides.length;
  const distincts = new Set(nonVides.map((v) => String(v).trim())).size;
  const ratioNum = versNumeriques(nonVides).length / total;
  const ratioDate = nonVides.filter((v) => convertirDate(v)).length / total;
  const ratioBool = nonVides.filter((v) => RE_BOOL.test(normaliser(v))).length / total;

  if (RE_ID.test(n) || (total >= 20 && distincts / total >= 0.98 && ratioNum >= 0.8))
    return { type: "identifiant" as TypeColonne, role: "identifiant", geo };
  if (ratioDate >= 0.8 && (RE_DATE.test(n) || ratioDate >= 0.9))
    return { type: "date" as TypeColonne, role: "temps", geo };
  if (RE_STATUT.test(n)) return { type: "categorielle" as TypeColonne, role: "statut", geo };
  if (ratioBool >= 0.95 && distincts <= 2)
    return { type: "booleen" as TypeColonne, role: "indicateur", geo };
  if (ratioNum >= 0.8) return { type: "numerique" as TypeColonne, role: "mesure", geo };
  return { type: "categorielle" as TypeColonne, role: "dimension", geo };
}
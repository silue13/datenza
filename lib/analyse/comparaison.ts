// lib/analyse/comparaison.ts — assemble plusieurs fichiers pour les comparer (mode « benchmark » de l'analyse).
import type { Cellule } from "./utils";
import { normaliserCleColonne } from "./fusion";

export interface FichierAComparer {
  nom: string;
  entetes: string[];
  corps: Cellule[][];
}

export interface ResultatComparaison {
  entetes: string[];
  corps: Cellule[][];
  /** Noms de source utilisés (un nom répété est numéroté : « ventes.xlsx (2) »). */
  sources: string[];
  /** Colonnes reconnues comme identiques malgré une écriture différente (« Montant » / « montant_ »). */
  colonnesAlignees: { nomFinal: string; variantes: string[] }[];
  /** Colonnes écartées parce qu'elles manquent dans au moins un fichier. */
  colonnesIgnorees: string[];
}

/**
 * Empile les fichiers sur leurs colonnes communes, avec une colonne « Fichier Source ».
 * Les noms de colonnes sont rapprochés sans tenir compte de la casse, des accents, des espaces ni de la ponctuation.
 * Renvoie null si aucune colonne n'est commune à tous les fichiers.
 */
export function assemblerComparaison(fichiers: FichierAComparer[]): ResultatComparaison | null {
  if (fichiers.length < 2) return null;
  const cles = (f: FichierAComparer) => new Map(f.entetes.filter((h) => h !== "Fichier Source").map((h, i) => [normaliserCleColonne(h) || `#${i}`, h]));
  const parFichier = fichiers.map(cles);
  const communes = [...parFichier[0].keys()].filter((k) => parFichier.every((m) => m.has(k)));
  if (!communes.length) return null;

  const nomsFinaux = communes.map((k) => parFichier[0].get(k) as string);
  const colonnesAlignees = communes
    .map((k, i) => ({ nomFinal: nomsFinaux[i], variantes: [...new Set(parFichier.map((m) => m.get(k) as string))] }))
    .filter((c) => c.variantes.length > 1);
  const ignorees = new Set<string>();
  parFichier.forEach((m) => m.forEach((nom, k) => !communes.includes(k) && ignorees.add(nom)));

  const vus = new Map<string, number>();
  const sources = fichiers.map((f) => {
    const n = (vus.get(f.nom) ?? 0) + 1;
    vus.set(f.nom, n);
    return n > 1 ? `${f.nom} (${n})` : f.nom;
  });

  const corps: Cellule[][] = [];
  fichiers.forEach((f, iF) => {
    const indices = communes.map((k) => f.entetes.indexOf(parFichier[iF].get(k) as string));
    for (const ligne of f.corps) corps.push([sources[iF], ...indices.map((i) => (i === -1 ? "" : (ligne[i] ?? "")))]);
  });

  return { entetes: ["Fichier Source", ...nomsFinaux], corps, sources, colonnesAlignees, colonnesIgnorees: [...ignorees] };
}

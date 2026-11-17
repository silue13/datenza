// lib/analyse/modele.ts — modèle de données : une table principale reliée à des tables de référence.
// Relation « plusieurs vers un » (comme dans Power BI) : chaque ligne de la table principale retrouve
// au plus une ligne de la table de référence par sa clé, et en reçoit les colonnes choisies.
import { estValeurVide, parseNombre, type Cellule } from "./utils";

export interface TableReference {
  id: string;
  nom: string;
  entetes: string[];
  corps: Cellule[][];
}

export interface Relation {
  id: string;
  tableId: string;
  /** Colonne de la table principale (ex. « Code produit » dans les ventes). */
  colonnePrincipale: string;
  /** Colonne clé de la table de référence (ex. « Code » dans les produits). */
  colonneCle: string;
  /** Colonnes de la table de référence ajoutées à la table principale. */
  colonnes: string[];
}

export interface DiagnosticRelation {
  relationId: string;
  /** Lignes de la table principale qui ont trouvé leur correspondance. */
  lignesReliees: number;
  /** Lignes dont la clé est renseignée mais absente de la table de référence. */
  lignesSansCorrespondance: number;
  /** Quelques clés introuvables, pour aider à corriger. */
  exemplesSansCorrespondance: string[];
  /** Clés présentes plusieurs fois dans la table de référence : la première ligne est retenue. */
  clesEnDouble: string[];
  /** Colonnes ajoutées à la table principale, avec leur nom final. */
  colonnesAjoutees: { source: string; nom: string }[];
  /** Problème qui empêche la relation de fonctionner (table ou colonne disparue). */
  erreur: string | null;
}

export interface ResultatModele {
  entetes: string[];
  corps: Cellule[][];
  diagnostics: DiagnosticRelation[];
}

/**
 * Clé de rapprochement tolérante : casse, accents et espaces ignorés ; « 10 », « 10,0 » et « 010 » se rejoignent
 * quand la valeur est un nombre (codes numériques saisis différemment d'un fichier à l'autre).
 */
export function cleRapprochement(v: Cellule): string {
  if (estValeurVide(v)) return "";
  const texte = String(v).trim();
  const n = typeof v === "number" ? v : /^[+-]?[\d\s.,]+$/.test(texte) ? parseNombre(texte) : null;
  if (n !== null && Number.isFinite(n)) return `#${n}`;
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Nom d'une colonne ajoutée : son nom d'origine, ou « Colonne (Table) » s'il est déjà pris. */
export function nommerColonneReliee(source: string, nomTable: string, pris: Set<string>): string {
  if (!pris.has(source)) return source;
  const base = `${source} (${nomTable})`;
  if (!pris.has(base)) return base;
  let i = 2;
  while (pris.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/** Part des valeurs renseignées d'une colonne principale retrouvées parmi les clés d'une table (0 à 1). */
export function tauxCorrespondance(valeursPrincipales: Cellule[], valeursCle: Cellule[]): number {
  const cles = new Set(valeursCle.map(cleRapprochement).filter(Boolean));
  let total = 0;
  let trouves = 0;
  for (const v of valeursPrincipales) {
    const k = cleRapprochement(v);
    if (!k) continue;
    total++;
    if (cles.has(k)) trouves++;
  }
  return total ? trouves / total : 0;
}

/**
 * Propose la meilleure relation entre la table principale et une table de référence :
 * la paire de colonnes dont les clés se retrouvent le plus, la clé devant être (presque) unique dans la référence.
 */
export function suggererRelation(
  principale: { entetes: string[]; corps: Cellule[][] },
  reference: { entetes: string[]; corps: Cellule[][] }
): { colonnePrincipale: string; colonneCle: string; taux: number } | null {
  const echantillon = principale.corps.slice(0, 3000);
  let meilleure: { colonnePrincipale: string; colonneCle: string; taux: number } | null = null;
  reference.entetes.forEach((cle, j) => {
    const valeursCle = reference.corps.map((l) => l[j]).filter((v) => !estValeurVide(v));
    if (valeursCle.length < 1) return;
    const distinctes = new Set(valeursCle.map(cleRapprochement)).size;
    // Une clé de référence identifie (presque) une seule ligne ; quelques doublons sont tolérés et signalés au diagnostic
    if (distinctes / valeursCle.length < 0.7) return;
    principale.entetes.forEach((col, i) => {
      const taux = tauxCorrespondance(
        echantillon.map((l) => l[i]),
        valeursCle
      );
      // À taux égal, on préfère des colonnes de même nom
      const bonus = cleRapprochement(col) === cleRapprochement(cle) ? 0.001 : 0;
      if (taux >= 0.5 && (!meilleure || taux + bonus > meilleure.taux)) meilleure = { colonnePrincipale: col, colonneCle: cle, taux: taux + bonus };
    });
  });
  const m = meilleure as { colonnePrincipale: string; colonneCle: string; taux: number } | null;
  return m ? { ...m, taux: Math.min(1, m.taux) } : null;
}

/**
 * Ajoute à la table principale les colonnes des tables de référence, relation par relation.
 * Une ligne sans correspondance reçoit des cellules vides : elle n'est jamais supprimée.
 * Une relation peut s'appuyer sur une colonne ajoutée par une relation précédente (Ventes → Produits → Familles).
 */
export function appliquerModele(entetes: string[], corps: Cellule[][], tables: TableReference[], relations: Relation[]): ResultatModele {
  let entetesCourantes = [...entetes];
  let corpsCourant = corps;
  const diagnostics: DiagnosticRelation[] = [];

  for (const rel of relations) {
    const vide: DiagnosticRelation = {
      relationId: rel.id,
      lignesReliees: 0,
      lignesSansCorrespondance: 0,
      exemplesSansCorrespondance: [],
      clesEnDouble: [],
      colonnesAjoutees: [],
      erreur: null,
    };
    const table = tables.find((t) => t.id === rel.tableId);
    if (!table) {
      diagnostics.push({ ...vide, erreur: "La table de référence de cette relation a été retirée." });
      continue;
    }
    const idxPrincipale = entetesCourantes.indexOf(rel.colonnePrincipale);
    const idxCle = table.entetes.indexOf(rel.colonneCle);
    if (idxPrincipale === -1) {
      diagnostics.push({ ...vide, erreur: `La colonne « ${rel.colonnePrincipale} » n'existe plus dans la table principale.` });
      continue;
    }
    if (idxCle === -1) {
      diagnostics.push({ ...vide, erreur: `La colonne « ${rel.colonneCle} » n'existe plus dans « ${table.nom} ».` });
      continue;
    }
    const colonnes = rel.colonnes.filter((c) => c !== rel.colonneCle && table.entetes.includes(c));
    const indices = colonnes.map((c) => table.entetes.indexOf(c));

    // Index de la table de référence : première ligne pour chaque clé
    const index = new Map<string, Cellule[]>();
    const doubles = new Set<string>();
    for (const ligne of table.corps) {
      const k = cleRapprochement(ligne[idxCle]);
      if (!k) continue;
      if (index.has(k)) doubles.add(String(ligne[idxCle]).trim());
      else index.set(k, ligne);
    }

    const pris = new Set(entetesCourantes);
    const noms = colonnes.map((c) => {
      const nom = nommerColonneReliee(c, table.nom, pris);
      pris.add(nom);
      return nom;
    });

    let reliees = 0;
    let sans = 0;
    const exemples = new Set<string>();
    corpsCourant = corpsCourant.map((ligne) => {
      const brut = ligne[idxPrincipale];
      const k = cleRapprochement(brut);
      const trouve = k ? index.get(k) : undefined;
      if (trouve) reliees++;
      else if (k) {
        sans++;
        if (exemples.size < 5) exemples.add(String(brut).trim());
      }
      return [...ligne, ...indices.map((i) => (trouve ? trouve[i] : null))];
    });
    entetesCourantes = [...entetesCourantes, ...noms];
    diagnostics.push({
      ...vide,
      lignesReliees: reliees,
      lignesSansCorrespondance: sans,
      exemplesSansCorrespondance: [...exemples],
      clesEnDouble: [...doubles].slice(0, 5),
      colonnesAjoutees: colonnes.map((source, i) => ({ source, nom: noms[i] })),
    });
  }

  return { entetes: entetesCourantes, corps: corpsCourant, diagnostics };
}

const estTexte = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Relit des tables de référence enregistrées (session ou projet) ; les entrées mal formées sont ignorées. */
export function normaliserTables(brut: unknown): TableReference[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      id: String(t.id ?? ""),
      nom: String(t.nom ?? "").slice(0, 120),
      entetes: Array.isArray(t.entetes) ? t.entetes.map(String) : [],
      corps: Array.isArray(t.corps) ? (t.corps as unknown[]).filter(Array.isArray) as Cellule[][] : [],
    }))
    .filter((t) => t.id && t.nom && t.entetes.length && t.corps.length);
}

/** Relit des relations enregistrées ; les entrées mal formées sont ignorées. */
export function normaliserRelations(brut: unknown): Relation[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .filter((r) => estTexte(r.id) && estTexte(r.tableId) && estTexte(r.colonnePrincipale) && estTexte(r.colonneCle))
    .map((r) => ({
      id: String(r.id),
      tableId: String(r.tableId),
      colonnePrincipale: String(r.colonnePrincipale),
      colonneCle: String(r.colonneCle),
      colonnes: Array.isArray(r.colonnes) ? r.colonnes.filter(estTexte) : [],
    }));
}

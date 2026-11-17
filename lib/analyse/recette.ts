/**
 * Recette de préparation : la suite d'étapes appliquée aux données importées (colonnes calculées,
 * puis filtres, puis choix des colonnes analysées), enregistrable et rejouable sur un autre fichier,
 * typiquement le fichier du mois suivant.
 *
 * Une recette ne contient aucune donnée : seulement des noms de colonnes et des réglages.
 */
import type { Cellule } from "./utils";
import {
  ajouterColonneCalculee,
  appliquerFiltres,
  type ConditionFiltre,
  type DefinitionColonneCalculee,
} from "./filtres";

export const VERSION_RECETTE = 1;

export interface Recette {
  format: "datenza-recette";
  version: number;
  nom: string;
  creeLe: string;
  /** Colonnes du fichier d'origine : sert à repérer les colonnes renommées ou disparues. */
  colonnesSource: string[];
  calculs: DefinitionColonneCalculee[];
  filtres: ConditionFiltre[];
  /** Colonnes retenues pour l'analyse ; absent : toutes. */
  colonnesChoisies?: string[];
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

/** Applique colonnes calculées puis filtres à des données sources. Fonction pure. */
export function executerEtapes(
  entetes: string[],
  corps: Cellule[][],
  calculs: DefinitionColonneCalculee[],
  filtres: ConditionFiltre[]
): { entetes: string[]; corps: Cellule[][] } {
  let objs: Record<string, Cellule>[] = corps.map((ligne) => {
    const obj: Record<string, Cellule> = {};
    entetes.forEach((h, i) => (obj[h] = ligne[i]));
    return obj;
  });
  for (const def of calculs) objs = ajouterColonneCalculee(objs, def);
  const filtrees = appliquerFiltres(objs, filtres);
  const entetesFinales = [...entetes, ...calculs.map((c) => c.nomNouvelleColonne).filter((n) => !entetes.includes(n))];
  return { entetes: entetesFinales, corps: filtrees.map((o) => entetesFinales.map((h) => o[h])) };
}

// ---------------------------------------------------------------------------
// Adaptation à un nouveau fichier
// ---------------------------------------------------------------------------

/** Clé de comparaison tolérante : casse, accents, espaces, tirets et soulignés ignorés. */
export function cleColonne(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_\-.]+/g, "");
}

/**
 * Associe chaque colonne attendue à une colonne du nouveau fichier : nom identique d'abord,
 * puis nom équivalent (« Montant » ≈ « montant », « Chiffre d'affaires » ≈ « chiffre_d'affaires »).
 */
export function associerColonnes(attendues: string[], presentes: string[]): Map<string, string> {
  const resultat = new Map<string, string>();
  const libres = new Set(presentes);
  for (const a of attendues) {
    if (libres.has(a)) {
      resultat.set(a, a);
      libres.delete(a);
    }
  }
  for (const a of attendues) {
    if (resultat.has(a)) continue;
    const cle = cleColonne(a);
    const candidates = [...libres].filter((p) => cleColonne(p) === cle);
    // Deux candidates équivalentes : ambigu, on ne devine pas
    if (candidates.length === 1) {
      resultat.set(a, candidates[0]);
      libres.delete(candidates[0]);
    }
  }
  return resultat;
}

export interface EtapeIgnoree {
  description: string;
  raison: string;
}

export interface RapportRecette {
  calculs: DefinitionColonneCalculee[];
  filtres: ConditionFiltre[];
  colonnesChoisies: string[];
  /** Colonnes reconnues sous un autre nom : [nom dans la recette, nom dans le fichier]. */
  renommees: [string, string][];
  ignorees: EtapeIgnoree[];
  /** Colonnes du nouveau fichier absentes du fichier d'origine. */
  nouvelles: string[];
  nbEtapes: number;
}

/** Adapte une recette aux colonnes d'un nouveau fichier : renomme ce qui se reconnaît, écarte ce qui ne peut pas s'appliquer. */
export function adapterRecette(recette: Recette, entetesFichier: string[]): RapportRecette {
  const nomsCalcules = recette.calculs.map((c) => c.nomNouvelleColonne);
  const attendues = [...new Set([
    ...recette.colonnesSource,
    ...recette.calculs.flatMap((c) => [c.colonneA, c.colonneB].filter((x): x is string => !!x)),
    ...recette.filtres.map((f) => f.colonne),
    ...(recette.colonnesChoisies ?? []),
  ])].filter((c) => !nomsCalcules.includes(c));
  const correspondance = associerColonnes(attendues, entetesFichier);
  const renommees: [string, string][] = [...correspondance].filter(([a, p]) => a !== p);

  const disponibles = new Set(entetesFichier);
  // Nom d'une colonne de la recette dans le nouveau fichier (les colonnes calculées gardent leur nom)
  const traduire = (c: string): string | null => {
    if (nomsCalcules.includes(c)) return disponibles.has(c) ? c : null;
    const p = correspondance.get(c);
    return p && disponibles.has(p) ? p : null;
  };

  const ignorees: EtapeIgnoree[] = [];
  const calculs: DefinitionColonneCalculee[] = [];
  for (const def of recette.calculs) {
    const manquantes = [def.colonneA, def.colonneB].filter((c): c is string => !!c && traduire(c) === null);
    if (manquantes.length) {
      ignorees.push({ description: decrireCalcul(def), raison: raisonAbsence(manquantes) });
      continue;
    }
    if (entetesFichier.includes(def.nomNouvelleColonne)) {
      ignorees.push({ description: decrireCalcul(def), raison: `le fichier contient déjà une colonne « ${def.nomNouvelleColonne} »` });
      continue;
    }
    calculs.push({ ...def, colonneA: traduire(def.colonneA)!, ...(def.colonneB ? { colonneB: traduire(def.colonneB)! } : {}) });
    disponibles.add(def.nomNouvelleColonne);
  }

  const filtres: ConditionFiltre[] = [];
  for (const f of recette.filtres) {
    const col = traduire(f.colonne);
    if (col === null) {
      ignorees.push({ description: decrireFiltre(f), raison: raisonAbsence([f.colonne]) });
      continue;
    }
    filtres.push({ ...f, colonne: col });
  }

  const nouvelles = entetesFichier.filter((h) => ![...correspondance.values()].includes(h));
  const choisies = recette.colonnesChoisies
    ? [
        ...recette.colonnesChoisies.map(traduire).filter((c): c is string => c !== null),
        ...calculs.map((c) => c.nomNouvelleColonne),
        // Une colonne apparue ce mois-ci est montrée : on ne masque pas ce qu'on n'a jamais vu
        ...nouvelles,
      ]
    : [...entetesFichier, ...calculs.map((c) => c.nomNouvelleColonne)];

  return {
    calculs,
    filtres,
    colonnesChoisies: [...new Set(choisies)],
    renommees,
    ignorees,
    nouvelles,
    nbEtapes: recette.calculs.length + recette.filtres.length,
  };
}

function raisonAbsence(colonnes: string[]): string {
  return colonnes.length === 1
    ? `colonne « ${colonnes[0]} » absente du fichier`
    : `colonnes ${colonnes.map((c) => `« ${c} »`).join(" et ")} absentes du fichier`;
}

// ---------------------------------------------------------------------------
// Description en langage courant
// ---------------------------------------------------------------------------

const SYMBOLES: Record<NonNullable<DefinitionColonneCalculee["operateur"]>, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", ratio: "en % de" };
const UNITES: Record<NonNullable<DefinitionColonneCalculee["uniteDate"]>, string> = { annee: "année", mois: "mois", jour: "jour", annee_mois: "année-mois" };

export function decrireCalcul(def: DefinitionColonneCalculee): string {
  const nom = `« ${def.nomNouvelleColonne} »`;
  if (def.type === "operation" && def.operateur) return `Colonne ${nom} = ${def.colonneA} ${SYMBOLES[def.operateur]} ${def.colonneB ?? "?"}`;
  if (def.type === "extraction_date" && def.uniteDate) return `Colonne ${nom} = ${UNITES[def.uniteDate]} de ${def.colonneA}`;
  if (def.type === "tranches") return `Colonne ${nom} = tranches de ${def.colonneA} (${def.tranches?.length ?? 0})`;
  return `Colonne ${nom}`;
}

const OPERATEURS: Record<ConditionFiltre["operateur"], string> = {
  egal: "=", different: "≠", contient: "contient", superieur: "≥", inferieur: "≤", entre: "entre",
};

export function decrireFiltre(f: ConditionFiltre): string {
  if (f.operateur === "entre") return `Filtre : ${f.colonne} entre ${f.valeur} et ${f.valeurFin}`;
  return `Filtre : ${f.colonne} ${OPERATEURS[f.operateur] ?? f.operateur} « ${f.valeur} »`;
}

/** Résumé d'une application, à afficher à l'utilisateur. */
export function resumerRapport(r: RapportRecette): string {
  const rejouees = r.calculs.length + r.filtres.length;
  const parts = [`${rejouees} étape(s) sur ${r.nbEtapes} rejouée(s)`];
  if (r.renommees.length) parts.push(`colonne(s) reconnue(s) sous un autre nom : ${r.renommees.map(([a, b]) => `« ${a} » → « ${b} »`).join(", ")}`);
  if (r.ignorees.length) parts.push(`ignorée(s) : ${r.ignorees.map((e) => `${e.description} (${e.raison})`).join(" ; ")}`);
  if (r.nouvelles.length) parts.push(`nouvelle(s) colonne(s) : ${r.nouvelles.slice(0, 5).join(", ")}${r.nouvelles.length > 5 ? "…" : ""}`);
  return `${parts.join(" · ")}.`;
}

// ---------------------------------------------------------------------------
// Création, export et lecture
// ---------------------------------------------------------------------------

export function creerRecette(
  nom: string,
  colonnesSource: string[],
  calculs: DefinitionColonneCalculee[],
  filtres: ConditionFiltre[],
  colonnesChoisies?: string[]
): Recette {
  return {
    format: "datenza-recette",
    version: VERSION_RECETTE,
    nom: nom.trim() || "Recette sans nom",
    creeLe: new Date().toISOString(),
    colonnesSource: [...colonnesSource],
    calculs: calculs.map((c) => ({ ...c })),
    filtres: filtres.map((f) => ({ ...f })),
    ...(colonnesChoisies ? { colonnesChoisies: [...colonnesChoisies] } : {}),
  };
}

const MAX_ETAPES = 200;
const MAX_COLONNES = 2000;
const texte = (v: unknown, max = 300): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const valeurSimple = (v: unknown) => v === undefined || v === null || typeof v === "number" || (typeof v === "string" && v.length <= 300);

function lireCalcul(c: unknown): DefinitionColonneCalculee | null {
  if (!c || typeof c !== "object") return null;
  const d = c as Record<string, unknown>;
  if (!texte(d.nomNouvelleColonne) || !texte(d.colonneA)) return null;
  if (d.type === "operation") {
    if (!texte(d.colonneB) || !["+", "-", "*", "/", "ratio"].includes(d.operateur as string)) return null;
    return { nomNouvelleColonne: d.nomNouvelleColonne, type: "operation", colonneA: d.colonneA, colonneB: d.colonneB, operateur: d.operateur as DefinitionColonneCalculee["operateur"] };
  }
  if (d.type === "extraction_date") {
    if (!["annee", "mois", "jour", "annee_mois"].includes(d.uniteDate as string)) return null;
    return { nomNouvelleColonne: d.nomNouvelleColonne, type: "extraction_date", colonneA: d.colonneA, uniteDate: d.uniteDate as DefinitionColonneCalculee["uniteDate"] };
  }
  if (d.type === "tranches") {
    if (!Array.isArray(d.tranches) || d.tranches.length > 100) return null;
    const tranches = d.tranches.map((t) => {
      const x = t as Record<string, unknown>;
      return typeof x?.min === "number" && typeof x?.max === "number" && texte(x?.label) ? { min: x.min, max: x.max, label: x.label } : null;
    });
    if (tranches.some((t) => t === null)) return null;
    return { nomNouvelleColonne: d.nomNouvelleColonne, type: "tranches", colonneA: d.colonneA, tranches: tranches as { min: number; max: number; label: string }[] };
  }
  return null;
}

function lireFiltre(f: unknown): ConditionFiltre | null {
  if (!f || typeof f !== "object") return null;
  const d = f as Record<string, unknown>;
  if (!texte(d.colonne) || !Object.keys(OPERATEURS).includes(d.operateur as string)) return null;
  if (!valeurSimple(d.valeur) || !valeurSimple(d.valeurFin)) return null;
  return { colonne: d.colonne, operateur: d.operateur as ConditionFiltre["operateur"], valeur: d.valeur, ...(d.valeurFin !== undefined ? { valeurFin: d.valeurFin } : {}) };
}

/**
 * Lit une recette venue d'un fichier ou du stockage local. Le contenu est validé champ par champ :
 * un fichier mal formé ou modifié à la main est refusé avec un message clair, jamais exécuté tel quel.
 */
export function lireRecette(brut: unknown): Recette {
  const d = (typeof brut === "string" ? JSON.parse(brut) : brut) as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || d.format !== "datenza-recette") throw new Error("Ce fichier n'est pas une recette DATENZA.");
  if (typeof d.version !== "number" || d.version > VERSION_RECETTE) throw new Error("Cette recette vient d'une version plus récente de DATENZA.");
  const colonnes = d.colonnesSource;
  if (!Array.isArray(colonnes) || colonnes.length > MAX_COLONNES || !colonnes.every((c) => texte(c))) throw new Error("Recette invalide : liste de colonnes illisible.");
  if (!Array.isArray(d.calculs) || !Array.isArray(d.filtres) || d.calculs.length + d.filtres.length > MAX_ETAPES) throw new Error("Recette invalide : étapes illisibles.");
  const calculs = d.calculs.map(lireCalcul);
  const filtres = d.filtres.map(lireFiltre);
  if (calculs.some((c) => c === null) || filtres.some((f) => f === null)) throw new Error("Recette invalide : une étape est mal formée.");
  const choisies = d.colonnesChoisies;
  if (choisies !== undefined && (!Array.isArray(choisies) || choisies.length > MAX_COLONNES || !choisies.every((c) => texte(c)))) {
    throw new Error("Recette invalide : colonnes choisies illisibles.");
  }
  return {
    format: "datenza-recette",
    version: d.version,
    nom: texte(d.nom, 120) ? d.nom : "Recette importée",
    creeLe: typeof d.creeLe === "string" ? d.creeLe : new Date().toISOString(),
    colonnesSource: colonnes as string[],
    calculs: calculs as DefinitionColonneCalculee[],
    filtres: filtres as ConditionFiltre[],
    ...(choisies ? { colonnesChoisies: choisies as string[] } : {}),
  };
}

/**
 * Retire une colonne calculée et, en cascade, les colonnes calculées et filtres qui l'utilisent.
 * Renvoie aussi les descriptions des étapes retirées par ricochet, pour prévenir l'utilisateur.
 */
export function retirerCalcul(
  calculs: DefinitionColonneCalculee[],
  filtres: ConditionFiltre[],
  index: number
): { calculs: DefinitionColonneCalculee[]; filtres: ConditionFiltre[]; ricochets: string[] } {
  const supprimees = new Set<string>();
  const ricochets: string[] = [];
  const restants: DefinitionColonneCalculee[] = [];
  calculs.forEach((c, i) => {
    const depend = [c.colonneA, c.colonneB].some((x) => x && supprimees.has(x));
    if (i === index || depend) {
      supprimees.add(c.nomNouvelleColonne);
      if (i !== index) ricochets.push(decrireCalcul(c));
    } else restants.push(c);
  });
  const filtresRestants = filtres.filter((f) => {
    if (!supprimees.has(f.colonne)) return true;
    ricochets.push(decrireFiltre(f));
    return false;
  });
  return { calculs: restants, filtres: filtresRestants, ricochets };
}

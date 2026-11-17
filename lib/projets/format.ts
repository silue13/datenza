// lib/projets/format.ts — forme d'un projet enregistré et (dé)compression de ses données.
// Aucun appel réseau ici : ce fichier se teste seul.
import type { Cellule } from "../analyse/utils";
import type { EtatPersiste } from "../persistance";
import { normaliserSource } from "../import/source";
import type { ApercuGraphique } from "./apercu";

/** Tout ce qui décrit un projet, hors lignes du fichier et hors analyse (recalculée à l'ouverture). */
export type ReglagesProjet = Pick<EtatPersiste, "choisies" | "rapport" | "graphiquesEpingles" | "filtresActifs" | "definitionsCalculs" | "source"> & {
  /** Mini graphique repris dans l'image d'aperçu du lien partagé (valeurs agrégées uniquement). */
  apercu?: ApercuGraphique | null;
};

export interface DonneesProjet {
  v: 1;
  sources: { entetes: string[]; corps: Cellule[][] };
}

/** Limite d'envoi d'un fichier sur l'offre gratuite de Supabase (50 Mo), avec une marge. */
export const TAILLE_MAX_OCTETS = 45 * 1024 * 1024;

export function extraireReglages(etat: EtatPersiste, apercu: ApercuGraphique | null = null): ReglagesProjet {
  const reglages: ReglagesProjet = {
    choisies: etat.choisies,
    rapport: etat.rapport,
    graphiquesEpingles: etat.graphiquesEpingles,
    filtresActifs: etat.filtresActifs,
    definitionsCalculs: etat.definitionsCalculs,
    source: etat.source ?? null,
    apercu,
  };
  // Passage par JSON : on n'envoie que ce qui se relira à l'identique
  return JSON.parse(JSON.stringify(reglages)) as ReglagesProjet;
}

/** Reconstitue l'état de l'application à partir d'un projet enregistré. Tolère des réglages incomplets. */
export function assemblerEtat(nomFichier: string, donnees: unknown, reglages: unknown): EtatPersiste {
  const d = (donnees ?? {}) as Partial<DonneesProjet>;
  const entetes = Array.isArray(d.sources?.entetes) ? d.sources.entetes.map(String) : [];
  const corps = Array.isArray(d.sources?.corps) ? d.sources.corps.filter(Array.isArray) : [];
  if (!entetes.length || !corps.length) throw new Error("Les données de ce projet sont vides ou illisibles.");
  const r = (reglages && typeof reglages === "object" ? reglages : {}) as Partial<ReglagesProjet>;
  const liste = <T,>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : []);
  const choisies = liste(r.choisies).filter((c) => typeof c === "string");
  return {
    nomFichier,
    sources: { entetes, corps },
    choisies: choisies.length ? choisies : entetes,
    rapport: liste(r.rapport),
    resultat: null,
    graphiquesEpingles: liste(r.graphiquesEpingles),
    filtresActifs: liste(r.filtresActifs),
    definitionsCalculs: liste(r.definitionsCalculs),
    source: normaliserSource(r.source),
  };
}

/** Données du projet en JSON compressé (gzip) ; JSON simple si le navigateur ne sait pas compresser. */
export async function compresserDonnees(donnees: DonneesProjet): Promise<Blob> {
  const json = new Blob([JSON.stringify(donnees)], { type: "application/json" });
  if (typeof CompressionStream === "undefined") return json;
  const flux = json.stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(flux).arrayBuffer()], { type: "application/octet-stream" });
}

/** Relit des données enregistrées, compressées ou non (reconnues à leurs deux premiers octets). */
export async function decompresserDonnees(blob: Blob): Promise<unknown> {
  const tete = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (tete[0] === 0x1f && tete[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") throw new Error("Ce navigateur est trop ancien pour ouvrir ce projet.");
    const flux = blob.stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(flux).text());
  }
  return JSON.parse(await blob.text());
}

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/** Nom de projet proposé par défaut : le nom du fichier sans son extension. */
export function nomParDefaut(nomFichier: string): string {
  return (nomFichier || "Mon projet").replace(/\.(xlsx|xlsm|xls|csv|tsv|txt|json|ods)$/i, "").trim().slice(0, 120) || "Mon projet";
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estUuid = (s: unknown): s is string => typeof s === "string" && RE_UUID.test(s);

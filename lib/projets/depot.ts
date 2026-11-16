// lib/projets/depot.ts — lecture et écriture des projets dans Supabase (table « projets » + bucket « projets »).
import { createClient } from "../supabase/client";
import type { EtatPersiste } from "../persistance";
import {
  TAILLE_MAX_OCTETS,
  assemblerEtat,
  compresserDonnees,
  decompresserDonnees,
  estUuid,
  extraireReglages,
  formaterTaille,
} from "./format";

export interface ProjetResume {
  id: string;
  nom: string;
  nom_fichier: string;
  nb_lignes: number;
  nb_colonnes: number;
  taille_octets: number;
  partage_id: string | null;
  created_at: string;
  updated_at: string;
}

const BUCKET = "projets";
const COLONNES = "id, nom, nom_fichier, nb_lignes, nb_colonnes, taille_octets, partage_id, created_at, updated_at";

/** Messages techniques de Supabase traduits en phrases utiles. */
function expliquer(e: unknown, action: string): Error {
  const brut = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
  if (/bucket not found|relation .*projets.* does not exist|could not find the table/i.test(brut)) {
    return new Error("La base n'est pas encore prête : exécutez le fichier supabase/schema.sql dans l'éditeur SQL de Supabase.");
  }
  if (/row-level security|not authorized|jwt|unauthorized/i.test(brut)) return new Error("Votre session a expiré. Reconnectez-vous puis réessayez.");
  if (/failed to fetch|network/i.test(brut)) return new Error("Connexion Internet indisponible. Réessayez dans un instant.");
  if (/too large|exceeded the maximum/i.test(brut)) return new Error("Ce fichier est trop volumineux pour être enregistré en ligne.");
  return new Error(`${action} : ${brut}`);
}

async function identifiantUtilisateur(): Promise<string> {
  const { data, error } = await createClient().auth.getUser();
  if (error || !data.user) throw new Error("Connectez-vous pour gérer vos projets.");
  return data.user.id;
}

export async function listerProjets(): Promise<ProjetResume[]> {
  const { data, error } = await createClient().from("projets").select(COLONNES).order("updated_at", { ascending: false });
  if (error) throw expliquer(error, "Lecture des projets impossible");
  return (data ?? []) as unknown as ProjetResume[];
}

/**
 * Enregistre l'état courant : crée un projet, ou met à jour celui dont on passe l'identifiant.
 * Les lignes du fichier partent compressées dans le stockage ; les réglages dans la table.
 */
export async function enregistrerProjet(etat: EtatPersiste, nom: string, idExistant?: string): Promise<ProjetResume> {
  const nomPropre = nom.trim().slice(0, 120);
  if (!nomPropre) throw new Error("Donnez un nom au projet.");
  if (!etat.sources.entetes.length || !etat.sources.corps.length) throw new Error("Aucune donnée à enregistrer : importez d'abord un fichier.");

  const supabase = createClient();
  const userId = await identifiantUtilisateur();
  const id = idExistant ?? crypto.randomUUID();
  const chemin = `${userId}/${id}.json.gz`;

  const blob = await compresserDonnees({ v: 1, sources: etat.sources });
  if (blob.size > TAILLE_MAX_OCTETS) {
    throw new Error(`Ce fichier pèse ${formaterTaille(blob.size)} une fois compressé : la limite d'enregistrement en ligne est de ${formaterTaille(TAILLE_MAX_OCTETS)}.`);
  }
  const envoi = await supabase.storage.from(BUCKET).upload(chemin, blob, { upsert: true, contentType: "application/octet-stream", cacheControl: "0" });
  if (envoi.error) throw expliquer(envoi.error, "Envoi des données impossible");

  const ligne = {
    nom: nomPropre,
    nom_fichier: etat.nomFichier,
    nb_lignes: etat.sources.corps.length,
    nb_colonnes: etat.sources.entetes.length,
    taille_octets: blob.size,
    chemin_donnees: chemin,
    reglages: extraireReglages(etat),
  };
  const requete = idExistant
    ? supabase.from("projets").update(ligne).eq("id", id).select(COLONNES).maybeSingle()
    : supabase.from("projets").insert({ id, ...ligne }).select(COLONNES).maybeSingle();
  const { data, error } = await requete;
  if (error) {
    // Projet neuf dont la fiche n'a pas pu être créée : on ne laisse pas de données orphelines
    if (!idExistant) await supabase.storage.from(BUCKET).remove([chemin]);
    throw expliquer(error, "Enregistrement du projet impossible");
  }
  if (!data) throw new Error("Ce projet n'existe plus dans votre compte. Enregistrez-le comme nouveau projet.");
  return data as unknown as ProjetResume;
}

/** Ouvre un projet du compte : renvoie l'état prêt à être chargé dans l'application. */
export async function chargerProjet(id: string): Promise<{ projet: ProjetResume; etat: EtatPersiste }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("projets").select(`${COLONNES}, chemin_donnees, reglages`).eq("id", id).maybeSingle();
  if (error) throw expliquer(error, "Ouverture du projet impossible");
  if (!data) throw new Error("Projet introuvable.");
  const fiche = data as unknown as ProjetResume & { chemin_donnees: string; reglages: unknown };
  const fichier = await supabase.storage.from(BUCKET).download(fiche.chemin_donnees);
  if (fichier.error || !fichier.data) throw expliquer(fichier.error ?? "fichier absent", "Téléchargement des données impossible");
  const etat = assemblerEtat(String(fiche.nom_fichier ?? ""), await decompresserDonnees(fichier.data), fiche.reglages);
  return { projet: fiche, etat };
}

export async function renommerProjet(id: string, nom: string): Promise<void> {
  const nomPropre = nom.trim().slice(0, 120);
  if (!nomPropre) throw new Error("Donnez un nom au projet.");
  const { error } = await createClient().from("projets").update({ nom: nomPropre }).eq("id", id);
  if (error) throw expliquer(error, "Renommage impossible");
}

export async function supprimerProjet(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await identifiantUtilisateur();
  const { error } = await supabase.from("projets").delete().eq("id", id);
  if (error) throw expliquer(error, "Suppression impossible");
  await supabase.storage.from(BUCKET).remove([`${userId}/${id}.json.gz`]);
}

/** Active le partage (nouveau lien secret) ou le coupe (l'ancien lien cesse aussitôt de fonctionner). */
export async function definirPartage(id: string, actif: boolean): Promise<string | null> {
  const partage_id = actif ? crypto.randomUUID() : null;
  const { error } = await createClient().from("projets").update({ partage_id }).eq("id", id);
  if (error) throw expliquer(error, "Modification du partage impossible");
  return partage_id;
}

export interface ProjetPartage {
  nom: string;
  majLe: string;
  etat: EtatPersiste;
}

/** Ouvre un projet partagé à partir de l'identifiant de son lien. Aucun compte requis. */
export async function chargerPartage(partageId: string): Promise<ProjetPartage> {
  if (!estUuid(partageId)) throw new Error("Ce lien de partage n'est pas valide.");
  const rep = await fetch(`/api/partage/${partageId}`, { cache: "no-store" });
  const info = (await rep.json().catch(() => ({}))) as { nom?: string; nomFichier?: string; reglages?: unknown; urlDonnees?: string; majLe?: string; error?: string };
  if (!rep.ok || !info.urlDonnees) throw new Error(info.error ?? "Ce projet partagé est indisponible.");
  const fichier = await fetch(info.urlDonnees);
  if (!fichier.ok) throw new Error("Les données de ce projet n'ont pas pu être téléchargées.");
  const etat = assemblerEtat(info.nomFichier ?? "", await decompresserDonnees(await fichier.blob()), info.reglages);
  return { nom: info.nom ?? "Projet partagé", majLe: info.majLe ?? "", etat };
}

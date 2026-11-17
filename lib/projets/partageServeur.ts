// lib/projets/partageServeur.ts — lecture d'un projet partagé côté serveur (clé secrète).
// À n'importer que depuis du code serveur (routes, métadonnées) : la clé secrète n'est pas publiée vers le navigateur.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { estUuid } from "./format";

export interface FichePartagee {
  nom: string;
  nom_fichier: string;
  nb_lignes: number;
  nb_colonnes: number;
  reglages: unknown;
  chemin_donnees: string;
  updated_at: string;
}

export type LecturePartage =
  | { etat: "ok"; fiche: FichePartagee; admin: SupabaseClient }
  | { etat: "invalide" | "absent" | "non-configure" | "erreur" };

/** Lit la fiche d'un projet dont le lien de partage est actif. */
export async function lireProjetPartage(partageId: string): Promise<LecturePartage> {
  if (!estUuid(partageId)) return { etat: "invalide" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cleSecrete = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cleSecrete) return { etat: "non-configure" };
  const admin = createClient(url, cleSecrete, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("projets")
    .select("nom, nom_fichier, nb_lignes, nb_colonnes, reglages, chemin_donnees, updated_at")
    .eq("partage_id", partageId)
    .maybeSingle();
  if (error) return { etat: "erreur" };
  if (!data) return { etat: "absent" };
  return { etat: "ok", fiche: data as unknown as FichePartagee, admin };
}

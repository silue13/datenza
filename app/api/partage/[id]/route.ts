// app/api/partage/[id]/route.ts — ouverture d'un projet partagé par lien, sans compte.
// Seul le serveur détient la clé secrète : il vérifie que le lien est actif, puis délivre
// les réglages du projet et une adresse de téléchargement des données valable 5 minutes.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { estUuid } from "../../../../lib/projets/format";

const erreur = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!estUuid(id)) return erreur("Ce lien de partage n'est pas valide.", 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cleSecrete = process.env.SUPABASE_SECRET_KEY;
  if (!url || !cleSecrete) return erreur("Le partage n'est pas configuré sur le serveur (SUPABASE_SECRET_KEY manquante).", 503);

  const admin = createClient(url, cleSecrete, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("projets")
    .select("nom, nom_fichier, reglages, chemin_donnees, updated_at")
    .eq("partage_id", id)
    .maybeSingle();
  if (error) return erreur("Le projet partagé n'a pas pu être lu.", 502);
  const projet = data as { nom: string; nom_fichier: string; reglages: unknown; chemin_donnees: string; updated_at: string } | null;
  if (!projet) return erreur("Ce lien de partage n'existe pas ou a été désactivé par son propriétaire.", 404);

  const acces = await admin.storage.from("projets").createSignedUrl(projet.chemin_donnees, 300);
  if (acces.error || !acces.data?.signedUrl) return erreur("Les données de ce projet sont introuvables.", 502);

  return NextResponse.json(
    { nom: projet.nom, nomFichier: projet.nom_fichier, reglages: projet.reglages, urlDonnees: acces.data.signedUrl, majLe: projet.updated_at },
    { headers: { "Cache-Control": "no-store" } }
  );
}

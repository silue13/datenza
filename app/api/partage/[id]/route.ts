// app/api/partage/[id]/route.ts — ouverture d'un projet partagé par lien, sans compte.
// Seul le serveur détient la clé secrète : il vérifie que le lien est actif, puis délivre
// les réglages du projet et une adresse de téléchargement des données valable 5 minutes.
import { NextResponse } from "next/server";
import { lireProjetPartage } from "../../../../lib/projets/partageServeur";

const erreur = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lecture = await lireProjetPartage(id);
  if (lecture.etat === "invalide") return erreur("Ce lien de partage n'est pas valide.", 400);
  if (lecture.etat === "non-configure") return erreur("Le partage n'est pas configuré sur le serveur (SUPABASE_SECRET_KEY manquante).", 503);
  if (lecture.etat === "erreur") return erreur("Le projet partagé n'a pas pu être lu.", 502);
  if (lecture.etat !== "ok") return erreur("Ce lien de partage n'existe pas ou a été désactivé par son propriétaire.", 404);

  const { fiche, admin } = lecture;
  const acces = await admin.storage.from("projets").createSignedUrl(fiche.chemin_donnees, 300);
  if (acces.error || !acces.data?.signedUrl) return erreur("Les données de ce projet sont introuvables.", 502);

  return NextResponse.json(
    { nom: fiche.nom, nomFichier: fiche.nom_fichier, reglages: fiche.reglages, urlDonnees: acces.data.signedUrl, majLe: fiche.updated_at },
    { headers: { "Cache-Control": "no-store" } }
  );
}

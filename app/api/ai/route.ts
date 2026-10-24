// app/api/ai/route.ts
import { NextResponse, connection } from "next/server";
import { verifierQuestionLieeAuxFichier } from "../../../lib/ia/ai-guard";
import { construireMessagesIA, determinerLangueConversation } from "../../../lib/ia/prompts";
import { appelerFournisseur, candidatsIA, fournisseursConfigures, IA_CONFIG } from "../../../lib/ia/ai-providers";

export const maxDuration = 60; // à ajuster selon ton plan Vercel

interface CorpsRequete {
  question?: unknown;
  contexte?: unknown;
  fournisseur?: unknown;
  langueConversation?: string;
  langueApp?: string;
  historique?: unknown;
  mode?: unknown; // "monchamp" : le contexte est un projet agricole calculé, pas un fichier importé
}

const erreur = (message: string, status: number) => NextResponse.json({ error: message }, { status });

// Limite provisoire : 30 questions / heure / adresse IP.
// En mémoire, donc propre à chaque instance serveur : c'est un garde-fou, pas une vraie protection.
// À remplacer par l'authentification Supabase + un compteur persistant.
const LIMITE = 30;
const FENETRE_MS = 60 * 60 * 1000;
const compteurs = new Map<string, { debut: number; n: number }>();

function depasseLimite(ip: string): boolean {
  const maintenant = Date.now();
  const c = compteurs.get(ip);
  if (!c || maintenant - c.debut > FENETRE_MS) {
    compteurs.set(ip, { debut: maintenant, n: 1 });
    if (compteurs.size > 5000) {
      for (const [k, v] of compteurs) if (maintenant - v.debut > FENETRE_MS) compteurs.delete(k);
    }
    return false;
  }
  c.n++;
  return c.n > LIMITE;
}

/** Moteurs réellement configurés sur le serveur (pour le sélecteur de la page Assistant IA). */
export async function GET() {
  await connection(); // lecture à chaque requête, jamais figée au build
  return NextResponse.json({ fournisseurs: fournisseursConfigures().map((id) => ({ id, nom: IA_CONFIG[id].nom })) });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "inconnue";
  if (depasseLimite(ip)) return erreur("Limite atteinte : 30 questions par heure.", 429);

  let body: CorpsRequete;
  try {
    body = (await req.json()) as CorpsRequete;
  } catch {
    return erreur("Requête invalide.", 400);
  }

  const question = String(body?.question ?? "").trim();
  if (!question) return erreur("La question est vide.", 400);
  if (question.length > 4000) return erreur("Question trop longue.", 400);

  const contexte = typeof body?.contexte === "string" ? body.contexte : JSON.stringify(body?.contexte ?? {});
  if (contexte.length > 300_000) return erreur("Contexte trop volumineux.", 413);

  // 1) Garde-fou AVANT tout appel fournisseur : aucun token consommé si hors sujet.
  const mode = body?.mode === "monchamp" ? "monchamp" : "fichier";
  const garde = verifierQuestionLieeAuxFichier(question, contexte, body?.langueConversation, mode);
  if (!garde.ok) return erreur(garde.message, 422);

  const candidats = candidatsIA(String(body?.fournisseur ?? "auto"));
  if (!candidats.length) return erreur("Aucun service IA n’est configuré sur le serveur.", 503);

  const langue = determinerLangueConversation(question, body?.langueConversation, body?.langueApp);
  const messages = construireMessagesIA(question, contexte, langue, body?.historique, mode);

  const erreurs: string[] = [];
  for (const nom of candidats) {
    try {
      const reponse = await appelerFournisseur(nom, messages);
      return NextResponse.json({ fournisseur: nom, reponse });
    } catch (e) {
      erreurs.push(`${IA_CONFIG[nom].nom} : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }
  return erreur(
    "Tous les services IA disponibles ont échoué. DATENZA a tenté automatiquement plusieurs fournisseurs avant d’abandonner. " + erreurs.join(" | "),
    502
  );
}
// lib/ia/appelIA.ts — appel de l'assistant IA depuis le navigateur, avec la session de l'utilisateur.
// Le serveur réserve l'assistant aux comptes connectés : le jeton de session accompagne chaque question.
import { createClient, supabaseConfigure } from "../supabase/client";

async function jetonSession(): Promise<string | null> {
  if (!supabaseConfigure) return null;
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Envoie une question à /api/ai ; la réponse (succès ou erreur lisible) est lue par l'appelant. */
export async function appelerIA(corps: Record<string, unknown>): Promise<Response> {
  const jeton = await jetonSession();
  return fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: JSON.stringify(corps),
  });
}

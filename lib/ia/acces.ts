// lib/ia/acces.ts — qui peut utiliser l'assistant IA, et combien de fois par jour (code serveur uniquement).
//
// Chaque question coûte un appel payant à un fournisseur d'IA : la route exige donc une session Supabase
// valide, vérifiée auprès de Supabase, puis décompte un quota journalier par compte, stocké en base
// (table quotas_ia, fonction consommer_quota_ia : voir supabase/schema.sql). Un compteur en base est
// commun à toutes les instances du serveur et ne se contourne pas en changeant d'adresse IP.
import { createClient } from "@supabase/supabase-js";

export const QUOTA_JOURNALIER_DEFAUT = 150;

export type AccesIA =
  | { ok: true; utilisateur: string | null; utilises: number | null; limite: number | null }
  | { ok: false; status: 401 | 429 | 503; message: string };

export interface DependancesAcces {
  /** Comptes Supabase configurés sur le serveur. */
  configure: boolean;
  /** Identifiant de l'utilisateur si le jeton est valide, null sinon. */
  verifierJeton: (jeton: string) => Promise<string | null>;
  /** Décompte une question ; null si la fonction de quota n'est pas installée dans la base. */
  consommerQuota: (jeton: string, limite: number) => Promise<{ autorise: boolean; utilises: number } | null>;
  limite: number;
}

export const MESSAGE_CONNEXION =
  "Connectez-vous pour utiliser l'assistant IA : menu « Compte » (création gratuite). Vos fichiers restent dans votre navigateur.";
export const MESSAGE_SESSION_EXPIREE = "Votre session a expiré : reconnectez-vous depuis le menu « Compte ».";

export function extraireJeton(entete: string | null): string | null {
  const m = entete?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

// Repli si la fonction de quota n'a pas encore été installée dans la base : compteur en mémoire par compte.
// Moins solide (propre à chaque instance), mais l'accès reste réservé aux comptes connectés.
const compteursMemoire = new Map<string, { jour: string; n: number }>();
let avertissementAffiche = false;

function quotaMemoire(utilisateur: string, limite: number, maintenant = new Date()): { autorise: boolean; utilises: number } {
  const jour = maintenant.toISOString().slice(0, 10);
  const c = compteursMemoire.get(utilisateur);
  const n = c && c.jour === jour ? c.n : 0;
  if (n >= limite) return { autorise: false, utilises: n };
  compteursMemoire.set(utilisateur, { jour, n: n + 1 });
  return { autorise: true, utilises: n + 1 };
}

export async function verifierAccesIA(entete: string | null, deps: DependancesAcces = dependancesSupabase()): Promise<AccesIA> {
  // Comptes non configurés (développement local, installation sans Supabase) : pas de contrôle par compte
  if (!deps.configure) return { ok: true, utilisateur: null, utilises: null, limite: null };

  const jeton = extraireJeton(entete);
  if (!jeton) return { ok: false, status: 401, message: MESSAGE_CONNEXION };

  let utilisateur: string | null;
  try {
    utilisateur = await deps.verifierJeton(jeton);
  } catch {
    return { ok: false, status: 503, message: "Vérification du compte impossible pour le moment. Réessayez dans un instant." };
  }
  if (!utilisateur) return { ok: false, status: 401, message: MESSAGE_SESSION_EXPIREE };

  let quota = await deps.consommerQuota(jeton, deps.limite).catch(() => null);
  if (!quota) {
    if (!avertissementAffiche) {
      avertissementAffiche = true;
      console.warn("Quota IA : fonction consommer_quota_ia absente de la base, compteur en mémoire utilisé. Relancez supabase/schema.sql.");
    }
    quota = quotaMemoire(utilisateur, deps.limite);
  }
  if (!quota.autorise) {
    return {
      ok: false,
      status: 429,
      message: `Vous avez utilisé vos ${deps.limite} questions à l'assistant IA aujourd'hui. Le quota se renouvelle demain (minuit UTC).`,
    };
  }
  return { ok: true, utilisateur, utilises: quota.utilises, limite: deps.limite };
}

/** Accès réels : jeton vérifié par Supabase, quota décompté par la fonction SQL au nom de l'utilisateur. */
export function dependancesSupabase(): DependancesAcces {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const limiteEnv = Number(process.env.IA_QUOTA_JOURNALIER);
  const limite = Number.isInteger(limiteEnv) && limiteEnv > 0 ? limiteEnv : QUOTA_JOURNALIER_DEFAUT;
  const client = (jeton?: string) =>
    createClient(url!, cle!, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(jeton ? { global: { headers: { Authorization: `Bearer ${jeton}` } } } : {}),
    });
  return {
    configure: Boolean(url && cle),
    limite,
    verifierJeton: async (jeton) => {
      const { data, error } = await client().auth.getUser(jeton);
      if (error) {
        // Jeton refusé (expiré, falsifié) : réponse attendue ; autre erreur : Supabase injoignable
        if (error.status && error.status >= 400 && error.status < 500) return null;
        throw error;
      }
      return data.user?.id ?? null;
    },
    consommerQuota: async (jeton, lim) => {
      const { data, error } = await client(jeton).rpc("consommer_quota_ia", { limite: lim });
      if (error) return null;
      const ligne = (Array.isArray(data) ? data[0] : data) as { autorise?: boolean; utilises?: number } | null;
      if (!ligne || typeof ligne.autorise !== "boolean") return null;
      return { autorise: ligne.autorise, utilises: Number(ligne.utilises ?? 0) };
    },
  };
}

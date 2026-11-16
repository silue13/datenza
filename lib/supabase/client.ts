import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE_PUBLIQUE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Faux tant que les deux variables d'environnement ne sont pas renseignées : l'application reste utilisable sans compte. */
export const supabaseConfigure = Boolean(URL_SUPABASE && CLE_PUBLIQUE);

let instance: SupabaseClient | null = null;

/** Client Supabase du navigateur (une seule instance, session conservée dans les cookies). */
export function createClient(): SupabaseClient {
  if (!URL_SUPABASE || !CLE_PUBLIQUE) {
    throw new Error("Les comptes ne sont pas configurés : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sont absentes.");
  }
  instance ??= createBrowserClient(URL_SUPABASE, CLE_PUBLIQUE);
  return instance;
}

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, supabaseConfigure } from "../../lib/supabase/client";

interface AuthContextType {
  utilisateur: User | null;
  /** Vrai tant que la session n'a pas été lue. */
  chargement: boolean;
  /** Faux si les clés Supabase ne sont pas renseignées : les comptes sont alors désactivés. */
  configure: boolean;
  /** L'utilisateur arrive d'un e-mail « mot de passe oublié » : il doit choisir un nouveau mot de passe. */
  recuperation: boolean;
  terminerRecuperation: () => void;
  deconnecter: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<User | null>(null);
  const [chargement, setChargement] = useState(supabaseConfigure);
  const [recuperation, setRecuperation] = useState(false);

  useEffect(() => {
    if (!supabaseConfigure) return;
    const supabase = createClient();
    let actif = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!actif) return;
        setUtilisateur(data.session?.user ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (actif) setChargement(false);
      });
    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement, session) => {
      setUtilisateur(session?.user ?? null);
      if (evenement === "PASSWORD_RECOVERY") setRecuperation(true);
      if (evenement === "SIGNED_OUT") setRecuperation(false);
    });
    return () => {
      actif = false;
      abonnement.subscription.unsubscribe();
    };
  }, []);

  async function deconnecter() {
    if (!supabaseConfigure) return;
    await createClient().auth.signOut();
    setUtilisateur(null);
  }

  return (
    <AuthContext.Provider
      value={{
        utilisateur,
        chargement,
        configure: supabaseConfigure,
        recuperation,
        terminerRecuperation: () => setRecuperation(false),
        deconnecter,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return contexte;
}

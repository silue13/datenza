"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, Key, LogOut, Mail, ShieldCheck, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { createClient } from "../../lib/supabase/client";

type Mode = "connexion" | "inscription" | "oubli";
type Retour = { type: "ok" | "erreur"; texte: string } | null;

const CHAMP =
  "w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
const BOUTON =
  "w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:cursor-not-allowed";
const LONGUEUR_MIN = 8;

/** Messages de Supabase (en anglais) traduits pour l'utilisateur. */
function traduire(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirmez d'abord votre adresse : ouvrez le lien reçu par e-mail.";
  if (/already registered|already been registered/i.test(message)) return "Un compte existe déjà avec cette adresse. Connectez-vous.";
  if (/rate limit|too many|only request this after/i.test(message)) return "Trop de tentatives. Patientez une minute avant de réessayer.";
  if (/password should be|weak password/i.test(message)) return `Mot de passe trop faible : ${LONGUEUR_MIN} caractères au minimum.`;
  if (/different from the old/i.test(message)) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (/unable to validate email|invalid email|email address .* invalid/i.test(message)) return "Cette adresse e-mail n'est pas valide.";
  if (/failed to fetch|network/i.test(message)) return "Connexion Internet indisponible. Réessayez dans un instant.";
  return message;
}

function Message({ retour }: { retour: Retour }) {
  if (!retour) return null;
  return (
    <p
      role={retour.type === "erreur" ? "alert" : "status"}
      className={`text-xs rounded-xl px-3 py-2 border ${
        retour.type === "erreur"
          ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
          : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {retour.texte}
    </p>
  );
}

function Carte({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm space-y-5">
      {children}
    </div>
  );
}

function ChangerMotDePasse({ titre, apresSucces }: { titre: string; apresSucces?: () => void }) {
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (motDePasse.length < LONGUEUR_MIN) {
      setRetour({ type: "erreur", texte: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.` });
      return;
    }
    setEnvoi(true);
    setRetour(null);
    const { error } = await createClient().auth.updateUser({ password: motDePasse });
    setEnvoi(false);
    if (error) {
      setRetour({ type: "erreur", texte: traduire(error.message) });
      return;
    }
    setMotDePasse("");
    setRetour({ type: "ok", texte: "Mot de passe modifié." });
    apresSucces?.();
  }

  return (
    <form onSubmit={valider} className="space-y-3">
      <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Key className="w-4 h-4 text-blue-600" />
        {titre}
      </h2>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Nouveau mot de passe</span>
        <input
          type="password"
          autoComplete="new-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className={CHAMP}
          minLength={LONGUEUR_MIN}
          required
        />
      </label>
      <Message retour={retour} />
      <button type="submit" disabled={envoi} className={BOUTON}>
        {envoi ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
    </form>
  );
}

export default function ComptePage() {
  const { utilisateur, chargement, configure, recuperation, terminerRecuperation, deconnecter } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("connexion");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);

  function changerMode(m: Mode) {
    setMode(m);
    setRetour(null);
  }

  async function valider(e: FormEvent) {
    e.preventDefault();
    const adresse = email.trim().toLowerCase();
    if (!adresse) return;
    if (mode !== "oubli" && motDePasse.length < LONGUEUR_MIN) {
      setRetour({ type: "erreur", texte: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.` });
      return;
    }
    setEnvoi(true);
    setRetour(null);
    try {
      const auth = createClient().auth;
      const retourSite = `${window.location.origin}/compte`;
      if (mode === "connexion") {
        const { error } = await auth.signInWithPassword({ email: adresse, password: motDePasse });
        if (error) throw error;
        router.push("/projets");
      } else if (mode === "inscription") {
        const { data, error } = await auth.signUp({ email: adresse, password: motDePasse, options: { emailRedirectTo: retourSite } });
        if (error) throw error;
        // Supabase répond sans erreur pour une adresse déjà inscrite (pour ne pas révéler les comptes) : aucune identité créée
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setRetour({ type: "erreur", texte: "Un compte existe déjà avec cette adresse. Connectez-vous." });
        } else if (data.session) {
          router.push("/projets");
        } else {
          setRetour({ type: "ok", texte: `Compte créé. Ouvrez le lien de confirmation envoyé à ${adresse}, puis connectez-vous.` });
          setMode("connexion");
          setMotDePasse("");
        }
      } else {
        const { error } = await auth.resetPasswordForEmail(adresse, { redirectTo: retourSite });
        if (error) throw error;
        setRetour({ type: "ok", texte: `Si un compte existe pour ${adresse}, un lien de réinitialisation vient d'être envoyé.` });
      }
    } catch (err) {
      setRetour({ type: "erreur", texte: traduire(err instanceof Error ? err.message : "Une erreur est survenue.") });
    } finally {
      setEnvoi(false);
    }
  }

  const entete = (
    <div>
      <span className="text-xs font-bold uppercase tracking-wider text-blue-600">DATENZA</span>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">Mon compte</h1>
      <p className="text-slate-500 text-xs mt-1">
        Un compte permet d&apos;enregistrer vos projets en ligne, de les rouvrir sur un autre appareil et de les partager par lien.
      </p>
    </div>
  );

  if (!configure) {
    return (
      <div className="max-w-md mx-auto space-y-5 py-6">
        {entete}
        <Carte>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Les comptes ne sont pas encore activés sur cette installation. Vous pouvez continuer à utiliser DATENZA : vos fichiers restent dans ce navigateur.
          </p>
        </Carte>
      </div>
    );
  }

  if (chargement) {
    return <p className="max-w-md mx-auto py-16 text-center text-sm text-slate-500">Chargement de votre session…</p>;
  }

  if (utilisateur) {
    return (
      <div className="max-w-md mx-auto space-y-5 py-6">
        {entete}
        {recuperation ? (
          <Carte>
            <ChangerMotDePasse titre="Choisissez un nouveau mot de passe" apresSucces={terminerRecuperation} />
          </Carte>
        ) : (
          <>
            <Carte>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Connecté en tant que</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{utilisateur.email}</p>
                </div>
              </div>
              <Link href="/projets" className={BOUTON}>
                <FolderOpen className="w-4 h-4" />
                Mes projets
              </Link>
              <button
                type="button"
                onClick={() => void deconnecter()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Se déconnecter
              </button>
            </Carte>
            <Carte>
              <ChangerMotDePasse titre="Changer de mot de passe" />
            </Carte>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-5 py-6">
      {entete}
      <Carte>
        {mode !== "oubli" && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
            {(["connexion", "inscription"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => changerMode(m)}
                aria-pressed={mode === m}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  mode === m ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {m === "connexion" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={valider} className="space-y-3">
          {mode === "oubli" && (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Indiquez l&apos;adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Adresse e-mail</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={CHAMP} required />
          </label>
          {mode !== "oubli" && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Mot de passe{mode === "inscription" ? ` (${LONGUEUR_MIN} caractères au minimum)` : ""}
              </span>
              <input
                type="password"
                autoComplete={mode === "inscription" ? "new-password" : "current-password"}
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className={CHAMP}
                minLength={LONGUEUR_MIN}
                required
              />
            </label>
          )}
          <Message retour={retour} />
          <button type="submit" disabled={envoi} className={BOUTON}>
            {mode === "oubli" && <Mail className="w-4 h-4" />}
            {envoi
              ? "Un instant…"
              : mode === "connexion"
                ? "Se connecter"
                : mode === "inscription"
                  ? "Créer mon compte"
                  : "Recevoir le lien"}
          </button>
        </form>

        <div className="text-center">
          {mode === "oubli" ? (
            <button type="button" onClick={() => changerMode("connexion")} className="text-xs text-blue-600 hover:underline cursor-pointer">
              Retour à la connexion
            </button>
          ) : (
            <button type="button" onClick={() => changerMode("oubli")} className="text-xs text-blue-600 hover:underline cursor-pointer">
              Mot de passe oublié ?
            </button>
          )}
        </div>
      </Carte>

      <p className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          Sans compte, vos fichiers restent dans ce navigateur. Ils ne sont envoyés en ligne que lorsque vous enregistrez un projet, et vous seul y avez accès tant que vous ne le partagez pas.
        </span>
      </p>
    </div>
  );
}

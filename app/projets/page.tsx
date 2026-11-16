"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, FolderOpen, Link2, Link2Off, Pencil, RefreshCw, Save, Trash2, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import {
  chargerProjet,
  definirPartage,
  enregistrerProjet,
  listerProjets,
  renommerProjet,
  supprimerProjet,
  type ProjetResume,
} from "../../lib/projets/depot";
import { formaterTaille, nomParDefaut } from "../../lib/projets/format";

type Retour = { type: "ok" | "erreur"; texte: string } | null;

const CARTE = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm";
const BOUTON_PRINCIPAL =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:cursor-not-allowed";
const BOUTON_SECONDAIRE =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer disabled:cursor-not-allowed";
const CHAMP =
  "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

const dateLisible = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
};
const message = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue.");

export default function ProjetsPage() {
  const router = useRouter();
  const { utilisateur, chargement: sessionEnCours, configure } = useAuth();
  const { nomFichier, aDesDonnees, projetCourant, definirProjetCourant, obtenirEtat, ouvrirEtat, restaurationTerminee } = useData();

  const [projets, setProjets] = useState<ProjetResume[]>([]);
  const [listeChargee, setListeChargee] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);
  /** Action en cours : "enregistrement" ou l'identifiant du projet concerné. */
  const [occupe, setOccupe] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [aConfirmer, setAConfirmer] = useState<{ id: string; action: "supprimer" | "ouvrir" } | null>(null);
  const [renommage, setRenommage] = useState<{ id: string; nom: string } | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  const idUtilisateur = utilisateur?.id ?? null;

  const rafraichir = useCallback(async () => {
    try {
      setProjets(await listerProjets());
    } catch (e) {
      setRetour({ type: "erreur", texte: message(e) });
    } finally {
      setListeChargee(true);
    }
  }, []);

  useEffect(() => {
    if (!idUtilisateur) {
      setProjets([]);
      setListeChargee(false);
      return;
    }
    void rafraichir();
  }, [idUtilisateur, rafraichir]);

  // Nom proposé : celui du projet ouvert, sinon le nom du fichier
  useEffect(() => {
    setNom(projetCourant?.nom ?? (aDesDonnees ? nomParDefaut(nomFichier) : ""));
  }, [projetCourant, aDesDonnees, nomFichier]);

  async function enregistrer(commeNouveau: boolean) {
    if (occupe) return;
    setOccupe("enregistrement");
    setRetour(null);
    try {
      const cible = commeNouveau ? undefined : projetCourant?.id;
      const p = await enregistrerProjet(obtenirEtat(), nom, cible);
      definirProjetCourant({ id: p.id, nom: p.nom });
      setRetour({ type: "ok", texte: cible ? `« ${p.nom} » a été mis à jour.` : `« ${p.nom} » est enregistré dans votre compte.` });
      await rafraichir();
    } catch (e) {
      setRetour({ type: "erreur", texte: message(e) });
    } finally {
      setOccupe(null);
    }
  }

  async function ouvrir(p: ProjetResume) {
    if (occupe) return;
    // Un fichier importé mais jamais enregistré serait perdu : on demande confirmation
    if (aDesDonnees && !projetCourant && !(aConfirmer?.id === p.id && aConfirmer.action === "ouvrir")) {
      setAConfirmer({ id: p.id, action: "ouvrir" });
      return;
    }
    setAConfirmer(null);
    setOccupe(p.id);
    setRetour(null);
    try {
      const { projet, etat } = await chargerProjet(p.id);
      ouvrirEtat(etat, { id: projet.id, nom: projet.nom });
      router.push("/analyse");
    } catch (e) {
      setRetour({ type: "erreur", texte: message(e) });
      setOccupe(null);
    }
  }

  async function supprimer(p: ProjetResume) {
    if (occupe) return;
    if (!(aConfirmer?.id === p.id && aConfirmer.action === "supprimer")) {
      setAConfirmer({ id: p.id, action: "supprimer" });
      return;
    }
    setAConfirmer(null);
    setOccupe(p.id);
    setRetour(null);
    try {
      await supprimerProjet(p.id);
      if (projetCourant?.id === p.id) definirProjetCourant(null);
      setProjets((liste) => liste.filter((x) => x.id !== p.id));
      setRetour({ type: "ok", texte: `« ${p.nom} » a été supprimé de votre compte.` });
    } catch (e) {
      setRetour({ type: "erreur", texte: message(e) });
    } finally {
      setOccupe(null);
    }
  }

  async function validerRenommage() {
    if (!renommage || occupe) return;
    const { id, nom: nouveau } = renommage;
    setOccupe(id);
    setRetour(null);
    try {
      await renommerProjet(id, nouveau);
      const propre = nouveau.trim().slice(0, 120);
      setProjets((liste) => liste.map((x) => (x.id === id ? { ...x, nom: propre } : x)));
      if (projetCourant?.id === id) definirProjetCourant({ id, nom: propre });
      setRenommage(null);
    } catch (e) {
      setRetour({ type: "erreur", texte: message(e) });
    } finally {
      setOccupe(null);
    }
  }

  async function basculerPartage(p: ProjetResume) {
    if (occupe) return;
    setOccupe(p.id);
    setRetour(null);
    try {
      const partage_id = await definirPartage(p.id, !p.partage_id);
      setProjets((liste) => liste.map((x) => (x.id === p.id ? { ...x, partage_id } : x)));
    } catch (e) {
      setRetour({ type: "erreur", texte: message(e) });
    } finally {
      setOccupe(null);
    }
  }

  const lienPartage = (p: ProjetResume) => `${window.location.origin}/partage/${p.partage_id}`;

  async function copierLien(p: ProjetResume) {
    try {
      await navigator.clipboard.writeText(lienPartage(p));
      setCopie(p.id);
      setTimeout(() => setCopie((c) => (c === p.id ? null : c)), 2000);
    } catch {
      setRetour({ type: "erreur", texte: "Copie impossible : sélectionnez le lien et copiez-le à la main." });
    }
  }

  const entete = (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-blue-600">DATENZA</span>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">Mes projets</h1>
        <p className="text-slate-500 text-xs mt-1">Enregistrez un fichier avec ses filtres et ses graphiques, rouvrez-le plus tard, partagez-le par lien.</p>
      </div>
      {utilisateur && (
        <Link href="/compte" className={BOUTON_SECONDAIRE}>
          <User className="w-3.5 h-3.5" />
          <span className="truncate max-w-[14rem]">{utilisateur.email}</span>
        </Link>
      )}
    </div>
  );

  if (!configure || sessionEnCours || !utilisateur) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        {entete}
        <div className={`${CARTE} p-8 text-center space-y-4`}>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <FolderOpen className="w-7 h-7" />
          </div>
          {!configure ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Les comptes ne sont pas encore activés sur cette installation.</p>
          ) : sessionEnCours ? (
            <p className="text-sm text-slate-500">Chargement de votre session…</p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                Connectez-vous pour enregistrer vos projets en ligne et les retrouver sur tous vos appareils.
              </p>
              <Link href="/compte" className={BOUTON_PRINCIPAL}>
                Se connecter ou créer un compte
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      {entete}

      {retour && (
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
      )}

      {/* Fichier en cours */}
      <section className={`${CARTE} p-5 space-y-3`}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Fichier en cours</h2>
        {!restaurationTerminee ? (
          <p className="text-xs text-slate-500">Chargement…</p>
        ) : !aDesDonnees ? (
          <p className="text-xs text-slate-500">
            Aucun fichier n&apos;est chargé.{" "}
            <Link href="/" className="text-blue-600 hover:underline">
              Importez un fichier
            </Link>{" "}
            pour l&apos;enregistrer comme projet, ou ouvrez un projet ci-dessous.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {projetCourant ? (
                <>
                  Projet ouvert : <strong className="text-slate-800 dark:text-slate-200">{projetCourant.nom}</strong>. Vos changements ne sont envoyés dans votre compte que lorsque vous cliquez sur « Mettre à jour ».
                </>
              ) : (
                <>
                  « {nomFichier || "Fichier importé"} » n&apos;est pas encore enregistré dans votre compte. Le projet contiendra les données, les filtres, les colonnes calculées et les graphiques épinglés.
                </>
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <label className="flex-1">
                <span className="sr-only">Nom du projet</span>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  maxLength={120}
                  placeholder="Nom du projet"
                  className={`${CHAMP} w-full`}
                />
              </label>
              <button type="button" onClick={() => void enregistrer(false)} disabled={!!occupe || !nom.trim()} className={BOUTON_PRINCIPAL}>
                <Save className="w-4 h-4" />
                {occupe === "enregistrement" ? "Enregistrement…" : projetCourant ? "Mettre à jour" : "Enregistrer le projet"}
              </button>
              {projetCourant && (
                <button type="button" onClick={() => void enregistrer(true)} disabled={!!occupe || !nom.trim()} className={BOUTON_SECONDAIRE}>
                  Enregistrer une copie
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* Projets du compte */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Projets enregistrés{listeChargee ? ` (${projets.length})` : ""}
          </h2>
          <button type="button" onClick={() => void rafraichir()} className={BOUTON_SECONDAIRE} title="Actualiser la liste">
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </button>
        </div>

        {!listeChargee ? (
          <p className="text-xs text-slate-500">Chargement de vos projets…</p>
        ) : projets.length === 0 ? (
          <div className={`${CARTE} p-6 text-center text-xs text-slate-500`}>Aucun projet enregistré pour le moment.</div>
        ) : (
          <ul className="space-y-3">
            {projets.map((p) => {
              const enCours = occupe === p.id;
              const ouvert = projetCourant?.id === p.id;
              return (
                <li key={p.id} className={`${CARTE} p-4 space-y-3 ${ouvert ? "ring-2 ring-blue-500/40" : ""}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      {renommage?.id === p.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void validerRenommage();
                          }}
                          className="flex gap-2"
                        >
                          <input
                            autoFocus
                            value={renommage.nom}
                            onChange={(e) => setRenommage({ id: p.id, nom: e.target.value })}
                            maxLength={120}
                            aria-label="Nouveau nom du projet"
                            className={`${CHAMP} flex-1 min-w-0`}
                          />
                          <button type="submit" disabled={enCours || !renommage.nom.trim()} className={BOUTON_PRINCIPAL}>
                            OK
                          </button>
                          <button type="button" onClick={() => setRenommage(null)} className={BOUTON_SECONDAIRE}>
                            Annuler
                          </button>
                        </form>
                      ) : (
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                          <span className="truncate">{p.nom}</span>
                          {ouvert && (
                            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                              Ouvert
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-500 truncate">
                        {p.nom_fichier || "Fichier"} · {p.nb_lignes.toLocaleString("fr-FR")} lignes · {p.nb_colonnes} colonnes · {formaterTaille(p.taille_octets)}
                      </p>
                      <p className="text-[11px] text-slate-400">Modifié le {dateLisible(p.updated_at)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button type="button" onClick={() => void ouvrir(p)} disabled={!!occupe} className={BOUTON_PRINCIPAL}>
                        <FolderOpen className="w-3.5 h-3.5" />
                        {enCours ? "Un instant…" : aConfirmer?.id === p.id && aConfirmer.action === "ouvrir" ? "Confirmer l'ouverture" : "Ouvrir"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenommage({ id: p.id, nom: p.nom })}
                        disabled={!!occupe}
                        className={BOUTON_SECONDAIRE}
                        title="Renommer"
                        aria-label={`Renommer ${p.nom}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void supprimer(p)}
                        disabled={!!occupe}
                        className={`${BOUTON_SECONDAIRE} ${
                          aConfirmer?.id === p.id && aConfirmer.action === "supprimer" ? "!border-rose-400 !text-rose-600" : ""
                        }`}
                        aria-label={`Supprimer ${p.nom}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {aConfirmer?.id === p.id && aConfirmer.action === "supprimer" ? "Confirmer la suppression" : ""}
                      </button>
                    </div>
                  </div>

                  {aConfirmer?.id === p.id && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 flex flex-wrap items-center gap-2">
                      {aConfirmer.action === "ouvrir"
                        ? "Le fichier en cours n'est pas enregistré : il sera remplacé par ce projet."
                        : "Le projet et ses données seront supprimés définitivement, et son lien de partage cessera de fonctionner."}
                      <button type="button" onClick={() => setAConfirmer(null)} className="underline cursor-pointer">
                        Annuler
                      </button>
                    </p>
                  )}

                  {/* Partage par lien */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
                    {p.partage_id ? (
                      <>
                        <input
                          readOnly
                          value={lienPartage(p)}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label="Lien de partage"
                          className={`${CHAMP} flex-1 min-w-0 !text-xs !py-1.5 font-mono`}
                        />
                        <button type="button" onClick={() => void copierLien(p)} className={BOUTON_SECONDAIRE}>
                          {copie === p.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          {copie === p.id ? "Copié" : "Copier"}
                        </button>
                        <button type="button" onClick={() => void basculerPartage(p)} disabled={!!occupe} className={BOUTON_SECONDAIRE}>
                          <Link2Off className="w-3.5 h-3.5" />
                          Arrêter le partage
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="flex-1 text-[11px] text-slate-500">Non partagé : vous seul pouvez ouvrir ce projet.</p>
                        <button type="button" onClick={() => void basculerPartage(p)} disabled={!!occupe} className={BOUTON_SECONDAIRE}>
                          <Link2 className="w-3.5 h-3.5" />
                          Partager par lien
                        </button>
                      </>
                    )}
                  </div>
                  {p.partage_id && (
                    <p className="text-[11px] text-slate-500">
                      Toute personne disposant de ce lien voit le projet en lecture seule, sans compte, tel qu&apos;à sa dernière mise à jour.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

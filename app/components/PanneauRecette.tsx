"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { BookmarkPlus, ChevronDown, Download, FileUp, ListOrdered, Play, Trash2, Upload, X } from "lucide-react";
import { useData } from "../context/DataContext";
import { decrireCalcul, decrireFiltre, lireRecette, type RapportRecette, type Recette } from "../../lib/analyse/recette";
import { lireFichier, EXTENSIONS_ACCEPTEES } from "../../lib/import/lecture";
import { enregistrerRecette, listerRecettes, nomFichierRecette, supprimerRecette } from "../../lib/recettesLocales";

type Message = { genre: "succes" | "erreur" | "info"; texte: string; details?: string[] };

const bouton =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const boutonSecondaire = `${bouton} text-slate-700 border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800`;
const boutonPrincipal = `${bouton} text-white bg-blue-600 border-blue-600 hover:bg-blue-700`;

function telechargerJson(recette: Recette) {
  const blob = new Blob([JSON.stringify(recette, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichierRecette(recette);
  a.click();
  URL.revokeObjectURL(url);
}

function messageRapport(r: RapportRecette, contexte: string): Message {
  const rejouees = r.calculs.length + r.filtres.length;
  const details: string[] = [];
  for (const [a, b] of r.renommees) details.push(`Colonne « ${a} » reconnue sous le nom « ${b} ».`);
  for (const e of r.ignorees) details.push(`Ignorée : ${e.description} (${e.raison}).`);
  if (r.nouvelles.length) details.push(`Nouvelle(s) colonne(s) dans ce fichier : ${r.nouvelles.slice(0, 6).join(", ")}${r.nouvelles.length > 6 ? "…" : ""}.`);
  return {
    genre: r.ignorees.length ? "info" : "succes",
    texte: `${contexte} : ${rejouees} étape(s) sur ${r.nbEtapes} rejouée(s).`,
    details,
  };
}

export default function PanneauRecette() {
  const {
    nomFichier,
    definitionsCalculs,
    filtresActifs,
    choisies,
    colonnesSource,
    supprimerFiltre,
    supprimerColonneCalculee,
    recetteCourante,
    appliquerRecette,
    rejouerSurFichier,
    lectureSeule,
  } = useData();

  const [recettes, setRecettes] = useState<Recette[]>(() => (typeof window === "undefined" ? [] : listerRecettes()));
  const [message, setMessage] = useState<Message | null>(null);
  const [nomRecette, setNomRecette] = useState("");
  const [saisieNom, setSaisieNom] = useState(false);
  const [chargement, setChargement] = useState(false);
  // Recette à rejouer sur le prochain fichier choisi (null : les étapes actuelles)
  const recetteARejouer = useRef<Recette | null>(null);
  const entreeFichier = useRef<HTMLInputElement>(null);
  const entreeRecette = useRef<HTMLInputElement>(null);

  const nbEtapes = definitionsCalculs.length + filtresActifs.length;
  const toutesColonnes = [...colonnesSource, ...definitionsCalculs.map((c) => c.nomNouvelleColonne)];
  const nbChoisies = toutesColonnes.filter((c) => choisies.includes(c)).length;
  const selectionRestreinte = nbChoisies < toutesColonnes.length;

  const choisirFichier = (recette: Recette | null) => {
    recetteARejouer.current = recette;
    entreeFichier.current?.click();
  };

  const surFichier = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setChargement(true);
    setMessage(null);
    try {
      const tableau = await lireFichier(f);
      const r = rejouerSurFichier(f.name, tableau.entetes, tableau.corps, recetteARejouer.current ?? undefined);
      const m = messageRapport(r, `« ${f.name} » chargé`);
      if (tableau.avertissements.length) m.details = [...(m.details ?? []), ...tableau.avertissements];
      m.details = [...(m.details ?? []), "L'analyse a été recalculée sur le nouveau fichier ; les graphiques épinglés de l'ancien fichier ont été retirés."];
      setMessage(m);
    } catch (err) {
      setMessage({ genre: "erreur", texte: err instanceof Error ? err.message : "Lecture du fichier impossible." });
    } finally {
      setChargement(false);
    }
  };

  const surRecetteImportee = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (f.size > 1_000_000) throw new Error("Fichier trop volumineux pour une recette.");
      const recette = lireRecette(await f.text());
      if (!enregistrerRecette(recette)) throw new Error("Stockage du navigateur indisponible : la recette n'a pas pu être enregistrée.");
      setRecettes(listerRecettes());
      setMessage({ genre: "succes", texte: `Recette « ${recette.nom} » importée (${recette.calculs.length + recette.filtres.length} étape(s)). Appliquez-la aux données actuelles ou rejouez-la sur un fichier.` });
    } catch (err) {
      setMessage({ genre: "erreur", texte: err instanceof SyntaxError ? "Ce fichier n'est pas un JSON valide." : err instanceof Error ? err.message : "Import impossible." });
    }
  };

  const enregistrer = () => {
    const nom = nomRecette.trim() || nomFichier.replace(/\.[^.]+$/, "") || "Ma recette";
    const recette = recetteCourante(nom);
    if (!enregistrerRecette(recette)) {
      setMessage({ genre: "erreur", texte: "Stockage du navigateur indisponible : exportez la recette en fichier à la place." });
      return;
    }
    setRecettes(listerRecettes());
    setSaisieNom(false);
    setNomRecette("");
    setMessage({ genre: "succes", texte: `Recette « ${recette.nom} » enregistrée sur cet appareil. Le mois prochain : importez le nouveau fichier, puis appliquez-la.` });
  };

  const retirerCalcul = (i: number) => {
    const ricochets = supprimerColonneCalculee(i);
    setMessage(ricochets.length ? { genre: "info", texte: "Colonne calculée retirée, ainsi que les étapes qui l'utilisaient :", details: ricochets } : null);
  };

  return (
    <details className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mb-6 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <ListOrdered className="w-4 h-4 text-blue-600" />
          Étapes de préparation
          <span className="text-[11px] font-medium text-slate-400">
            {nbEtapes ? `${nbEtapes} étape(s)` : "aucune étape"}
            {recettes.length ? ` · ${recettes.length} recette(s) enregistrée(s)` : ""}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 space-y-4">
        <p className="text-[11px] sm:text-xs text-slate-500">
          Les filtres et colonnes calculées forment une recette : enregistrez-la, puis rejouez-la à l&apos;identique sur le fichier du mois
          suivant. Les colonnes dont l&apos;écriture change un peu (majuscules, accents, espaces) sont reconnues.
        </p>

        {/* Étapes actuelles */}
        {nbEtapes === 0 ? (
          <p className="text-xs text-slate-400 italic">Aucune étape pour l&apos;instant : ajoutez un filtre ou une colonne calculée avec la barre ci-dessus.</p>
        ) : (
          <ol className="space-y-1.5">
            {definitionsCalculs.map((c, i) => (
              <li key={`c${i}`} className="flex items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="min-w-0 break-words text-slate-700 dark:text-slate-200">
                  <span className="font-mono text-slate-400 mr-2">{i + 1}.</span>
                  {decrireCalcul(c)}
                </span>
                {!lectureSeule && (
                  <button type="button" onClick={() => retirerCalcul(i)} className="shrink-0 text-slate-400 hover:text-rose-600 cursor-pointer" aria-label={`Retirer ${decrireCalcul(c)}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
            {filtresActifs.map((f, i) => (
              <li key={`f${i}`} className="flex items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="min-w-0 break-words text-slate-700 dark:text-slate-200">
                  <span className="font-mono text-slate-400 mr-2">{definitionsCalculs.length + i + 1}.</span>
                  {decrireFiltre(f)}
                </span>
                {!lectureSeule && (
                  <button type="button" onClick={() => supprimerFiltre(i)} className="shrink-0 text-slate-400 hover:text-rose-600 cursor-pointer" aria-label={`Retirer ${decrireFiltre(f)}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        {selectionRestreinte && (
          <p className="text-[11px] text-slate-500">
            Colonnes analysées : {nbChoisies} sur {toutesColonnes.length} (ce choix fait aussi partie de la recette).
          </p>
        )}

        {!lectureSeule && (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={boutonPrincipal} disabled={chargement || nbEtapes === 0} onClick={() => choisirFichier(null)}>
                <Play className="w-3.5 h-3.5" />
                {chargement ? "Lecture…" : "Rejouer sur un autre fichier"}
              </button>
              <button type="button" className={boutonSecondaire} disabled={nbEtapes === 0 && !selectionRestreinte} onClick={() => setSaisieNom((v) => !v)}>
                <BookmarkPlus className="w-3.5 h-3.5" />
                Enregistrer la recette
              </button>
              <button type="button" className={boutonSecondaire} disabled={nbEtapes === 0 && !selectionRestreinte} onClick={() => telechargerJson(recetteCourante(nomFichier.replace(/\.[^.]+$/, "") || "Ma recette"))}>
                <Download className="w-3.5 h-3.5" />
                Exporter (.json)
              </button>
              <button type="button" className={boutonSecondaire} onClick={() => entreeRecette.current?.click()}>
                <Upload className="w-3.5 h-3.5" />
                Importer une recette
              </button>
            </div>

            {saisieNom && (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  enregistrer();
                }}
              >
                <label htmlFor="nom-recette" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Nom</label>
                <input
                  id="nom-recette"
                  value={nomRecette}
                  maxLength={120}
                  onChange={(e) => setNomRecette(e.target.value)}
                  placeholder={nomFichier.replace(/\.[^.]+$/, "") || "Ventes mensuelles"}
                  className="flex-1 min-w-[10rem] text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-lg px-3 py-1.5"
                  autoFocus
                />
                <button type="submit" className={boutonPrincipal}>Enregistrer</button>
              </form>
            )}
          </>
        )}

        {message && (
          <div
            role="status"
            className={`text-xs rounded-lg px-3 py-2 border ${
              message.genre === "erreur"
                ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300"
                : message.genre === "info"
                ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300"
                : "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300"
            }`}
          >
            <p className="font-semibold">{message.texte}</p>
            {message.details && message.details.length > 0 && (
              <ul className="mt-1 space-y-0.5 list-disc pl-4">
                {message.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Recettes enregistrées */}
        {!lectureSeule && recettes.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Recettes enregistrées sur cet appareil</h3>
            <ul className="space-y-2">
              {recettes.map((r) => (
                <li key={r.nom} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 break-words">{r.nom}</p>
                    <p className="text-[11px] text-slate-500">
                      {r.calculs.length + r.filtres.length} étape(s) · créée le {new Date(r.creeLe).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={boutonSecondaire} onClick={() => setMessage(messageRapport(appliquerRecette(r), `Recette « ${r.nom} » appliquée`))}>
                      <Play className="w-3.5 h-3.5" />
                      Appliquer
                    </button>
                    <button type="button" className={boutonSecondaire} disabled={chargement} onClick={() => choisirFichier(r)}>
                      <FileUp className="w-3.5 h-3.5" />
                      Sur un fichier
                    </button>
                    <button type="button" className={boutonSecondaire} onClick={() => telechargerJson(r)} aria-label={`Exporter la recette ${r.nom}`}>
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className={`${bouton} text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40`}
                      onClick={() => {
                        if (!window.confirm(`Supprimer la recette « ${r.nom} » ?`)) return;
                        supprimerRecette(r.nom);
                        setRecettes(listerRecettes());
                      }}
                      aria-label={`Supprimer la recette ${r.nom}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <input ref={entreeFichier} type="file" accept={EXTENSIONS_ACCEPTEES} className="hidden" onChange={surFichier} />
        <input ref={entreeRecette} type="file" accept=".json,application/json" className="hidden" onChange={surRecetteImportee} />
      </div>
    </details>
  );
}

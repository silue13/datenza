"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { estVersionPerimee, messageErreur, rechargerPourNouvelleVersion } from "../../lib/erreurs";

interface Props {
  erreur: unknown;
  retry: () => void;
  /** « page » : pleine page ; « section » : encadré compact dans l'analyse. */
  format: "page" | "section";
  titre?: string;
}

/**
 * Ce qu'on montre quand un affichage plante : une version périmée est rechargée d'elle-même,
 * un vrai problème est expliqué avec son détail technique (à transmettre pour correction).
 */
export default function AffichageErreur({ erreur, retry, format, titre }: Props) {
  const perimee = estVersionPerimee(erreur);
  useEffect(() => {
    console.error(erreur);
    if (perimee) rechargerPourNouvelleVersion();
  }, [erreur, perimee]);

  const detail = messageErreur(erreur);
  const titreAffiche = perimee
    ? "Une nouvelle version de DATENZA est disponible"
    : titre ?? (format === "page" ? "Cette page n'a pas pu s'afficher" : "Cette section n'a pas pu s'afficher");
  const explication = perimee
    ? "Rechargement automatique en cours ; si rien ne se passe, cliquez sur « Recharger ». Vos données importées sont conservées."
    : format === "page"
    ? "Vos données importées sont conservées. Réessayez ; si le problème revient, transmettez le détail ci-dessous."
    : "Le reste de l'analyse reste utilisable. Réessayez ; si le problème revient, transmettez le détail ci-dessous.";

  return (
    <div
      role="alert"
      className={
        format === "page"
          ? "max-w-xl mx-auto py-16 space-y-4"
          : "rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3 my-4"
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`shrink-0 text-amber-500 ${format === "page" ? "w-8 h-8" : "w-5 h-5"}`} />
        <div className="space-y-1">
          <h2 className={`font-bold text-slate-900 dark:text-white ${format === "page" ? "text-xl" : "text-sm"}`}>{titreAffiche}</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{explication}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => (perimee ? window.location.reload() : retry())}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {perimee ? "Recharger" : "Réessayer"}
        </button>
        {format === "page" && !perimee && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            Recharger la page
          </button>
        )}
      </div>
      {!perimee && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer">Détail technique</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono bg-white/60 dark:bg-slate-900/60 rounded p-2">{detail}</pre>
        </details>
      )}
    </div>
  );
}

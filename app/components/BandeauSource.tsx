"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Radio, RefreshCw } from "lucide-react";
import { useData } from "../context/DataContext";
import { formaterAnciennete, libelleSource, INTERVALLES_ACTUALISATION } from "../../lib/import/source";

const LIBELLES_INTERVALLE: Record<number, string> = {
  0: "À la demande",
  5: "Toutes les 5 min",
  15: "Toutes les 15 min",
  60: "Toutes les heures",
};

/** Bandeau du fichier actif quand il vient d'une source en direct : dernière mise à jour, actualisation manuelle ou automatique. */
export default function BandeauSource() {
  const { source, actualisation, actualiserSource, definirIntervalleSource, lectureSeule } = useData();
  // L'ancienneté affichée (« il y a 3 min ») avance toute seule
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!source) return;
    const minuteur = setInterval(() => setTic((t) => t + 1), 30_000);
    return () => clearInterval(minuteur);
  }, [source]);

  if (!source || lectureSeule) return null;

  let hote = source.adresse;
  try {
    hote = new URL(source.urlTelechargement).hostname;
  } catch {
    // adresse illisible : on affiche la saisie d'origine
  }

  return (
    <div className="print:hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 px-3.5 py-3 sm:px-4 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={source.adresse}>
              Source en direct · {libelleSource(source)} <span className="font-medium text-slate-500 dark:text-slate-400">({hote})</span>
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400" aria-live="polite">
              {actualisation.enCours ? "Actualisation en cours…" : `Données mises à jour ${formaterAnciennete(source.derniereMaj)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={source.intervalleMinutes}
            onChange={(e) => definirIntervalleSource(Number(e.target.value))}
            aria-label="Actualisation automatique"
            title="Actualisation automatique, tant que DATENZA reste ouvert"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {INTERVALLES_ACTUALISATION.map((m) => (
              <option key={m} value={m}>
                {LIBELLES_INTERVALLE[m]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void actualiserSource()}
            disabled={actualisation.enCours}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-60 cursor-pointer disabled:cursor-wait"
          >
            {actualisation.enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Actualiser
          </button>
        </div>
      </div>

      {actualisation.erreur ? (
        <p role="alert" className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Actualisation impossible : {actualisation.erreur} Les données affichées sont celles de la dernière mise à jour réussie.</span>
        </p>
      ) : (
        actualisation.message && <p className="text-[11px] text-slate-600 dark:text-slate-400">Dernière actualisation : {actualisation.message}</p>
      )}
    </div>
  );
}

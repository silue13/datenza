"use client";
// app/components/BlocInterpretation.tsx — présentation commune des interprétations :
// comment lire, constats chiffrés, « en clair » et pistes à creuser.

import type { ReactNode } from "react";
import { BookOpen, Lightbulb, Search } from "lucide-react";

export type LigneConstat = { titre: string; texte: string };

type Props = {
  /** Comment lire ce type de graphique ou d'analyse (repliable). */
  guide?: string | null;
  constats?: LigneConstat[];
  resume?: string | null;
  pistes?: string[];
  /** Libellé du guide repliable. */
  titreGuide?: string;
  /** Contenu ajouté à la fin (lecture rédigée par l'IA, par exemple). */
  children?: ReactNode;
};

export default function BlocInterpretation({ guide, constats = [], resume, pistes = [], titreGuide = "Comment lire ce graphique ?", children }: Props) {
  return (
    <div className="space-y-2.5 text-[11px] leading-relaxed">
      {resume && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 px-3 py-2">
          <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-[12px] text-slate-800 dark:text-slate-100">
            <strong>En clair :</strong> {resume}
          </p>
        </div>
      )}

      {constats.length > 0 && (
        <div className="space-y-1">
          {constats.map((l, i) => (
            <div key={`${l.titre}-${i}`} className="flex items-start gap-1.5">
              <span className="font-bold text-blue-600">•</span>
              <p className="text-slate-700 dark:text-slate-300">
                <strong>{l.titre} :</strong> {l.texte}
              </p>
            </div>
          ))}
        </div>
      )}

      {pistes.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 space-y-1">
          <p className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
            <Search className="w-3.5 h-3.5" /> Pistes à creuser
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-slate-700 dark:text-slate-300">
            {pistes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {guide && (
        <details className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
            <BookOpen className="w-3.5 h-3.5 text-slate-500" />
            {titreGuide}
            <span className="ml-auto text-[10px] font-normal text-slate-400 group-open:hidden">afficher</span>
          </summary>
          <p className="mt-1.5 text-slate-600 dark:text-slate-400">{guide}</p>
        </details>
      )}

      {children}
    </div>
  );
}

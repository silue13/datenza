"use client";
// app/components/CorrespondanceColonnes.tsx — tableau de correspondance des colonnes entre un fichier de référence et les autres.

import { Link2 } from "lucide-react";
import type { FichierEntree } from "../../lib/analyse/fusion";

type Props = {
  reference: FichierEntree;
  /** Colonnes de la référence à ne pas proposer (sa colonne clé, par exemple). */
  exclusRef: string[];
  autres: { index: number; fichier: FichierEntree; exclus: string[] }[];
  /** Pour chaque fichier (par index) : colonne de référence -> colonne retenue dans ce fichier (null = aucune). */
  correspondances: Record<number, Record<string, string | null>>;
  onChange: (indexFichier: number, colonneRef: string, colonne: string | null) => void;
};

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export default function CorrespondanceColonnes({ reference, exclusRef, autres, correspondances, onChange }: Props) {
  const colonnesRef = reference.entetes.filter((c) => c !== "Fichier Source" && !exclusRef.includes(c));
  let nbRapprochees = 0;
  let nbRenommees = 0;
  for (const a of autres) {
    for (const c of colonnesRef) {
      const v = correspondances[a.index]?.[c];
      if (!v) continue;
      nbRapprochees++;
      if (normal(v) !== normal(c)) nbRenommees++;
    }
  }

  return (
    <details className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs">
      <summary className="flex cursor-pointer list-none items-start gap-2.5 [&::-webkit-details-marker]:hidden">
        <Link2 className="w-4 h-4 mt-0.5 text-purple-600 shrink-0" />
        <span className="flex-1">
          <span className="font-bold text-slate-800 dark:text-slate-100 block">Correspondance des colonnes</span>
          <span className="text-[11px] text-slate-500">
            {nbRapprochees} colonne(s) rapprochée(s) automatiquement
            {nbRenommees ? `, dont ${nbRenommees} sous un nom différent (ex. « CA » = « Chiffre d'affaires »)` : ""}. Vérifiez ou complétez si des colonnes identiques portent des noms
            différents.
          </span>
        </span>
        <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 group-open:hidden whitespace-nowrap">Vérifier</span>
      </summary>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="py-1.5 pr-3 font-semibold whitespace-nowrap">{reference.nom} (référence)</th>
              {autres.map((a) => (
                <th key={a.index} className="py-1.5 pr-3 font-semibold whitespace-nowrap">
                  {a.fichier.nom}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colonnesRef.map((c) => (
              <tr key={c} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className="py-1.5 pr-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{c}</td>
                {autres.map((a) => {
                  const v = correspondances[a.index]?.[c] ?? null;
                  const renommee = !!v && normal(v) !== normal(c);
                  // Une colonne déjà rattachée à une autre colonne de référence n'est plus proposée
                  const prises = new Set(
                    Object.entries(correspondances[a.index] ?? {})
                      .filter(([cr, col]) => cr !== c && col)
                      .map(([, col]) => col as string)
                  );
                  return (
                    <td key={a.index} className="py-1 pr-3">
                      <select
                        value={v ?? ""}
                        onChange={(e) => onChange(a.index, c, e.target.value || null)}
                        aria-label={`Colonne de ${a.fichier.nom} correspondant à ${c}`}
                        className={`!min-w-0 w-full max-w-[14rem] rounded-lg border !p-1 !text-[11px] ${
                          renommee
                            ? "!border-purple-300 !bg-purple-50 !text-purple-800 dark:!border-purple-800 dark:!bg-purple-950/40 dark:!text-purple-200 font-bold"
                            : v
                            ? "border-slate-200 dark:border-slate-700"
                            : "border-dashed border-slate-300 dark:border-slate-700 text-slate-400"
                        }`}
                      >
                        <option value="">— aucune —</option>
                        {a.fichier.entetes
                          .filter((h) => h !== "Fichier Source" && !a.exclus.includes(h) && !prises.has(h))
                          .map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-slate-500">
          Les colonnes rapprochées prennent le nom de la colonne de référence pendant l&apos;opération (sur fond violet : nom différent). Les colonnes clés sont
          réglées à part.
        </p>
      </div>
    </details>
  );
}

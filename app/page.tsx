"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useData } from "./context/DataContext";
import { analyserColonnes } from "../lib/analyse/analyse";
import { genererRapport } from "../lib/analyse/rapport";
import type { Cellule } from "../lib/analyse/utils";
import { useRouter } from "next/navigation";

/** En-têtes sûrs : jamais vides, jamais en double (sinon indexOf renvoie toujours la 1re colonne). */
function nettoyerEntetes(brut: Cellule[]): string[] {
  const vus = new Map<string, number>();
  return brut.map((c, i) => {
    const base = String(c ?? "").trim() || `Colonne ${i + 1}`;
    const n = (vus.get(base) ?? 0) + 1;
    vus.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export default function HomePage() {
  const { nomFichier, entetes, corps, choisies, chargerDonnees, setChoisies, setRapport, setResultat } = useData();
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [erreurImport, setErreurImport] = useState<string>("");
  const router = useRouter();

  const lignesParPage = 8;

  async function lireFichier(f: File) {
    setErreurImport("");
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const feuille = wb.Sheets[wb.SheetNames[0]];
      if (!feuille) throw new Error("Le fichier ne contient aucune feuille.");
      const lignes = XLSX.utils.sheet_to_json<Cellule[]>(feuille, {
        header: 1,
        raw: false,
        defval: "",
      });
      const [tete, ...reste] = lignes;
      if (!tete || tete.length === 0) throw new Error("Fichier vide : aucune colonne détectée.");
      chargerDonnees(f.name, nettoyerEntetes(tete), reste);
      setPageIndex(0);
    } catch (e) {
      setErreurImport(e instanceof Error ? e.message : "Fichier illisible.");
    }
  }

  function basculer(nom: string) {
    setChoisies((c) => (c.includes(nom) ? c.filter((x) => x !== nom) : [...c, nom]));
  }

  function toutCocher() {
    setChoisies(entetes);
  }

  function toutDecocher() {
    setChoisies([]);
  }

  function lancerAnalyse() {
    if (choisies.length === 0) return;
    const res = analyserColonnes(entetes, corps, choisies);
    setResultat(res);
    setRapport(genererRapport(res));
    router.push("/analyse");
  }

  const corpsPagine = corps.slice(pageIndex * lignesParPage, (pageIndex + 1) * lignesParPage);
  const totalPages = Math.max(1, Math.ceil(corps.length / lignesParPage));

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 font-sans">
      {/* Titre & Description */}
      <div>
        <h1 className="text-3xl font-extrabold text-purple-700 dark:text-purple-400 tracking-tight">DATENZA</h1>
        <p className="text-slate-500 text-sm mt-1">
          Importez votre fichier Excel ou CSV pour analyser automatiquement vos données.
        </p>
      </div>

      {/* Zone de Glisser-Déposer (Drag & Drop) */}
      <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-purple-200 dark:border-purple-900/50 rounded-2xl p-8 text-center hover:border-purple-400 transition cursor-pointer relative shadow-sm">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void lireFichier(f);
            e.target.value = ""; // permet de réimporter le même fichier
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="space-y-2">
          <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center mx-auto text-xl font-bold">
            ↑
          </div>
          <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Glissez un fichier ici ou cliquez pour parcourir
          </p>
          <p className="text-xs text-slate-400">Formats acceptés : .xlsx, .xls, .csv</p>
        </div>
      </div>

      {erreurImport && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
          ✗ {erreurImport}
        </div>
      )}

      {/* Fichier Chargé */}
      {nomFichier && (
        <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-600 font-bold">✓</span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{nomFichier}</span>
            <span className="text-xs text-slate-500">— {corps.length} ligne(s) importée(s)</span>
          </div>
        </div>
      )}

      {/* PRÉPARATION DE L'ANALYSE (Avec conteneur déroulant/scrollable) */}
      {entetes.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">PRÉPARATION DE L&apos;ANALYSE</span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">Choisissez les colonnes à analyser</h2>
              <p className="text-xs text-slate-500">{choisies.length} colonne(s) sélectionnée(s)</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toutCocher}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 transition"
              >
                Tout cocher
              </button>
              <button
                onClick={toutDecocher}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 transition"
              >
                Tout décocher
              </button>
            </div>
          </div>

          {/* Zone déroulante avec barre de défilement fluide et élégante */}
          <div className="max-h-64 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-900">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-1">
              {entetes.map((nom) => (
                <label
                  key={nom}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-sm font-medium cursor-pointer transition ${
                    choisies.includes(nom)
                      ? "border-purple-500 bg-purple-50/40 dark:bg-purple-950/30 text-purple-900 dark:text-purple-300 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={choisies.includes(nom)}
                    onChange={() => basculer(nom)}
                    className="accent-purple-600 h-4 w-4 rounded"
                  />
                  <span className="truncate font-semibold">{nom}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Bouton d'action principal */}
          <button
            onClick={lancerAnalyse}
            disabled={choisies.length === 0}
            className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-xl shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Lancer l&rsquo;analyse
          </button>
        </div>
      )}

      {/* Aperçu des Données Paginées */}
      {corps.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm overflow-hidden">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Aperçu des données</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {entetes.map((h) => (
                    <th key={h} className="p-3 font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {corpsPagine.map((ligne, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    {ligne.map((c, i) => (
                      <td key={i} className="p-3 truncate text-slate-600 dark:text-slate-400">
                        {String(c ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <button
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              ‹ Précédent
            </button>
            <span className="text-slate-500">
              Page {pageIndex + 1} sur {totalPages} ({corps.length} lignes)
            </span>
            <button
              disabled={pageIndex >= totalPages - 1}
              onClick={() => setPageIndex((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              Suivant ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
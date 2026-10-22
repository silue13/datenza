"use client";
import { useMemo, useState } from "react";
import { calculerTdcAvecLimite, valeurTdcInvalide, type Agregation, type ResultatTdc } from "../../lib/analyse/tdc";
import type { Cellule } from "../../lib/analyse/utils";
import TableTdc, { LIBELLES_AGG } from "./TableTdc";

interface TCDProps {
  entetes: string[];
  corps: Cellule[][];
}

function ListeCoches({
  titre,
  aide,
  options,
  choix,
  onChange,
}: {
  titre: string;
  aide: string;
  options: string[];
  choix: string[];
  onChange: (v: string[]) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const visibles = options.filter((o) => o.toLowerCase().includes(recherche.trim().toLowerCase()));
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
      <div>
        <p className="font-bold text-slate-700 dark:text-slate-300">{titre}</p>
        <p className="text-[10px] text-slate-400">{aide}</p>
      </div>
      <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher…"
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
      />
      <div className="max-h-36 overflow-y-auto space-y-0.5">
        {visibles.map((o) => (
          <label key={o} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={choix.includes(o)}
              onChange={() => onChange(choix.includes(o) ? choix.filter((x) => x !== o) : [...choix, o])}
              className="accent-purple-600"
            />
            <span className="truncate">{o}</span>
          </label>
        ))}
        {visibles.length === 0 && <p className="text-slate-400 px-1">Aucun champ</p>}
      </div>
    </div>
  );
}

export default function TableauCroiseDynamique({ entetes, corps }: TCDProps) {
  const [lignes, setLignes] = useState<string[]>([]);
  const [colonnes, setColonnes] = useState<string[]>([]);
  const [valeurs, setValeurs] = useState<string[]>([]);
  const [agregation, setAgregation] = useState<Agregation>("nombre");
  const [resultat, setResultat] = useState<{ donnees: ResultatTdc; tronque: boolean; agg: Agregation; lignes: string[]; colonnes: string[]; nbValeurs: number } | null>(null);
  const [erreur, setErreur] = useState("");

  // Seules les colonnes qui contiennent au moins une valeur valide sont proposées.
  const exploitables = useMemo(
    () => entetes.filter((nom, i) => corps.some((l) => !valeurTdcInvalide(l[i]))),
    [entetes, corps]
  );

  function generer() {
    setErreur("");
    if (lignes.length === 0) return setErreur("Choisis au moins une colonne pour les lignes.");
    if (lignes.some((c) => colonnes.includes(c))) return setErreur("Une colonne ne peut pas être à la fois dans Lignes et Colonnes.");
    if (agregation !== "nombre" && valeurs.length === 0) return setErreur("Choisis au moins une colonne de valeurs pour cette agrégation.");
    try {
      const r = calculerTdcAvecLimite({ entetes, corps }, lignes, colonnes, valeurs, agregation);
      setResultat({ ...r, agg: agregation, lignes: [...lignes], colonnes: [...colonnes], nbValeurs: valeurs.length });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur de calcul.");
    }
  }

  const d = resultat?.donnees;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Tableau croisé dynamique</h3>
      </div>

      <p className="text-xs text-slate-500">
        Coche une ou plusieurs colonnes par axe. Les cellules vides et N/A sont exclues du croisement.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <ListeCoches titre="1. Lignes" aide="Obligatoire" options={exploitables} choix={lignes} onChange={setLignes} />
        <ListeCoches titre="2. Colonnes" aide="Optionnel" options={exploitables} choix={colonnes} onChange={setColonnes} />
        <ListeCoches titre="3. Valeurs" aide="Vide = compter les lignes" options={exploitables} choix={valeurs} onChange={setValeurs} />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="text-xs">
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">4. Agrégation</label>
          <select
            value={agregation}
            onChange={(e) => setAgregation(e.target.value as Agregation)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-medium"
          >
            {(Object.keys(LIBELLES_AGG) as Agregation[]).map((a) => (
              <option key={a} value={a}>{LIBELLES_AGG[a]}</option>
            ))}
          </select>
        </div>
        <button
          onClick={generer}
          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow transition"
        >
          Générer le tableau
        </button>
        {erreur && <span className="text-xs text-rose-600">{erreur}</span>}
      </div>

      {d && resultat && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-semibold text-purple-700 dark:text-purple-300">
            <span>
              {resultat.lignes.join(" / ")}
              {resultat.colonnes.length > 0 && ` × ${resultat.colonnes.join(" / ")}`}
            </span>
            <span>{d.lignes.length} ligne(s) × {d.colonnes.length} colonne(s)</span>
          </div>
          {resultat.tronque && (
            <p className="text-[11px] text-slate-500">Résultat limité aux valeurs les plus représentées pour rester lisible.</p>
          )}

          <TableTdc donnees={d} agregation={resultat.agg} titreLignes={resultat.lignes.join(" / ")} plusieursValeurs={resultat.nbValeurs > 1} />
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { useData } from "@/app/context/DataContext";
import { versNombre } from "@/lib/analyse/utils";
import type { ConditionFiltre } from "@/lib/analyse/filtres";

export default function BarreOutilsDonnees() {
  const {
    entetes,
    corps,
    filtresActifs,
    ajouterFiltre,
    supprimerFiltre,
    reinitialiserFiltres,
    creerColonneCalculee,
  } = useData();

  const [panneauActif, setPanneauActif] = useState<"aucun" | "filtres" | "calculs">("aucun");

  // Détection automatique du profil de chaque colonne (numérique ou texte)
  const profilColonnes = useMemo(() => {
    if (!entetes.length || !corps.length) return {};
    const map: Record<string, { estNumerique: boolean; valeursUniques: string[] }> = {};

    entetes.forEach((nom, colIdx) => {
      const vals = corps
        .map((ligne) => ligne[colIdx])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "");

      const nbNumeriques = vals.filter((v) => versNombre(v) !== null).length;
      const estNumerique = vals.length > 0 && nbNumeriques / vals.length >= 0.7;

      const uniques = Array.from(new Set(vals.map((v) => String(v).trim()))).slice(0, 30);
      map[nom] = { estNumerique, valeursUniques: uniques };
    });

    return map;
  }, [entetes, corps]);

  const colonnesNumeriques = useMemo(() => {
    return entetes.filter((nom) => profilColonnes[nom]?.estNumerique);
  }, [entetes, profilColonnes]);

  // État du formulaire Filtre
  const [colonneFiltre, setColonneFiltre] = useState<string>(entetes[0] || "");
  const estColFiltreNum = profilColonnes[colonneFiltre]?.estNumerique ?? false;
  const [operateurFiltre, setOperateurFiltre] = useState<ConditionFiltre["operateur"]>("egal");
  const [valeurFiltre, setValeurFiltre] = useState<string>("");

  // État du formulaire Colonne Calculée (uniquement colonnes numériques)
  const [nomCalcul, setNomCalcul] = useState<string>("");
  const [colA, setColA] = useState<string>(colonnesNumeriques[0] || entetes[0] || "");
  const [colB, setColB] = useState<string>(colonnesNumeriques[1] || colonnesNumeriques[0] || entetes[0] || "");
  const [operateurCalcul, setOperateurCalcul] = useState<"+" | "-" | "*" | "/" | "ratio">("/");

  if (!entetes.length) return null;

  const handleChangementColonneFiltre = (nom: string) => {
    setColonneFiltre(nom);
    const estNum = profilColonnes[nom]?.estNumerique;
    setOperateurFiltre(estNum ? "superieur" : "egal");
    setValeurFiltre("");
  };

  const handleAjouterFiltre = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valeurFiltre.trim()) return;

    ajouterFiltre({
      colonne: colonneFiltre || entetes[0],
      operateur: operateurFiltre,
      valeur: valeurFiltre.trim(),
    });
    setValeurFiltre("");
  };

  const handleCreerCalcul = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomCalcul.trim() || !colA || !colB) return;

    creerColonneCalculee({
      nomNouvelleColonne: nomCalcul.trim(),
      type: "operation",
      colonneA: colA,
      colonneB: colB,
      operateur: operateurCalcul,
    });
    setNomCalcul("");
    setPanneauActif("aucun");
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanneauActif(panneauActif === "filtres" ? "aucun" : "filtres")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              panneauActif === "filtres"
                ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
                : "text-slate-700 border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-700"
            }`}
          >
            🔍 Filtrer les données {filtresActifs.length > 0 && `(${filtresActifs.length})`}
          </button>

          <button
            onClick={() => setPanneauActif(panneauActif === "calculs" ? "aucun" : "calculs")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              panneauActif === "calculs"
                ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
                : "text-slate-700 border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-700"
            }`}
          >
            ➕ Créer une colonne calculée
          </button>
        </div>

        <span className="text-xs font-medium text-slate-500">
          {corps.length} ligne(s) affichée(s)
        </span>
      </div>

      {/* Badges des filtres appliqués */}
      {filtresActifs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-400">Filtres actifs :</span>
          {filtresActifs.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-xs dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800"
            >
              <strong>{f.colonne}</strong> {f.operateur === "egal" ? "=" : f.operateur === "different" ? "≠" : f.operateur} « {f.valeur} »
              <button onClick={() => supprimerFiltre(i)} className="hover:text-purple-900 ml-1 font-bold">
                ✕
              </button>
            </span>
          ))}
          <button onClick={reinitialiserFiltres} className="text-xs text-rose-600 hover:underline ml-2">
            Effacer tout
          </button>
        </div>
      )}

      {/* Formulaire Filtres Guidé */}
      {panneauActif === "filtres" && (
        <form onSubmit={handleAjouterFiltre} className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Colonne à filtrer</label>
            <select
              value={colonneFiltre}
              onChange={(e) => handleChangementColonneFiltre(e.target.value)}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
            >
              {entetes.map((h) => (
                <option key={h} value={h}>
                  {h} {profilColonnes[h]?.estNumerique ? "(Nombre)" : "(Texte)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Règle</label>
            <select
              value={operateurFiltre}
              onChange={(e) => setOperateurFiltre(e.target.value as ConditionFiltre["operateur"])}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
            >
              {estColFiltreNum ? (
                <>
                  <option value="superieur">Supérieur ou égal (≥)</option>
                  <option value="inferieur">Inférieur ou égal (≤)</option>
                  <option value="egal">Égal à</option>
                </>
              ) : (
                <>
                  <option value="egal">Est égal à</option>
                  <option value="different">Est différent de (exclure)</option>
                  <option value="contient">Contient le texte</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Valeur</label>
            {/* Si c'est du texte, on propose directement les valeurs existantes */}
            {!estColFiltreNum && (profilColonnes[colonneFiltre]?.valeursUniques.length ?? 0) > 0 ? (
              <select
                value={valeurFiltre}
                onChange={(e) => setValeurFiltre(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
              >
                <option value="">-- Choisir une valeur --</option>
                {profilColonnes[colonneFiltre]?.valeursUniques.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={estColFiltreNum ? "number" : "text"}
                value={valeurFiltre}
                onChange={(e) => setValeurFiltre(e.target.value)}
                placeholder={estColFiltreNum ? "Ex: 50000" : "Saisir un mot..."}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={!valeurFiltre}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow transition"
          >
            Appliquer le filtre
          </button>
        </form>
      )}

      {/* Formulaire Calculs Strictement Numériques */}
      {panneauActif === "calculs" && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          {colonnesNumeriques.length < 2 ? (
            <p className="text-xs text-amber-600">
              Il faut au moins deux colonnes de montants ou de quantités pour créer un calcul mathématique.
            </p>
          ) : (
            <form onSubmit={handleCreerCalcul} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Nom de la colonne</label>
                <input
                  type="text"
                  value={nomCalcul}
                  onChange={(e) => setNomCalcul(e.target.value)}
                  placeholder="Ex: Marge, Prix moyen..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Première mesure</label>
                <select
                  value={colA}
                  onChange={(e) => setColA(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                >
                  {colonnesNumeriques.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Opération</label>
                <select
                  value={operateurCalcul}
                  onChange={(e) => setOperateurCalcul(e.target.value as any)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                >
                  <option value="/">Division (A ÷ B)</option>
                  <option value="ratio">Ratio en % ((A ÷ B) × 100)</option>
                  <option value="*">Multiplication (A × B)</option>
                  <option value="-">Différence (A − B)</option>
                  <option value="+">Addition (A + B)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Deuxième mesure</label>
                <select
                  value={colB}
                  onChange={(e) => setColB(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                >
                  {colonnesNumeriques.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={!nomCalcul.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                Créer la colonne
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
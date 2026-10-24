"use client";

import { useMemo, useState } from "react";
import { Table, Sparkles, Scale, ArrowUpRight, ArrowDownRight, Minus, Trophy } from "lucide-react";
import { arrondir, estValeurVide, parseNombre, type Cellule } from "../../lib/analyse/utils";

interface Props {
  entetes: string[];
  corps: Cellule[][];
}

type AgregationTCD = "Somme" | "Moyenne" | "Nombre" | "Minimum" | "Maximum";

function versNombre(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  return parseNombre(v);
}

const selectClasse =
  "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold focus:ring-2 focus:ring-purple-500 text-slate-800 dark:text-slate-200";

export default function TableauCroiseDynamique({ entetes, corps }: Props) {
  const estModeComparaison = entetes.includes("Fichier Source");
  const colonnesSansSource = useMemo(() => entetes.filter((h) => h !== "Fichier Source"), [entetes]);

  const colonnesNumeriques = useMemo(() => {
    return colonnesSansSource.filter((h) => {
      const idx = entetes.indexOf(h);
      const vals = corps.map((l) => versNombre(l[idx])).filter((n): n is number => n !== null);
      return vals.length >= 2;
    });
  }, [entetes, corps, colonnesSansSource]);

  const colonnesCategorielles = useMemo(() => {
    return colonnesSansSource.filter((h) => !colonnesNumeriques.includes(h));
  }, [colonnesSansSource, colonnesNumeriques]);

  // Configurations par défaut : en mode comparaison, "Fichier Source" est placé en colonne
  const [colonneLigne, setColonneLigne] = useState<string>(
    colonnesCategorielles[0] || colonnesSansSource[0] || ""
  );
  const [colonneColonne, setColonneColonne] = useState<string>(
    estModeComparaison ? "Fichier Source" : colonnesCategorielles[1] || ""
  );
  const [colonneMesure, setColonneMesure] = useState<string>(colonnesNumeriques[0] || "");
  const [agregation, setAgregation] = useState<AgregationTCD>("Somme");
  const [afficherEcarts, setAfficherEcarts] = useState<boolean>(true);

  // Sélecteurs de référence et de cible pour le calcul des écarts
  const [sourceRefChoisie, setSourceRefChoisie] = useState<string>("");
  const [sourceCibleChoisie, setSourceCibleChoisie] = useState<string>("");

  const idxLigne = entetes.indexOf(colonneLigne);
  const idxColonne = entetes.indexOf(colonneColonne);
  const idxMesure = entetes.indexOf(colonneMesure);

  // Calcul de la matrice croisée
  const { modalitesLignes, modalitesColonnes, grille, totauxLignes, totauxColonnes, totalGeneral } =
    useMemo(() => {
      if (idxLigne === -1) {
        return {
          modalitesLignes: [],
          modalitesColonnes: [],
          grille: new Map<string, Map<string, { somme: number; n: number; min: number; max: number }>>(),
          totauxLignes: new Map<string, number>(),
          totauxColonnes: new Map<string, number>(),
          totalGeneral: 0,
        };
      }

      const ligSet = new Set<string>();
      const colSet = new Set<string>();
      const map = new Map<string, Map<string, { somme: number; n: number; min: number; max: number }>>();

      for (const ligne of corps) {
        const valLig = String(ligne[idxLigne] ?? "").trim();
        if (!valLig) continue;
        ligSet.add(valLig);

        const valCol = idxColonne >= 0 ? String(ligne[idxColonne] ?? "").trim() : "Total";
        if (idxColonne >= 0 && !valCol) continue;
        if (idxColonne >= 0) colSet.add(valCol);

        let sousMap = map.get(valLig);
        if (!sousMap) {
          sousMap = new Map();
          map.set(valLig, sousMap);
        }

        const cell = sousMap.get(valCol) ?? { somme: 0, n: 0, min: Infinity, max: -Infinity };
        cell.n += 1;

        if (idxMesure >= 0 && agregation !== "Nombre") {
          const num = versNombre(ligne[idxMesure]);
          if (num !== null) {
            cell.somme += num;
            if (num < cell.min) cell.min = num;
            if (num > cell.max) cell.max = num;
          }
        }
        sousMap.set(valCol, cell);
      }

      const listeLig = Array.from(ligSet).slice(0, 30);
      const listeCol = idxColonne >= 0 ? Array.from(colSet).slice(0, 15) : ["Total"];

      const calculerValeurCellule = (cell?: { somme: number; n: number; min: number; max: number }) => {
        if (!cell || cell.n === 0) return 0;
        if (agregation === "Nombre") return cell.n;
        if (agregation === "Moyenne") return cell.n ? cell.somme / cell.n : 0;
        if (agregation === "Minimum") return cell.min === Infinity ? 0 : cell.min;
        if (agregation === "Maximum") return cell.max === -Infinity ? 0 : cell.max;
        return cell.somme;
      };

      const totLig = new Map<string, number>();
      for (const lig of listeLig) {
        let s = 0;
        for (const col of listeCol) {
          s += calculerValeurCellule(map.get(lig)?.get(col));
        }
        totLig.set(lig, arrondir(s));
      }

      const totCol = new Map<string, number>();
      let totGen = 0;
      for (const col of listeCol) {
        let s = 0;
        for (const lig of listeLig) {
          s += calculerValeurCellule(map.get(lig)?.get(col));
        }
        totCol.set(col, arrondir(s));
        totGen += s;
      }

      return {
        modalitesLignes: listeLig,
        modalitesColonnes: listeCol,
        grille: map,
        totauxLignes: totLig,
        totauxColonnes: totCol,
        totalGeneral: arrondir(totGen),
      };
    }, [idxLigne, idxColonne, idxMesure, corps, agregation]);

  const calculerValeur = (cell?: { somme: number; n: number; min: number; max: number }) => {
    if (!cell || cell.n === 0) return 0;
    if (agregation === "Nombre") return cell.n;
    if (agregation === "Moyenne") return cell.n ? cell.somme / cell.n : 0;
    if (agregation === "Minimum") return cell.min === Infinity ? 0 : cell.min;
    if (agregation === "Maximum") return cell.max === -Infinity ? 0 : cell.max;
    return cell.somme;
  };

  // Détection du mode comparatif : au moins 2 colonnes affichées
  const estComparatifActif =
    modalitesColonnes.length >= 2 && (colonneColonne === "Fichier Source" || estModeComparaison);

  // Colonne pivot (référence)
  const colRef = useMemo(() => {
    if (modalitesColonnes.includes(sourceRefChoisie)) return sourceRefChoisie;
    return modalitesColonnes[0] || "";
  }, [modalitesColonnes, sourceRefChoisie]);

  // Colonne cible (comparée)
  const colCible = useMemo(() => {
    if (modalitesColonnes.includes(sourceCibleChoisie) && sourceCibleChoisie !== colRef) {
      return sourceCibleChoisie;
    }
    const autres = modalitesColonnes.filter((c) => c !== colRef);
    return autres[0] || modalitesColonnes[1] || "";
  }, [modalitesColonnes, sourceCibleChoisie, colRef]);

  // Synthèse analytique du benchmark multi-sources
  const syntheseComparatif = useMemo(() => {
    if (!estComparatifActif || !colRef || !colCible) return null;

    const totalC1 = totauxColonnes.get(colRef) || 0;
    const totalC2 = totauxColonnes.get(colCible) || 0;
    const ecartGlobal = Math.round((totalC2 - totalC1) * 100) / 100;
    const pctGlobal = totalC1 > 0 ? Math.round(((totalC2 - totalC1) / totalC1) * 1000) / 10 : 0;

    let maxProgression = { nom: "", ecart: -Infinity, pct: 0 };
    let maxRecul = { nom: "", ecart: Infinity, pct: 0 };

    // Décompte des victoires par colonne sur l'ensemble des lignes
    const victoiresParColonne: Record<string, number> = {};
    modalitesColonnes.forEach((c) => (victoiresParColonne[c] = 0));

    for (const lig of modalitesLignes) {
      let leaderLigne = modalitesColonnes[0];
      let maxValLigne = -Infinity;

      modalitesColonnes.forEach((c) => {
        const val = calculerValeur(grille.get(lig)?.get(c));
        if (val > maxValLigne) {
          maxValLigne = val;
          leaderLigne = c;
        }
      });

      if (victoiresParColonne[leaderLigne] !== undefined) {
        victoiresParColonne[leaderLigne]++;
      }

      // Écart spécifique Cible vs Référence pour cette modalité de ligne
      const v1 = calculerValeur(grille.get(lig)?.get(colRef));
      const v2 = calculerValeur(grille.get(lig)?.get(colCible));
      const diff = Math.round((v2 - v1) * 100) / 100;
      const pct = v1 > 0 ? Math.round((diff / v1) * 1000) / 10 : 0;

      if (diff > maxProgression.ecart) maxProgression = { nom: lig, ecart: diff, pct };
      if (diff < maxRecul.ecart) maxRecul = { nom: lig, ecart: diff, pct };
    }

    const classementVictoires = Object.entries(victoiresParColonne).sort((a, b) => b[1] - a[1]);
    const leaderLignes = classementVictoires[0];

    return {
      sourceRef: colRef,
      sourceCible: colCible,
      totalC1,
      totalC2,
      ecartGlobal,
      pctGlobal,
      maxProgression,
      maxRecul,
      leaderLignes,
      totalLignes: modalitesLignes.length,
    };
  }, [estComparatifActif, colRef, colCible, totauxColonnes, modalitesColonnes, modalitesLignes, grille]);

  return (
    <div className="bloc-tdc-print print-eviter-coupure bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-sm">
      {/* En-tête & Contrôles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Tableau Croisé Dynamique (TCD)
            </h3>
            <p className="text-xs text-slate-400">
              {estComparatifActif
                ? `Matrice comparative multi-sources (${modalitesColonnes.length} colonnes confrontées)`
                : "Agrégation matricielle de vos dimensions"}
            </p>
          </div>
        </div>

        {/* Sélecteurs de dimensions et de calculs */}
        <div className="no-print flex flex-wrap items-center gap-2">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Lignes</span>
            <select value={colonneLigne} onChange={(e) => setColonneLigne(e.target.value)} className={selectClasse}>
              {colonnesSansSource.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Colonnes</span>
            <select value={colonneColonne} onChange={(e) => setColonneColonne(e.target.value)} className={selectClasse}>
              <option value="">(Aucune)</option>
              {entetes.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Mesure</span>
            <select
              value={colonneMesure}
              onChange={(e) => setColonneMesure(e.target.value)}
              disabled={agregation === "Nombre"}
              className={`${selectClasse} disabled:opacity-40`}
            >
              {colonnesNumeriques.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Calcul</span>
            <select
              value={agregation}
              onChange={(e) => setAgregation(e.target.value as AgregationTCD)}
              className={selectClasse}
            >
              <option value="Somme">Somme</option>
              <option value="Moyenne">Moyenne</option>
              <option value="Nombre">Nombre (effectif)</option>
              <option value="Minimum">Minimum</option>
              <option value="Maximum">Maximum</option>
            </select>
          </div>
        </div>
      </div>

      {/* Barre de pilotage comparative pour N >= 2 colonnes */}
      {estComparatifActif && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-indigo-950 dark:text-indigo-200">Base Référence :</span>
              <select
                value={colRef}
                onChange={(e) => setSourceRefChoisie(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1 font-bold text-purple-700 dark:text-purple-300"
              >
                {modalitesColonnes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-indigo-950 dark:text-indigo-200">Cible comparée :</span>
              <select
                value={colCible}
                onChange={(e) => setSourceCibleChoisie(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1 font-bold text-cyan-700 dark:text-cyan-300"
              >
                {modalitesColonnes.filter((c) => c !== colRef).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-300 font-medium">
            <input
              type="checkbox"
              checked={afficherEcarts}
              onChange={(e) => setAfficherEcarts(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500"
            />
            Afficher les colonnes d&apos;écart ({colCible} vs {colRef})
          </label>
        </div>
      )}

      {/* Rendu Tabulaire */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] bg-slate-100/70 dark:bg-slate-800">
                {colonneLigne || "Dimension"} \ {colonneColonne || "Valeur"}
              </th>
              {modalitesColonnes.map((col) => {
                const estRef = col === colRef;
                const estCible = col === colCible;
                return (
                  <th
                    key={col}
                    className={`p-3.5 font-bold text-right whitespace-nowrap ${
                      estRef
                        ? "bg-purple-50/60 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300"
                        : estCible
                        ? "bg-cyan-50/60 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300"
                        : ""
                    }`}
                  >
                    {col} {estRef && <span className="text-[10px] font-normal">(Réf)</span>}
                  </th>
                );
              })}

              {/* Colonnes d'écart calculées */}
              {estComparatifActif && afficherEcarts && (
                <>
                  <th className="p-3.5 font-bold text-right text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/30 whitespace-nowrap">
                    Écart (Δ)
                  </th>
                  <th className="p-3.5 font-bold text-right text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/30 whitespace-nowrap">
                    Variation (%)
                  </th>
                </>
              )}

              <th className="p-3.5 font-extrabold text-right bg-slate-100/70 dark:bg-slate-800">
                Total
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
            {modalitesLignes.map((lig) => {
              const vRef = calculerValeur(grille.get(lig)?.get(colRef));
              const vCible = calculerValeur(grille.get(lig)?.get(colCible));
              const ecartLigne = Math.round((vCible - vRef) * 100) / 100;
              const pctLigne = vRef > 0 ? Math.round(((vCible - vRef) / vRef) * 1000) / 10 : 0;

              return (
                <tr key={lig} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                  <td className="p-3.5 font-sans font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {lig}
                  </td>
                  {modalitesColonnes.map((col) => {
                    const cellVal = arrondir(calculerValeur(grille.get(lig)?.get(col)));
                    return (
                      <td key={col} className="p-3.5 text-right whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {cellVal.toLocaleString("fr-FR")}
                      </td>
                    );
                  })}

                  {/* Affichage des écarts calculés */}
                  {estComparatifActif && afficherEcarts && (
                    <>
                      <td
                        className={`p-3.5 text-right font-bold whitespace-nowrap ${
                          ecartLigne > 0
                            ? "text-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20"
                            : ecartLigne < 0
                            ? "text-rose-600 bg-rose-50/30 dark:bg-rose-950/20"
                            : "text-slate-400"
                        }`}
                      >
                        {ecartLigne > 0 ? `+${ecartLigne.toLocaleString("fr-FR")}` : ecartLigne.toLocaleString("fr-FR")}
                      </td>
                      <td
                        className={`p-3.5 text-right font-bold whitespace-nowrap ${
                          pctLigne > 0
                            ? "text-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20"
                            : pctLigne < 0
                            ? "text-rose-600 bg-rose-50/30 dark:bg-rose-950/20"
                            : "text-slate-400"
                        }`}
                      >
                        {pctLigne > 0 ? `+${pctLigne} %` : pctLigne < 0 ? `${pctLigne} %` : "—"}
                      </td>
                    </>
                  )}

                  <td className="p-3.5 text-right font-bold text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-800/30">
                    {(totauxLignes.get(lig) || 0).toLocaleString("fr-FR")}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Ligne des Totaux Généraux */}
          <tfoot>
            <tr className="bg-slate-100/80 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
              <td className="p-3.5 uppercase tracking-wider text-[11px]">Total général</td>
              {modalitesColonnes.map((col) => (
                <td key={col} className="p-3.5 text-right whitespace-nowrap">
                  {(totauxColonnes.get(col) || 0).toLocaleString("fr-FR")}
                </td>
              ))}

              {/* Total général des écarts */}
              {estComparatifActif && afficherEcarts && syntheseComparatif && (
                <>
                  <td
                    className={`p-3.5 text-right font-black whitespace-nowrap ${
                      syntheseComparatif.ecartGlobal >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {syntheseComparatif.ecartGlobal >= 0
                      ? `+${syntheseComparatif.ecartGlobal.toLocaleString("fr-FR")}`
                      : syntheseComparatif.ecartGlobal.toLocaleString("fr-FR")}
                  </td>
                  <td
                    className={`p-3.5 text-right font-black whitespace-nowrap ${
                      syntheseComparatif.pctGlobal >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {syntheseComparatif.pctGlobal >= 0
                      ? `+${syntheseComparatif.pctGlobal} %`
                      : `${syntheseComparatif.pctGlobal} %`}
                  </td>
                </>
              )}

              <td className="p-3.5 text-right font-black text-purple-700 dark:text-purple-400">
                {totalGeneral.toLocaleString("fr-FR")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* SYNTHÈSE ANALYTIQUE EN MODE BENCHMARK MULTI-SOURCES */}
      {syntheseComparatif && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-4 space-y-2.5 text-xs leading-relaxed">
          <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
            <h5 className="font-bold text-slate-800 dark:text-slate-200">
              Diagnostic chiffré du tableau croisé ({modalitesColonnes.length} colonnes) :
            </h5>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Écart Global Net</span>
              <p
                className={`text-sm font-black ${
                  syntheseComparatif.ecartGlobal >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {syntheseComparatif.ecartGlobal >= 0 ? "+" : ""}
                {syntheseComparatif.ecartGlobal.toLocaleString("fr-FR")}{" "}
                <span className="text-xs font-semibold">({syntheseComparatif.pctGlobal >= 0 ? "+" : ""}{syntheseComparatif.pctGlobal} %)</span>
              </p>
              <p className="text-[10px] text-slate-500">
                {syntheseComparatif.sourceCible} par rapport à {syntheseComparatif.sourceRef}.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold text-amber-500 uppercase flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-500" /> Domination des Lignes
              </span>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {syntheseComparatif.leaderLignes[0]}
              </p>
              <p className="text-[10px] text-slate-500">
                En tête sur <strong>{syntheseComparatif.leaderLignes[1]}</strong> ligne(s) sur {syntheseComparatif.totalLignes}.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Plus forte hausse
              </span>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {syntheseComparatif.maxProgression.nom || "—"}
              </p>
              <p className="text-[10px] text-slate-500">
                Gain net de <strong>+{syntheseComparatif.maxProgression.ecart.toLocaleString("fr-FR")}</strong> (+{syntheseComparatif.maxProgression.pct} %).
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold text-rose-600 uppercase flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5" /> Plus fort recul
              </span>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {syntheseComparatif.maxRecul.nom || "—"}
              </p>
              <p className="text-[10px] text-slate-500">
                Variation de <strong>{syntheseComparatif.maxRecul.ecart.toLocaleString("fr-FR")}</strong> ({syntheseComparatif.maxRecul.pct} %).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
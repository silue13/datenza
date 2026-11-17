"use client";

import { useMemo, useState } from "react";
import {
  Table,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
  Presentation,
  ArrowLeftRight,
  LayoutGrid,
} from "lucide-react";
import {
  arrondir,
  estValeurVide,
  parseNombre,
  estColonneIdentifiant,
  estColonneTemporelle,
  estLigneTotal,
  type Cellule,
} from "../../lib/analyse/utils";
import { trierChronologiquement } from "../../lib/analyse/dates";
import type { ElementPptxExport } from "../../lib/analyse/exportPptx";

/** Cumul d'une case du tableau croisé. n = lignes, nNum = lignes dont la mesure est un nombre. */
interface CelluleTdc {
  somme: number;
  n: number;
  nNum: number;
  min: number;
  max: number;
}

interface Props {
  entetes: string[];
  corps: Cellule[][];
  onAjouterPptx?: (element: ElementPptxExport) => void;
}

type AgregationTCD = "Somme" | "Moyenne" | "Nombre" | "Minimum" | "Maximum";

/** Valeur affichée dans une case selon le calcul choisi (fonction pure : utilisable dans les calculs mémorisés). */
function valeurCase(cell: CelluleTdc | undefined, agregation: AgregationTCD): number {
  if (!cell || cell.n === 0) return 0;
  if (agregation === "Nombre") return cell.n;
  if (agregation === "Moyenne") return cell.nNum ? cell.somme / cell.nNum : 0;
  if (agregation === "Minimum") return cell.min === Infinity ? 0 : cell.min;
  if (agregation === "Maximum") return cell.max === -Infinity ? 0 : cell.max;
  return cell.somme;
}

function versNombre(v: Cellule): number | null {
  if (estValeurVide(v)) return null;
  return parseNombre(v);
}

const selectClasse =
  "w-full sm:w-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 shadow-xs";

export default function TableauCroiseDynamique({ entetes, corps, onAjouterPptx }: Props) {
  const estModeComparaison = entetes.includes("Fichier Source");
  const colonnesSansSource = useMemo(() => entetes.filter((h) => h !== "Fichier Source"), [entetes]);

  // 1. Classification sémantique rigoureuse des colonnes
  const { colonnesDimensions, colonnesMesurables } = useMemo(() => {
    const dimensions: string[] = [];
    const mesurables: string[] = [];

    colonnesSansSource.forEach((h) => {
      const idx = entetes.indexOf(h);
      const vals = corps.map((l) => l[idx]).filter((v) => !estValeurVide(v));
      if (vals.length === 0) return;

      const estId = estColonneIdentifiant(h, vals);
      const estTemps = estColonneTemporelle(h, vals);
      const nums = vals.map(versNombre).filter((n): n is number => n !== null);
      const estNumerique = nums.length / vals.length >= 0.7;

      if (estNumerique && !estId && !estTemps) {
        mesurables.push(h);
      } else {
        dimensions.push(h);
      }
    });

    return { colonnesDimensions: dimensions, colonnesMesurables: mesurables };
  }, [colonnesSansSource, entetes, corps]);

  // Nombre de valeurs différentes par dimension : une colonne à valeur unique ne croise rien
  const cardinalites = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of colonnesDimensions) {
      const idx = entetes.indexOf(d);
      const vues = new Set<string>();
      for (const l of corps) {
        if (!estValeurVide(l[idx])) vues.add(String(l[idx]).trim());
        if (vues.size > 200) break;
      }
      m.set(d, vues.size);
    }
    return m;
  }, [colonnesDimensions, entetes, corps]);

  // Par défaut : la dimension la plus détaillée en lignes, la plus synthétique (2 à 12 valeurs) en colonnes
  const defautLigne = useMemo(() => {
    const utiles = colonnesDimensions.filter((d) => (cardinalites.get(d) ?? 0) >= 2 && (cardinalites.get(d) ?? 0) <= 100);
    const detaillee = [...utiles].sort((a, b) => (cardinalites.get(b) ?? 0) - (cardinalites.get(a) ?? 0))[0];
    return detaillee || colonnesDimensions[0] || colonnesSansSource[0] || "";
  }, [colonnesDimensions, colonnesSansSource, cardinalites]);

  const defautColonne = useMemo(() => {
    if (estModeComparaison) return "Fichier Source";
    const candidates = colonnesDimensions.filter(
      (d) => d !== defautLigne && (cardinalites.get(d) ?? 0) >= 2 && (cardinalites.get(d) ?? 0) <= 12
    );
    return [...candidates].sort((a, b) => (cardinalites.get(a) ?? 0) - (cardinalites.get(b) ?? 0))[0] || "";
  }, [estModeComparaison, colonnesDimensions, defautLigne, cardinalites]);

  const defautMesure = useMemo(() => {
    const mesurePrio = colonnesMesurables.find((m) => m !== defautLigne && m !== defautColonne);
    if (mesurePrio) return mesurePrio;
    if (colonnesMesurables.length > 0) return colonnesMesurables[0];
    return colonnesSansSource.find((c) => c !== defautLigne) || colonnesSansSource[0] || "";
  }, [colonnesMesurables, colonnesSansSource, defautLigne, defautColonne]);

  const [colonneLigne, setColonneLigne] = useState<string>(defautLigne);
  const [colonneColonne, setColonneColonne] = useState<string>(defautColonne);
  const [colonneMesure, setColonneMesure] = useState<string>(defautMesure);
  const [agregation, setAgregation] = useState<AgregationTCD>("Somme");
  const [afficherEcarts, setAfficherEcarts] = useState<boolean>(true);
  const [modeVueMobile, setModeVueMobile] = useState<"tableau" | "cartes">("tableau");

  const [sourceRefChoisie, setSourceRefChoisie] = useState<string>("");
  const [sourceCibleChoisie, setSourceCibleChoisie] = useState<string>("");

  const idxLigne = entetes.indexOf(colonneLigne);
  const idxColonne = entetes.indexOf(colonneColonne);
  const idxMesure = entetes.indexOf(colonneMesure);

  // Tableau déjà ajouté au PPTX : tout changement de réglage ou de données en produit un nouveau, non inclus
  const [inclus, setInclus] = useState<{ cle: string; corps: Cellule[][] } | null>(null);

  // Inverser instantanément Lignes et Colonnes
  const intervertirDimensions = () => {
    if (!colonneColonne) return;
    const temp = colonneLigne;
    setColonneLigne(colonneColonne);
    setColonneColonne(temp);
  };

  // ==========================================
  // CALCUL DE LA MATRICE CROISÉE
  // ==========================================
  const { modalitesLignes, modalitesColonnes, grille, totauxLignes, totauxColonnes, totalGeneral } =
    useMemo(() => {
      if (idxLigne === -1) {
        return {
          modalitesLignes: [],
          modalitesColonnes: [],
          grille: new Map<string, Map<string, CelluleTdc>>(),
          totauxLignes: new Map<string, number>(),
          totauxColonnes: new Map<string, number>(),
          totalGeneral: 0,
        };
      }

      // Modalité -> nombre de lignes (sert à garder les plus représentées si le tableau est trop grand)
      const ligSet = new Map<string, number>();
      const colSet = new Map<string, number>();
      const map = new Map<string, Map<string, CelluleTdc>>();

      for (const ligne of corps) {
        if (estLigneTotal(ligne)) continue;

        // « - », « N/A », « ND »… ne sont pas des modalités
        if (estValeurVide(ligne[idxLigne])) continue;
        const valLig = String(ligne[idxLigne]).trim();
        if (idxColonne >= 0 && estValeurVide(ligne[idxColonne])) continue;
        const valCol = idxColonne >= 0 ? String(ligne[idxColonne]).trim() : "Total";
        ligSet.set(valLig, (ligSet.get(valLig) ?? 0) + 1);
        if (idxColonne >= 0) colSet.set(valCol, (colSet.get(valCol) ?? 0) + 1);

        let sousMap = map.get(valLig);
        if (!sousMap) {
          sousMap = new Map();
          map.set(valLig, sousMap);
        }

        const cell = sousMap.get(valCol) ?? { somme: 0, n: 0, nNum: 0, min: Infinity, max: -Infinity };
        cell.n += 1;

        if (idxMesure >= 0 && agregation !== "Nombre") {
          const num = versNombre(ligne[idxMesure]);
          if (num !== null) {
            cell.somme += num;
            cell.nNum += 1;
            if (num < cell.min) cell.min = num;
            if (num > cell.max) cell.max = num;
          }
        }
        sousMap.set(valCol, cell);
      }

      // Trop de modalités : on garde les plus représentées (et non les premières rencontrées dans le fichier),
      // puis on range les périodes dans l'ordre du calendrier et le reste par ordre alphabétique.
      const ordonner = (vues: Map<string, number>, max: number) => {
        const gardees = [...vues.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
        return (
          trierChronologiquement(gardees, (x) => x) ??
          gardees.sort((a, b) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" }))
        );
      };
      const listeLig = ordonner(ligSet, 100);
      const listeCol = idxColonne >= 0 ? ordonner(colSet, 20) : ["Total"];

      const agregerCellules = (cells: (CelluleTdc | undefined)[]) => {
        const valides = cells.filter((c): c is CelluleTdc => !!c && c.n > 0);
        const totalN = valides.reduce((acc, c) => acc + c.n, 0);
        if (totalN === 0) return 0;
        if (agregation === "Nombre") return totalN;
        const totalSomme = valides.reduce((acc, c) => acc + c.somme, 0);
        // Moyenne sur les seules valeurs numériques : une cellule vide ne tire plus la moyenne vers zéro
        const totalNum = valides.reduce((acc, c) => acc + c.nNum, 0);
        if (agregation === "Moyenne") return totalNum > 0 ? totalSomme / totalNum : 0;
        if (agregation === "Minimum") {
          const mins = valides.map((c) => c.min).filter((m) => m !== Infinity);
          return mins.length ? Math.min(...mins) : 0;
        }
        if (agregation === "Maximum") {
          const maxs = valides.map((c) => c.max).filter((m) => m !== -Infinity);
          return maxs.length ? Math.max(...maxs) : 0;
        }
        return totalSomme;
      };

      const totLig = new Map<string, number>();
      for (const lig of listeLig) {
        const rowCells = listeCol.map((col) => map.get(lig)?.get(col));
        totLig.set(lig, arrondir(agregerCellules(rowCells)));
      }

      const totCol = new Map<string, number>();
      for (const col of listeCol) {
        const colCells = listeLig.map((lig) => map.get(lig)?.get(col));
        totCol.set(col, arrondir(agregerCellules(colCells)));
      }

      const toutesCellules: (CelluleTdc | undefined)[] = [];
      for (const lig of listeLig) {
        for (const col of listeCol) {
          toutesCellules.push(map.get(lig)?.get(col));
        }
      }
      const totGen = arrondir(agregerCellules(toutesCellules));

      return {
        modalitesLignes: listeLig,
        modalitesColonnes: listeCol,
        grille: map,
        totauxLignes: totLig,
        totauxColonnes: totCol,
        totalGeneral: totGen,
      };
    }, [idxLigne, idxColonne, idxMesure, corps, agregation]);

  const cleTableau = `${idxLigne}|${idxColonne}|${idxMesure}|${agregation}`;
  const estDejaInclus = inclus !== null && inclus.cle === cleTableau && inclus.corps === corps;

  /** Vrai si la case n'a rien à afficher : aucune ligne, ou aucune valeur numérique pour un calcul sur la mesure. */
  const caseVide = (cell?: CelluleTdc) => !cell || cell.n === 0 || (agregation !== "Nombre" && cell.nNum === 0);

  const calculerValeur = (cell?: CelluleTdc) => valeurCase(cell, agregation);

  const estComparatifActif = modalitesColonnes.length >= 2 && (colonneColonne === "Fichier Source" || estModeComparaison);
  const colRef = useMemo(
    () => (modalitesColonnes.includes(sourceRefChoisie) ? sourceRefChoisie : modalitesColonnes[0] || ""),
    [modalitesColonnes, sourceRefChoisie]
  );
  const colCible = useMemo(
    () =>
      modalitesColonnes.includes(sourceCibleChoisie) && sourceCibleChoisie !== colRef
        ? sourceCibleChoisie
        : modalitesColonnes.filter((c) => c !== colRef)[0] || "",
    [modalitesColonnes, sourceCibleChoisie, colRef]
  );

  const preparerExportPptx = () => {
    if (!onAjouterPptx) return;

    const entetesTdc = [`${colonneLigne} \\ ${colonneColonne || "Valeur"}`, ...modalitesColonnes, "Total Général"];

    const lignesTdc: (string | number)[][] = modalitesLignes.map((lig) => {
      const cellules: (string | number)[] = [lig];
      modalitesColonnes.forEach((col) => {
        const c = grille.get(lig)?.get(col);
        cellules.push(caseVide(c) ? "—" : arrondir(calculerValeur(c)));
      });
      cellules.push(arrondir(totauxLignes.get(lig) || 0));
      return cellules;
    });

    lignesTdc.push([
      "Total Général",
      ...modalitesColonnes.map((col) => arrondir(totauxColonnes.get(col) || 0)),
      totalGeneral,
    ]);

    onAjouterPptx({
      id: `tdc-manuel-${colonneLigne}-${colonneColonne}-${agregation}`,
      typeVisuel: "tdc",
      titre: "Tableau Croisé Dynamique",
      sousTitre: `Matrice croisée : ${colonneLigne} × ${colonneColonne || "Global"} (${agregation} de ${colonneMesure})`,
      donneesTableau: {
        entetes: entetesTdc,
        lignes: lignesTdc,
      },
    });

    setInclus({ cle: cleTableau, corps });
  };

  const syntheseComparatif = useMemo(() => {
    if (!estComparatifActif || !colRef || !colCible) return null;

    const totalC1 = totauxColonnes.get(colRef) || 0;
    const totalC2 = totauxColonnes.get(colCible) || 0;
    const ecartGlobal = Math.round((totalC2 - totalC1) * 100) / 100;
    const pctGlobal = totalC1 > 0 ? Math.round(((totalC2 - totalC1) / totalC1) * 1000) / 10 : 0;

    let maxProgression: { nom: string; ecart: number; pct: number } | null = null;
    let maxRecul: { nom: string; ecart: number; pct: number } | null = null;

    const victoiresParColonne: Record<string, number> = {};
    modalitesColonnes.forEach((c) => (victoiresParColonne[c] = 0));

    for (const lig of modalitesLignes) {
      let leaderLigne = modalitesColonnes[0];
      let maxValLigne = -Infinity;

      modalitesColonnes.forEach((c) => {
        const val = valeurCase(grille.get(lig)?.get(c), agregation);
        if (val > maxValLigne) {
          maxValLigne = val;
          leaderLigne = c;
        }
      });

      if (victoiresParColonne[leaderLigne] !== undefined) victoiresParColonne[leaderLigne]++;

      const v1 = valeurCase(grille.get(lig)?.get(colRef), agregation);
      const v2 = valeurCase(grille.get(lig)?.get(colCible), agregation);
      const diff = Math.round((v2 - v1) * 100) / 100;
      const pct = v1 > 0 ? Math.round((diff / v1) * 1000) / 10 : 0;

      if (diff > 0 && (!maxProgression || diff > maxProgression.ecart)) {
        maxProgression = { nom: lig, ecart: diff, pct };
      }
      if (diff < 0 && (!maxRecul || diff < maxRecul.ecart)) {
        maxRecul = { nom: lig, ecart: diff, pct };
      }
    }

    const classementVictoires = Object.entries(victoiresParColonne).sort((a, b) => b[1] - a[1]);
    const leaderLignes = classementVictoires[0] || ["—", 0];

    return {
      sourceRef: colRef,
      sourceCible: colCible,
      totalC1,
      totalC2,
      ecartGlobal,
      pctGlobal,
      maxProgression: maxProgression || { nom: "—", ecart: 0, pct: 0 },
      maxRecul: maxRecul || { nom: "—", ecart: 0, pct: 0 },
      leaderLignes,
      totalLignes: modalitesLignes.length,
    };
  }, [estComparatifActif, colRef, colCible, totauxColonnes, modalitesColonnes, modalitesLignes, grille, agregation]);

  return (
    <div className="bloc-tdc-print print-eviter-coupure bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5 shadow-sm">
      {/* En-tête exécutif */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shrink-0">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Tableau Croisé Dynamique (TCD)
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              {estComparatifActif
                ? `Matrice comparative multi-sources (${modalitesColonnes.length} colonnes)`
                : "Agrégation matricielle et croisement de vos indicateurs"}
            </p>
          </div>
        </div>

        {onAjouterPptx && (
          <div className="no-print print:hidden">
            <button
              onClick={preparerExportPptx}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                estDejaInclus
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 dark:border"
              }`}
            >
              <Presentation className="w-3.5 h-3.5 shrink-0" />
              <span>{estDejaInclus ? "✓ Inclus au PPTX" : "+ Ajouter au PPTX"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Barre d'actions mobiles : Inversion Lignes/Colonnes & Bascule Fiches/Tableau */}
      <div className="no-print print:hidden flex flex-wrap items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={intervertirDimensions}
          disabled={!colonneColonne}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer disabled:opacity-40"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
          <span>Inverser Lignes ↔ Colonnes</span>
        </button>

        <div className="sm:hidden flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setModeVueMobile("tableau")}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
              modeVueMobile === "tableau"
                ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs"
                : "text-slate-500"
            }`}
          >
            <Table className="w-3 h-3" />
            <span>Tableau</span>
          </button>
          <button
            type="button"
            onClick={() => setModeVueMobile("cartes")}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
              modeVueMobile === "cartes"
                ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs"
                : "text-slate-500"
            }`}
          >
            <LayoutGrid className="w-3 h-3" />
            <span>Fiches</span>
          </button>
        </div>
      </div>

      {/* Sélecteurs de dimensions et de métriques */}
      <div className="no-print print:hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Lignes (Dimension)</span>
          <select value={colonneLigne} onChange={(e) => setColonneLigne(e.target.value)} className={selectClasse}>
            {colonnesSansSource.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Colonnes (Croisement)</span>
          <select value={colonneColonne} onChange={(e) => setColonneColonne(e.target.value)} className={selectClasse}>
            <option value="">(Aucune - Vue synthétique)</option>
            {entetes.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Mesure calculée</span>
          <select
            value={colonneMesure}
            onChange={(e) => setColonneMesure(e.target.value)}
            disabled={agregation === "Nombre"}
            className={`${selectClasse} disabled:opacity-40`}
          >
            {colonnesSansSource.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Opération</span>
          <select
            value={agregation}
            onChange={(e) => setAgregation(e.target.value as AgregationTCD)}
            className={selectClasse}
          >
            <option value="Somme">Somme cumulée</option>
            <option value="Moyenne">Moyenne</option>
            <option value="Nombre">Nombre d’enregistrements</option>
            <option value="Minimum">Minimum</option>
            <option value="Maximum">Maximum</option>
          </select>
        </div>
      </div>

      {/* Barre de pilotage en mode Benchmark */}
      {estComparatifActif && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-1.5">
              <span className="font-semibold text-blue-950 dark:text-blue-200">Base Réf :</span>
              <select
                value={colRef}
                onChange={(e) => setSourceRefChoisie(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg px-2 py-1 font-bold text-blue-700 dark:text-blue-300 text-xs"
              >
                {modalitesColonnes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between sm:justify-start gap-1.5">
              <span className="font-semibold text-blue-950 dark:text-blue-200">Cible :</span>
              <select
                value={colCible}
                onChange={(e) => setSourceCibleChoisie(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg px-2 py-1 font-bold text-blue-600 dark:text-blue-400 text-xs"
              >
                {modalitesColonnes
                  .filter((c) => c !== colRef)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-300 font-medium">
            <input
              type="checkbox"
              checked={afficherEcarts}
              onChange={(e) => setAfficherEcarts(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            Afficher les écarts (Δ)
          </label>
        </div>
      )}

      {/* VUE MOBILE ALTERNATIVE : FICHES VERTICALES SANS DÉFILEMENT */}
      {modeVueMobile === "cartes" ? (
        <div className="sm:hidden space-y-3">
          {modalitesLignes.map((lig) => {
            const vRef = calculerValeur(grille.get(lig)?.get(colRef));
            const vCible = calculerValeur(grille.get(lig)?.get(colCible));
            const ecartLigne = Math.round((vCible - vRef) * 100) / 100;
            const pctLigne = vRef > 0 ? Math.round(((vCible - vRef) / vRef) * 1000) / 10 : 0;

            return (
              <div
                key={lig}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 space-y-2.5"
              >
                <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {lig}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                    Total : {(totauxLignes.get(lig) || 0).toLocaleString("fr-FR")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {modalitesColonnes.map((col) => {
                    const val = arrondir(calculerValeur(grille.get(lig)?.get(col)));
                    const estRef = col === colRef;
                    const estCible = col === colCible;
                    return (
                      <div
                        key={col}
                        className={`p-2 rounded-xl border ${
                          estRef
                            ? "bg-blue-50/60 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900"
                            : estCible
                            ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                            : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800"
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 block truncate">
                          {col} {estRef && "(Réf)"}
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {val.toLocaleString("fr-FR")}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {estComparatifActif && afficherEcarts && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-800 text-[11px]">
                    <span className="text-slate-500">Écart vs Réf :</span>
                    <span
                      className={`font-mono font-bold ${
                        ecartLigne > 0
                          ? "text-emerald-600"
                          : ecartLigne < 0
                          ? "text-rose-600"
                          : "text-slate-400"
                      }`}
                    >
                      {ecartLigne > 0 ? `+${ecartLigne.toLocaleString("fr-FR")}` : ecartLigne.toLocaleString("fr-FR")}{" "}
                      ({pctLigne > 0 ? `+${pctLigne} %` : pctLigne < 0 ? `${pctLigne} %` : "—"})
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* VUE TABULAIRE STANDARD : Scroll horizontal fluide & Colonne gauche sticky */
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 relative scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                <th className="px-3 py-2.5 sm:px-3.5 sm:py-3 font-bold uppercase tracking-wider text-[11px] bg-slate-100 dark:bg-slate-800 sticky left-0 z-20 shadow-[1px_0_0_0_rgba(226,232,240,1)] dark:shadow-[1px_0_0_0_rgba(51,65,85,1)] whitespace-nowrap">
                  {colonneLigne || "Dimension"} \ {colonneColonne || "Valeur"}
                </th>
                {modalitesColonnes.map((col) => {
                  const estRef = col === colRef;
                  const estCible = col === colCible;
                  return (
                    <th
                      key={col}
                      className={`px-3 py-2.5 sm:px-3.5 sm:py-3 font-bold text-right whitespace-nowrap ${
                        estRef
                          ? "bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                          : estCible
                          ? "bg-slate-100/80 dark:bg-slate-800 text-blue-600 dark:text-blue-400"
                          : ""
                      }`}
                    >
                      {col} {estRef && <span className="text-[10px] font-normal">(Réf)</span>}
                    </th>
                  );
                })}

                {estComparatifActif && afficherEcarts && (
                  <>
                    <th className="px-3 py-2.5 sm:px-3.5 sm:py-3 font-bold text-right text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30 whitespace-nowrap">
                      Écart (Δ)
                    </th>
                    <th className="px-3 py-2.5 sm:px-3.5 sm:py-3 font-bold text-right text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30 whitespace-nowrap">
                      Variation (%)
                    </th>
                  </>
                )}

                <th className="px-3 py-2.5 sm:px-3.5 sm:py-3 font-extrabold text-right bg-slate-100/70 dark:bg-slate-800 whitespace-nowrap">
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
                  <tr key={lig} className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="px-3 py-2.5 sm:px-3.5 sm:py-3 font-sans font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 shadow-[1px_0_0_0_rgba(226,232,240,1)] dark:shadow-[1px_0_0_0_rgba(51,65,85,1)]">
                      {lig}
                    </td>
                    {modalitesColonnes.map((col) => {
                      const cellVal = arrondir(calculerValeur(grille.get(lig)?.get(col)));
                      return (
                        <td key={col} className="px-3 py-2.5 sm:px-3.5 sm:py-3 text-right whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {caseVide(grille.get(lig)?.get(col)) ? <span className="text-slate-300 dark:text-slate-600">—</span> : cellVal.toLocaleString("fr-FR")}
                        </td>
                      );
                    })}

                    {estComparatifActif && afficherEcarts && (
                      <>
                        <td
                          className={`px-3 py-2.5 sm:px-3.5 sm:py-3 text-right font-bold whitespace-nowrap ${
                            ecartLigne > 0
                              ? "text-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20"
                              : ecartLigne < 0
                              ? "text-rose-600 bg-rose-50/30 dark:bg-rose-950/20"
                              : "text-slate-400"
                          }`}
                        >
                          {ecartLigne > 0
                            ? `+${ecartLigne.toLocaleString("fr-FR")}`
                            : ecartLigne.toLocaleString("fr-FR")}
                        </td>
                        <td
                          className={`px-3 py-2.5 sm:px-3.5 sm:py-3 text-right font-bold whitespace-nowrap ${
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

                    <td className="px-3 py-2.5 sm:px-3.5 sm:py-3 text-right font-bold text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-800/30 whitespace-nowrap">
                      {(totauxLignes.get(lig) || 0).toLocaleString("fr-FR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="bg-slate-100/80 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                <td className="px-3 py-2.5 sm:px-3.5 sm:py-3 uppercase tracking-wider text-[11px] sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 shadow-[1px_0_0_0_rgba(226,232,240,1)] dark:shadow-[1px_0_0_0_rgba(51,65,85,1)] whitespace-nowrap">
                  Total général
                </td>
                {modalitesColonnes.map((col) => (
                  <td key={col} className="px-3 py-2.5 sm:px-3.5 sm:py-3 text-right whitespace-nowrap">
                    {(totauxColonnes.get(col) || 0).toLocaleString("fr-FR")}
                  </td>
                ))}

                {estComparatifActif && afficherEcarts && syntheseComparatif && (
                  <>
                    <td
                      className={`px-3 py-2.5 sm:px-3.5 sm:py-3 text-right font-black whitespace-nowrap ${
                        syntheseComparatif.ecartGlobal >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {syntheseComparatif.ecartGlobal >= 0
                        ? `+${syntheseComparatif.ecartGlobal.toLocaleString("fr-FR")}`
                        : syntheseComparatif.ecartGlobal.toLocaleString("fr-FR")}
                    </td>
                    <td
                      className={`px-3 py-2.5 sm:px-3.5 sm:py-3 text-right font-black whitespace-nowrap ${
                        syntheseComparatif.pctGlobal >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {syntheseComparatif.pctGlobal >= 0
                        ? `+${syntheseComparatif.pctGlobal} %`
                        : `${syntheseComparatif.pctGlobal} %`}
                    </td>
                  </>
                )}

                <td className="px-3 py-2.5 sm:px-3.5 sm:py-3 text-right font-black text-blue-700 dark:text-blue-400 whitespace-nowrap">
                  {totalGeneral.toLocaleString("fr-FR")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Synthèse comparative multi-sources */}
      {syntheseComparatif && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-4 space-y-3 text-xs leading-relaxed">
          <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
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
                <span className="text-xs font-semibold">
                  ({syntheseComparatif.pctGlobal >= 0 ? "+" : ""}
                  {syntheseComparatif.pctGlobal} %)
                </span>
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
                En tête sur <strong>{syntheseComparatif.leaderLignes[1]}</strong> ligne(s) sur{" "}
                {syntheseComparatif.totalLignes}.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Plus forte hausse
              </span>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {syntheseComparatif.maxProgression.nom}
              </p>
              <p className="text-[10px] text-slate-500">
                {syntheseComparatif.maxProgression.ecart > 0 ? (
                  <>
                    Gain net de <strong>+{syntheseComparatif.maxProgression.ecart.toLocaleString("fr-FR")}</strong> (
                    +{syntheseComparatif.maxProgression.pct} %).
                  </>
                ) : (
                  <>Aucune progression constatée.</>
                )}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1">
              <span className="text-[10px] font-bold text-rose-600 uppercase flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5" /> Plus fort recul
              </span>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {syntheseComparatif.maxRecul.nom}
              </p>
              <p className="text-[10px] text-slate-500">
                {syntheseComparatif.maxRecul.ecart < 0 ? (
                  <>
                    Variation de <strong>{syntheseComparatif.maxRecul.ecart.toLocaleString("fr-FR")}</strong> (
                    {syntheseComparatif.maxRecul.pct} %).
                  </>
                ) : (
                  <>Aucun recul constaté.</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
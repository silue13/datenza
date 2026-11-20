"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { lireFichier, EXTENSIONS_ACCEPTEES } from "../../lib/import/lecture";
import type { BlocRapport } from "../../lib/analyse/rapport";
import {
  Files,
  Upload,
  Sparkles,
  Trash2,
  FileSpreadsheet,
  BarChart2,
  Download,
  ArrowRight,
  Settings2,
  Layers,
  GitMerge,
  Scale,
  ArrowUp,
  ArrowDown,
  Link2,
} from "lucide-react";
import { useData } from "../context/DataContext";
import {
  fusionnerEtNettoyer,
  type FichierEntree,
  type OptionsNettoyage,
  type ResultatFusionNettoyage,
  type ModeAssemblage,
  type TypeJointure,
} from "../../lib/analyse/fusion";
import { analyserColonnes } from "../../lib/analyse/analyse";
import {
  comparerFichiers,
  nomCourt,
  unifierColonnes,
  evaluerCles,
  proposerCle,
  descriptionRapprochements,
  empilerPourComparaison,
  type CorrespondancesManuelles,
  type ResultatComparaison,
} from "../../lib/analyse/comparaison";

/** Valeur du sélecteur de clé signifiant « comparer les totaux, sans rapprochement ligne à ligne ». */
const SANS_CLE = "__sans_cle__";
type ModePage = ModeAssemblage | "comparaison";

const fmtNombre = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export default function FusionNettoyagePage() {
  const router = useRouter();
  const { chargerDonnees } = useData();

  const [fichiersBruts, setFichiersBruts] = useState<FichierEntree[]>([]);
  const [chargement, setChargement] = useState(false);
  const [estEnGlissement, setEstEnGlissement] = useState(false);
  const [resultat, setResultat] = useState<ResultatFusionNettoyage | null>(null);

  // Configuration de l'assemblage
  const [modeAssemblage, setModeAssemblage] = useState<ModePage>("jointure");
  const [idxTableA, setIdxTableA] = useState<number>(0);
  const [idxTableB, setIdxTableB] = useState<number>(1);
  const [cleChoisieA, setCleChoisieA] = useState<string>("");
  const [cleChoisieB, setCleChoisieB] = useState<string>("");
  const [typeJointure, setTypeJointure] = useState<TypeJointure>("inter");

  // Comparaison de 2 fichiers ou plus
  const [cleComparaisonChoisie, setCleComparaisonChoisie] = useState<string | null>(null);
  const [referenceComparaison, setReferenceComparaison] = useState<number>(0);
  const [comparaison, setComparaison] = useState<ResultatComparaison | null>(null);
  const [erreurComparaison, setErreurComparaison] = useState<string>("");

  // Options de nettoyage
  const [options, setOptions] = useState<{
    supprimerDoublons: boolean;
    harmoniserFormatsNumeriques: boolean;
    harmoniserDates: boolean;
    nettoyerEspaces: boolean;
    remplirValeursVides: boolean;
    valeurRemplacementVide: string;
    alignerColonnesSimilaires: boolean;
  }>({
    supprimerDoublons: true,
    harmoniserFormatsNumeriques: true,
    harmoniserDates: true,
    nettoyerEspaces: true,
    remplirValeursVides: false,
    valeurRemplacementVide: "N/A",
    alignerColonnesSimilaires: true,
  });

  // Colonnes associées à la main quand leurs noms ne permettent pas de les deviner
  const [manuelles, setManuelles] = useState<CorrespondancesManuelles>({});

  // Déduction automatique des clés par défaut : la colonne dont les valeurs se retrouvent d'un fichier à l'autre
  const tableA = fichiersBruts[idxTableA] || fichiersBruts[0];
  const tableB = fichiersBruts[idxTableB] || fichiersBruts[1];

  const colonnesA = useMemo(() => tableA?.entetes || [], [tableA]);
  const colonnesB = useMemo(() => tableB?.entetes || [], [tableB]);

  const cleProposeeJointure = useMemo(() => {
    if (!tableA || !tableB || tableA === tableB) return null;
    const paire = [tableA, tableB];
    return proposerCle(paire, unifierColonnes(paire));
  }, [tableA, tableB]);

  const cleActiveA = useMemo(() => {
    if (colonnesA.includes(cleChoisieA)) return cleChoisieA;
    if (cleProposeeJointure) return cleProposeeJointure.colonne.variantes[0];
    const prio = colonnesA.find((h) => /(id|code|ref|matricule|numero)/i.test(h));
    return prio || colonnesA[0] || "";
  }, [colonnesA, cleChoisieA, cleProposeeJointure]);

  const cleActiveB = useMemo(() => {
    if (colonnesB.includes(cleChoisieB)) return cleChoisieB;
    if (cleProposeeJointure && cleProposeeJointure.colonne.variantes[0] === cleActiveA) return cleProposeeJointure.colonne.variantes[1];
    const prioCommune = colonnesB.find((h) => h.toLowerCase() === cleActiveA.toLowerCase());
    if (prioCommune) return prioCommune;
    const prio = colonnesB.find((h) => /(id|code|ref|matricule|numero)/i.test(h));
    return prio || colonnesB[0] || "";
  }, [colonnesB, cleChoisieB, cleActiveA, cleProposeeJointure]);

  /** Toutes les colonnes rapprochées sur celles du premier fichier (automatiquement ou à la main). */
  const unifiees = useMemo(
    () => (fichiersBruts.length >= 2 ? unifierColonnes(fichiersBruts, { manuelles }) : []),
    [fichiersBruts, manuelles]
  );
  const communesComparaison = useMemo(() => unifiees.filter((c) => c.indices.every((i) => i !== -1)), [unifiees]);
  const evaluationsCles = useMemo(
    () => (communesComparaison.length ? evaluerCles(fichiersBruts, communesComparaison) : []),
    [fichiersBruts, communesComparaison]
  );
  const cleComparaison = useMemo(() => {
    if (cleComparaisonChoisie === SANS_CLE) return "";
    if (cleComparaisonChoisie && communesComparaison.some((c) => c.nom === cleComparaisonChoisie)) return cleComparaisonChoisie;
    const meilleure = evaluationsCles[0];
    return meilleure && Math.min(...meilleure.taux.slice(1)) >= 0.3 ? meilleure.colonne.nom : "";
  }, [cleComparaisonChoisie, communesComparaison, evaluationsCles]);
  const evaluationCle = evaluationsCles.find((e) => e.colonne.nom === cleComparaison) ?? null;
  const indexReference = referenceComparaison < fichiersBruts.length ? referenceComparaison : 0;

  const choisirCorrespondance = (nomFichier: string, colonneRef: string, colonne: string | null) => {
    setManuelles((prev) => ({ ...prev, [nomFichier]: { ...(prev[nomFichier] ?? {}), [colonneRef]: colonne } }));
    setResultat(null);
    setComparaison(null);
  };

  const deplacerFichier = (index: number, sens: -1 | 1) => {
    const cible = index + sens;
    if (cible < 0 || cible >= fichiersBruts.length) return;
    setFichiersBruts((prev) => {
      const copie = [...prev];
      [copie[index], copie[cible]] = [copie[cible], copie[index]];
      return copie;
    });
    setReferenceComparaison(0);
    setResultat(null);
    setComparaison(null);
  };

  // Extraction universelle Excel et CSV
  const traiterFichiersDeposes = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setChargement(true);

    const nouveaux: FichierEntree[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const tableau = await lireFichier(file);
        nouveaux.push({
          nom: file.name,
          entetes: tableau.entetes,
          corps: tableau.corps,
        });
      } catch (err) {
        console.error(`Erreur lors de la lecture de ${file.name}`, err);
      }
    }

    setFichiersBruts((prev) => [...prev, ...nouveaux]);
    setResultat(null);
    setComparaison(null);
    setChargement(false);
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setEstEnGlissement(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setEstEnGlissement(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setEstEnGlissement(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void traiterFichiersDeposes(e.dataTransfer.files);
    }
  };

  const executerOperation = () => {
    if (fichiersBruts.length < 2) return;
    setErreurComparaison("");

    if (modeAssemblage === "comparaison") {
      setResultat(null);
      try {
        setComparaison(
          comparerFichiers(fichiersBruts, {
            cles: cleComparaison ? [cleComparaison] : [],
            reference: indexReference,
            manuelles,
          })
        );
      } catch (e) {
        setComparaison(null);
        setErreurComparaison(e instanceof Error ? e.message : "Comparaison impossible.");
      }
      return;
    }
    setComparaison(null);

    const optionsCompletes: OptionsNettoyage = {
      mode: modeAssemblage,
      jointure:
        modeAssemblage === "jointure"
          ? {
              indexFichierA: idxTableA,
              indexFichierB: idxTableB,
              cleFichierA: cleActiveA,
              cleFichierB: cleActiveB,
              typeJointure,
            }
          : undefined,
      ...options,
      correspondances: manuelles,
    };

    const res = fusionnerEtNettoyer(fichiersBruts, optionsCompletes);
    setResultat(res);
  };

  const telechargerExcelConsolide = () => {
    if (comparaison) {
      const classeur = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet([comparaison.entetes, ...comparaison.corps]), "Comparaison");
      if (comparaison.bilan.cles.length > 0 && comparaison.synthese.length > 0) {
        const noms = comparaison.synthese[0].parFichier.map((p) => p.nom);
        const lignes = comparaison.synthese.map((s) => [
          s.colonne,
          s.operation === "somme" ? "Somme" : "Moyenne",
          ...s.parFichier.map((p) => p.valeur ?? ""),
          ...s.ecarts.map((e) => e.ecart ?? ""),
        ]);
        const entetes = ["Indicateur", "Calcul", ...noms, ...noms.map((n) => `Écart ${n} vs ${comparaison.bilan.reference}`)];
        XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet([entetes, ...lignes]), "Totaux");
      }
      XLSX.writeFile(classeur, "datenza_comparaison.xlsx");
      return;
    }
    if (!resultat) return;
    const donneeAOA = [resultat.entetes, ...resultat.corps];
    const feuille = XLSX.utils.aoa_to_sheet(donneeAOA);
    const classeur = XLSX.utils.book_new();
    const nomFeuille = modeAssemblage === "jointure" ? `Jointure_${typeJointure}` : "Données Consolidées";
    XLSX.utils.book_append_sheet(classeur, feuille, nomFeuille);
    XLSX.writeFile(classeur, `datenza_${nomFeuille.toLowerCase()}.xlsx`);
  };

  /** Analyse des fichiers côte à côte (une série par fichier), le fichier de référence en premier. */
  const analyseCompareeFichiers = () => {
    const ordre = [fichiersBruts[indexReference], ...fichiersBruts.filter((_, i) => i !== indexReference)];
    const { entetes, corps } = empilerPourComparaison(ordre, manuelles);
    chargerDonnees(`Comparatif (${ordre.map((f) => nomCourt(f.nom)).join(" vs ")})`, entetes, corps);
    router.push("/analyse");
  };

  const analyserComparaison = () => {
    if (!comparaison) return;
    const { bilan } = comparaison;
    const analyseStat = analyserColonnes(comparaison.entetes, comparaison.corps, comparaison.entetes);
    const rapportDynamique: BlocRapport[] = [
      {
        type: "intro",
        texte: bilan.cles.length
          ? `Comparaison de ${bilan.nbFichiers} fichiers sur la clé « ${bilan.cles.join(" + ")} » : ${bilan.nbCles.toLocaleString("fr-FR")} valeur(s) rapprochée(s), référence « ${bilan.reference} ».`
          : `Comparaison des totaux de ${bilan.nbFichiers} fichiers sur ${bilan.nbCles} colonne(s) numérique(s), référence « ${bilan.reference} ».`,
      },
    ];
    if (bilan.cles.length) {
      rapportDynamique.push({
        type: "qualite",
        texte: `Bilan : ${bilan.identiques} identique(s), ${bilan.avecEcarts} avec écarts de valeurs, ${bilan.incompletes} absente(s) d'au moins un fichier.`,
      });
    }
    comparaison.synthese.forEach((s) => {
      const autres = s.ecarts.filter((e) => e.nom !== bilan.reference && e.ecart !== null);
      if (!autres.length) return;
      rapportDynamique.push({
        type: "numerique",
        texte: `« ${s.colonne} » (${s.operation}) : ${s.parFichier.map((p) => `${p.nom} ${fmtNombre(p.valeur)}`).join(", ")} — ${autres
          .map((e) => `${e.nom} ${e.ecart! >= 0 ? "+" : ""}${fmtNombre(e.ecart)}${e.variationPct !== null ? ` (${e.variationPct >= 0 ? "+" : ""}${fmtNombre(e.variationPct)} %)` : ""}`)
          .join(", ")} vs ${bilan.reference}.`,
      });
    });
    chargerDonnees(
      `Comparaison (${fichiersBruts.map((f) => nomCourt(f.nom)).join(" vs ")})`,
      comparaison.entetes,
      comparaison.corps,
      analyseStat,
      rapportDynamique
    );
    router.push("/analyse");
  };

  // Bascule vers l'analyse unifiée
  const basculerVersAnalyse = () => {
    if (!resultat) return;

    const analyseStat = analyserColonnes(resultat.entetes, resultat.corps, resultat.entetes);
    const rapportDynamique: BlocRapport[] = [];

    if (resultat.rapport.mode === "jointure") {
      const typeLabel =
        typeJointure === "inter"
          ? "Correspondances communes (Inter)"
          : typeJointure === "anti_gauche"
          ? "Lignes propres à A (Anti-gauche)"
          : typeJointure === "anti_droite"
          ? "Lignes propres à B (Anti-droite)"
          : "Enrichissement (Gauche externe)";

      rapportDynamique.push({
        type: "intro",
        texte: `Réconciliation ${typeLabel} terminée : ${resultat.corps.length.toLocaleString("fr-FR")} lignes extraites sur les clés « ${cleActiveA} » et « ${cleActiveB} ».`,
      });

      if (typeJointure === "inter" && resultat.rapport.nbCorrespondances !== undefined) {
        rapportDynamique.push({
          type: "qualite",
          texte: `Bilan relationnel : ${resultat.rapport.nbCorrespondances} paire(s) réconciliée(s), ${resultat.rapport.nbOrphelinsA} orphelin(s) dans le premier fichier et ${resultat.rapport.nbOrphelinsB} dans le second.`,
        });
      }
    } else {
      rapportDynamique.push({
        type: "intro",
        texte: `Consolidation terminée : ${resultat.rapport.nbFichiers} fichiers combinés pour un total de ${resultat.corps.length.toLocaleString("fr-FR")} lignes exploitables.`,
      });
    }

    // Statistiques de forme variable selon le type de colonne : seuls les champs lus ici sont décrits
    type StatsLues = {
      max?: number | null;
      moyenne?: number | null;
      topValeurs?: { valeur: string; pourcentage: number; effectif: number }[];
      distincts?: number;
      unicite?: number;
    };
    Object.entries(analyseStat.statistiques).forEach(([nomCol, info]) => {
      const s = info.stats as StatsLues;
      if (info.type === "numerique" && s) {
        const valMax = s.max != null ? s.max.toLocaleString("fr-FR") : "—";
        const valMoy = s.moyenne != null ? s.moyenne.toLocaleString("fr-FR") : "—";
        rapportDynamique.push({
          type: "numerique",
          texte: `Performance « ${nomCol} » : Moyenne constatée de ${valMoy} (avec un pic culminant à ${valMax}).`,
        });
      }

      if (info.type === "categorielle" && s && s.topValeurs && s.topValeurs.length > 0) {
        const top = s.topValeurs[0];
        rapportDynamique.push({
          type: "categorie",
          texte: `Pôle dominant sur « ${nomCol} » : « ${top.valeur} » représente ${top.pourcentage} % des enregistrements (${top.effectif.toLocaleString("fr-FR")} occurrences).`,
        });
      }

      if (info.type === "identifiant" && s) {
        rapportDynamique.push({
          type: "qualite",
          texte: `Répertoire « ${nomCol} » : ${(s.distincts ?? 0).toLocaleString("fr-FR")} entité(s) distincte(s) répertoriée(s) (unicité de ${s.unicite} %).`,
        });
      }
    });

    chargerDonnees(
      modeAssemblage === "jointure"
        ? `Jointure ${typeJointure} (${tableA.nom} ↔ ${tableB.nom})`
        : `Consolidation (${resultat.rapport.nbFichiers} fichiers)`,
      resultat.entetes,
      resultat.corps,
      analyseStat,
      rapportDynamique
    );

    router.push("/analyse");
  };

  const supprimerFichier = (index: number) => {
    setFichiersBruts((prev) => prev.filter((_, i) => i !== index));
    setResultat(null);
    setComparaison(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16 font-sans text-slate-800 dark:text-slate-100">
      {/* En-tête */}
      <section className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-800">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Consolidation & Réconciliation Avancée
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
            Fusion, Réconciliation & Audit des Données
          </h1>
          <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Combinez vos tableaux Excel et CSV par empilement vertical, réalisez des jointures relationnelles (Inter, Anti-gauche, Anti-droite) ou comparez 2 fichiers et plus, colonne par colonne, nombres et dates compris.
          </p>
        </div>
      </section>

      {/* Zone de dépôt Drag & Drop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all ${
              estEnGlissement
                ? "border-purple-600 bg-purple-50/70 dark:bg-purple-950/30 scale-[1.01]"
                : "border-slate-300 dark:border-slate-700 hover:border-purple-500 bg-white dark:bg-slate-900"
            }`}
          >
            <input
              type="file"
              multiple
              accept={EXTENSIONS_ACCEPTEES}
              onChange={(e) => void traiterFichiersDeposes(e.target.files)}
              className="hidden"
              id="fichiers-fusion-input"
            />
            <label htmlFor="fichiers-fusion-input" className="cursor-pointer flex flex-col items-center gap-3">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-colors ${
                  estEnGlissement ? "bg-purple-600 text-white" : "bg-purple-50 dark:bg-purple-950/40 text-purple-600"
                }`}
              >
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  {estEnGlissement ? "Relâchez vos fichiers ici !" : "Glissez vos fichiers ici ou cliquez pour parcourir"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Prise en charge de plusieurs fichiers Excel (.xlsx, .xls) et CSV</p>
              </div>
            </label>
          </div>

          {/* Liste des fichiers importés */}
          {fichiersBruts.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Files className="w-4 h-4 text-purple-600" />
                Fichiers prêts pour l&apos;opération ({fichiersBruts.length})
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {fichiersBruts.map((f, i) => (
                  <div key={`${f.nom}-${i}`} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 dark:text-slate-200 break-all">{f.nom}</span>
                        <span className="text-[11px] text-slate-400 ml-2">
                          ({f.corps.length.toLocaleString("fr-FR")} lignes · {f.entetes.length} colonnes)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => deplacerFichier(i, -1)}
                        disabled={i === 0}
                        title="Monter ce fichier"
                        aria-label={`Monter ${f.nom}`}
                        className="text-slate-400 hover:text-purple-600 disabled:opacity-30 p-1 rounded-lg transition cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deplacerFichier(i, 1)}
                        disabled={i === fichiersBruts.length - 1}
                        title="Descendre ce fichier"
                        aria-label={`Descendre ${f.nom}`}
                        className="text-slate-400 hover:text-purple-600 disabled:opacity-30 p-1 rounded-lg transition cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => supprimerFichier(i)}
                        title="Retirer ce fichier"
                        aria-label={`Retirer ${f.nom}`}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correspondance des colonnes (comparaison et empilement) */}
          {fichiersBruts.length >= 2 && modeAssemblage !== "jointure" && (
            <details className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 group" open>
              <summary className="cursor-pointer font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-purple-600" />
                Correspondance des colonnes
                <span className="normal-case tracking-normal font-normal text-slate-400">
                  ({communesComparaison.length} commune{communesComparaison.length > 1 ? "s" : ""} aux {fichiersBruts.length} fichiers)
                </span>
              </summary>
              <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                Les colonnes de « {fichiersBruts[0].nom} » servent de base. Datenza rapproche seul les noms différents
                (« CA » = « Chiffre d&apos;affaires ») et les colonnes aux mêmes valeurs. Corrigez ou complétez ici ce qu&apos;il
                n&apos;a pas pu deviner.
              </p>
              {descriptionRapprochements(unifiees).length > 0 && (
                <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/50">
                  Rapprochées malgré des noms différents : {descriptionRapprochements(unifiees).join(" · ")}
                </p>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase text-slate-400">
                      <th className="py-1.5 pr-2 font-bold whitespace-nowrap">{nomCourt(fichiersBruts[0].nom)}</th>
                      {fichiersBruts.slice(1).map((f, k) => (
                        <th key={`${f.nom}-${k}`} className="py-1.5 px-1 font-bold whitespace-nowrap">{nomCourt(f.nom)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {unifiees
                      .filter((u) => u.indices[0] !== -1)
                      .map((u) => (
                        <tr key={u.nom}>
                          <td className="py-1.5 pr-2 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {u.nom}
                            <span className="ml-1 text-[10px] font-normal text-slate-400">
                              {u.nature === "numerique" ? "nombre" : u.nature}
                            </span>
                          </td>
                          {fichiersBruts.slice(1).map((f, k) => {
                            const iFichier = k + 1;
                            const valeur = u.variantes[iFichier] || "";
                            return (
                              <td key={`${f.nom}-${k}`} className="py-1.5 px-1">
                                <select
                                  aria-label={`Colonne de ${f.nom} correspondant à ${u.nom}`}
                                  value={valeur}
                                  onChange={(e) => choisirCorrespondance(f.nom, u.nom, e.target.value || null)}
                                  className={`w-full min-w-[8rem] rounded-lg p-1.5 text-xs border ${
                                    valeur
                                      ? u.manuelle[iFichier]
                                        ? "border-purple-400 bg-purple-50 dark:bg-purple-950/30"
                                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                                      : "border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-slate-400"
                                  }`}
                                >
                                  <option value="">— aucune —</option>
                                  {f.entetes.map((h) => (
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
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Cadre violet : choisi à la main. Pointillés : aucune colonne trouvée, la colonne ne sera pas comparée.
              </p>
            </details>
          )}
        </div>

        {/* Panneau de configuration (Mode & Règles) */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-600" />
              Mode d&apos;assemblage des données
            </h3>

            {/* Sélecteur de Mode : Empilement vs Jointure */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] sm:text-xs font-bold">
              <button
                type="button"
                onClick={() => setModeAssemblage("empilement")}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  modeAssemblage === "empilement"
                    ? "bg-white dark:bg-slate-900 text-purple-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Empilement
              </button>

              <button
                type="button"
                onClick={() => setModeAssemblage("jointure")}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  modeAssemblage === "jointure"
                    ? "bg-white dark:bg-slate-900 text-purple-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <GitMerge className="w-3.5 h-3.5" />
                Jointure
              </button>

              <button
                type="button"
                onClick={() => setModeAssemblage("comparaison")}
                className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  modeAssemblage === "comparaison"
                    ? "bg-white dark:bg-slate-900 text-purple-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                Comparaison
              </button>
            </div>

            {/* CONFIGURATION DE LA COMPARAISON (2 FICHIERS OU PLUS) */}
            {modeAssemblage === "comparaison" && (
              <div className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                {fichiersBruts.length < 2 ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60">
                    Ajoutez au moins 2 fichiers pour les comparer. Vous pouvez en comparer autant que vous voulez.
                  </p>
                ) : communesComparaison.length === 0 ? (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60">
                    Ces fichiers ne partagent aucune colonne : comparaison impossible.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Les {fichiersBruts.length} fichiers sont comparés sur leurs {communesComparaison.length} colonnes communes :{" "}
                      {communesComparaison.filter((c) => c.nature === "numerique").length} numérique(s),{" "}
                      {communesComparaison.filter((c) => c.nature === "date").length} date(s),{" "}
                      {communesComparaison.filter((c) => c.nature === "texte").length} texte.
                    </p>
                    <div>
                      <label htmlFor="cle-comparaison" className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Rapprocher les lignes par
                      </label>
                      <select
                        id="cle-comparaison"
                        value={cleComparaison || SANS_CLE}
                        onChange={(e) => setCleComparaisonChoisie(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-purple-700 dark:text-purple-300"
                      >
                        <option value={SANS_CLE}>Aucune clé : comparer les totaux</option>
                        {communesComparaison.map((c) => (
                          <option key={c.nom} value={c.nom}>
                            {c.variantes.filter((v, i, t) => t.indexOf(v) === i).join(" ↔ ")} (
                            {c.nature === "numerique" ? "nombre" : c.nature})
                          </option>
                        ))}
                      </select>
                      {evaluationCle && (
                        <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 mt-1.5">
                          {evaluationCle.taux
                            .map((t, k) =>
                              k === 0
                                ? null
                                : `${Math.round(t * 100)} % des lignes de « ${nomCourt(fichiersBruts[0].nom)} » retrouvent leur clé dans « ${nomCourt(fichiersBruts[k].nom)} »`
                            )
                            .filter(Boolean)
                            .join(" · ")}
                          {evaluationCle.unicite < 0.9 && " — valeurs répétées : les lignes seront regroupées par valeur."}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        Un code ou une référence compare ligne à ligne. Une colonne comme « Région » ou « Mois » compare les
                        totaux par groupe.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="ref-comparaison" className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Fichier de référence (base des écarts)
                      </label>
                      <select
                        id="ref-comparaison"
                        value={indexReference}
                        onChange={(e) => setReferenceComparaison(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold"
                      >
                        {fichiersBruts.map((f, i) => (
                          <option key={i} value={i}>
                            {f.nom}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                {erreurComparaison && (
                  <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60">
                    {erreurComparaison}
                  </p>
                )}
              </div>
            )}

            {/* CONFIGURATION DE LA JOINTURE RELATIONNELLE */}
            {modeAssemblage === "jointure" && (
              <div className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                {fichiersBruts.length < 2 ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60">
                    Veuillez ajouter au moins 2 fichiers pour activer la comparaison relationnelle.
                  </p>
                ) : (
                  <>
                    {fichiersBruts.length > 2 && (
                      <p className="text-[11px] text-slate-500 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
                        Une jointure relie 2 fichiers (A et B). Pour confronter les {fichiersBruts.length} fichiers ensemble,
                        choisissez le mode « Comparaison ».
                      </p>
                    )}
                    {/* Choix des tables et des clés */}
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                          Table A (Gauche) & Clé
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <select
                            value={idxTableA}
                            onChange={(e) => setIdxTableA(Number(e.target.value))}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold truncate"
                          >
                            {fichiersBruts.map((f, i) => (
                              <option key={i} value={i} disabled={i === idxTableB}>
                                {f.nom}
                              </option>
                            ))}
                          </select>

                          <select
                            value={cleActiveA}
                            onChange={(e) => setCleChoisieA(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-purple-700 dark:text-purple-300 truncate"
                          >
                            {colonnesA.map((h) => (
                              <option key={h} value={h}>
                                Clé : {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                          Table B (Droite) & Clé
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <select
                            value={idxTableB}
                            onChange={(e) => setIdxTableB(Number(e.target.value))}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold truncate"
                          >
                            {fichiersBruts.map((f, i) => (
                              <option key={i} value={i} disabled={i === idxTableA}>
                                {f.nom}
                              </option>
                            ))}
                          </select>

                          <select
                            value={cleActiveB}
                            onChange={(e) => setCleChoisieB(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-purple-700 dark:text-purple-300 truncate"
                          >
                            {colonnesB.map((h) => (
                              <option key={h} value={h}>
                                Clé : {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {cleProposeeJointure &&
                      cleProposeeJointure.colonne.variantes[0] === cleActiveA &&
                      cleProposeeJointure.colonne.variantes[1] === cleActiveB && (
                        <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                          Clé proposée : {cleActiveA} ↔ {cleActiveB} — {Math.round(cleProposeeJointure.taux[1] * 100)} % des lignes de A
                          retrouvent leur clé dans B.
                        </p>
                      )}

                    {/* Types de jointures Power Query */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">
                        Type de réconciliation
                      </label>
                      <div className="grid grid-cols-1 gap-1.5">
                        <label
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                            typeJointure === "inter"
                              ? "border-purple-600 bg-purple-50/60 dark:bg-purple-950/40"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <input
                            type="radio"
                            name="typeJointure"
                            checked={typeJointure === "inter"}
                            onChange={() => setTypeJointure("inter")}
                            className="text-purple-600 mt-0.5"
                          />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 block">
                              Interne (Inter)
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Conserve uniquement les lignes communes présentes à la fois dans A et B.
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                            typeJointure === "anti_gauche"
                              ? "border-purple-600 bg-purple-50/60 dark:bg-purple-950/40"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <input
                            type="radio"
                            name="typeJointure"
                            checked={typeJointure === "anti_gauche"}
                            onChange={() => setTypeJointure("anti_gauche")}
                            className="text-purple-600 mt-0.5"
                          />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 block">
                              Anti-gauche (Écarts propres à A)
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Isole les lignes du fichier A qui n&apos;ont aucune correspondance dans B (ex. impayés, manques).
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                            typeJointure === "anti_droite"
                              ? "border-purple-600 bg-purple-50/60 dark:bg-purple-950/40"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <input
                            type="radio"
                            name="typeJointure"
                            checked={typeJointure === "anti_droite"}
                            onChange={() => setTypeJointure("anti_droite")}
                            className="text-purple-600 mt-0.5"
                          />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 block">
                              Anti-droite (Écarts propres à B)
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Isole les lignes du fichier B absentes de A (ex. nouveaux arrivants, orphelins).
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                            typeJointure === "gauche_externe"
                              ? "border-purple-600 bg-purple-50/60 dark:bg-purple-950/40"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <input
                            type="radio"
                            name="typeJointure"
                            checked={typeJointure === "gauche_externe"}
                            onChange={() => setTypeJointure("gauche_externe")}
                            className="text-purple-600 mt-0.5"
                          />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 block">
                              Gauche externe (Enrichissement)
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Conserve l&apos;intégralité de A et y rattache les colonnes de B lorsqu&apos;elles existent.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* RÈGLES DE NETTOYAGE MUTUELLES */}
            <div className={`space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs ${modeAssemblage === "comparaison" ? "hidden" : ""}`}>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.supprimerDoublons}
                  onChange={(e) => setOptions({ ...options, supprimerDoublons: e.target.checked })}
                  className="rounded text-purple-600 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Purger les doublons stricts
                  </span>
                  <span className="text-[11px] text-slate-400">Élimine les lignes strictement identiques.</span>
                </div>
              </label>

              {modeAssemblage === "empilement" && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.alignerColonnesSimilaires}
                    onChange={(e) =>
                      setOptions({ ...options, alignerColonnesSimilaires: e.target.checked })
                    }
                    className="rounded text-purple-600 mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Aligner les en-têtes similaires
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Réunit « Montant TTC » et « montant_ttc » dans la même colonne.
                    </span>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.harmoniserDates}
                  onChange={(e) => setOptions({ ...options, harmoniserDates: e.target.checked })}
                  className="rounded text-purple-600 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Harmoniser les dates (ISO)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Normalise au format AAAA-MM-JJ sans toucher aux montants.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.harmoniserFormatsNumeriques}
                  onChange={(e) =>
                    setOptions({ ...options, harmoniserFormatsNumeriques: e.target.checked })
                  }
                  className="rounded text-purple-600 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Corriger les nombres corrompus
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Nettoie symboles monétaires (€, FCFA), espaces et virgules.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.nettoyerEspaces}
                  onChange={(e) => setOptions({ ...options, nettoyerEspaces: e.target.checked })}
                  className="rounded text-purple-600 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    Supprimer les espaces parasites
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Élimine les espaces de début, fin et doubles espaces.
                  </span>
                </div>
              </label>
            </div>

            <button
              onClick={executerOperation}
              disabled={fichiersBruts.length < 2 || chargement}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {modeAssemblage === "jointure"
                ? "Lancer la Réconciliation"
                : modeAssemblage === "comparaison"
                ? `Comparer les ${Math.max(fichiersBruts.length, 2)} fichiers`
                : "Lancer la Fusion & Nettoyage"}
            </button>
          </div>
        </div>
      </div>

      {/* RÉSULTATS DE LA COMPARAISON */}
      {comparaison && (
        <section className="space-y-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Fichiers comparés</span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{comparaison.bilan.nbFichiers}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Référence : {comparaison.bilan.reference}</p>
            </div>
            {comparaison.bilan.cles.length > 0 ? (
              <>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Identiques</span>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                    {comparaison.bilan.identiques.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">sur {comparaison.bilan.nbCles.toLocaleString("fr-FR")} « {comparaison.bilan.cles.join(" + ")} »</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-rose-500 uppercase">Écarts de valeurs</span>
                  <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
                    {comparaison.bilan.avecEcarts.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Présents partout, valeurs différentes</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Absences</span>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
                    {comparaison.bilan.incompletes.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {comparaison.bilan.parFichier
                      .filter((p) => p.absentes > 0)
                      .map((p) => `${p.absentes} absente(s) de ${p.nom}`)
                      .join(" · ") || "Aucune"}
                  </p>
                </div>
              </>
            ) : (
              <div className="col-span-1 sm:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-indigo-500 uppercase">Colonnes numériques comparées</span>
                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{comparaison.bilan.nbCles}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {comparaison.bilan.avecEcarts} présentent un écart entre fichiers
                </p>
              </div>
            )}
          </div>

          {comparaison.bilan.lignesRegroupees > 0 && (
            <p className="text-[11px] text-slate-500 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              {comparaison.bilan.lignesRegroupees.toLocaleString("fr-FR")} ligne(s) partageant la même valeur de « {comparaison.bilan.cles.join(" + ")} » dans
              un même fichier ont été regroupées : montants et quantités additionnés, prix et taux moyennés.
            </p>
          )}
          {comparaison.bilan.doublonsIgnores.map((d) => (
            <p key={d.nom} className="text-[11px] text-amber-700 dark:text-amber-400 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60">
              Clés en double dans « {d.nom} » : {d.nbLignes} ligne(s) saisie(s) deux fois à l&apos;identique, comptée(s) une seule
              fois ({d.cles.slice(0, 6).join(", ")}{d.cles.length > 6 ? "…" : ""}).
            </p>
          ))}
          {comparaison.bilan.colonnesIgnorees.length > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60">
              Colonnes absentes d&apos;au moins un fichier, non comparées : {comparaison.bilan.colonnesIgnorees.join(", ")}.
            </p>
          )}

          {/* Totaux par fichier pour chaque colonne numérique */}
          {comparaison.bilan.cles.length > 0 && comparaison.synthese.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                <span className="font-bold text-xs text-slate-700 dark:text-slate-300">Totaux par fichier (colonnes numériques)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                      <th className="p-3 whitespace-nowrap">Colonne</th>
                      {comparaison.synthese[0].parFichier.map((p) => (
                        <th key={p.nom} className="p-3 whitespace-nowrap text-right">{p.nom}</th>
                      ))}
                      {comparaison.synthese[0].ecarts
                        .filter((e) => e.nom !== comparaison.bilan.reference)
                        .map((e) => (
                          <th key={e.nom} className="p-3 whitespace-nowrap text-right">Écart {e.nom}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                    {comparaison.synthese.map((s) => (
                      <tr key={s.colonne}>
                        <td className="p-3 whitespace-nowrap font-sans font-semibold text-slate-800 dark:text-slate-200">
                          {s.colonne} <span className="text-slate-400 font-normal">({s.operation})</span>
                        </td>
                        {s.parFichier.map((p) => (
                          <td key={p.nom} className="p-3 whitespace-nowrap text-right">{fmtNombre(p.valeur)}</td>
                        ))}
                        {s.ecarts
                          .filter((e) => e.nom !== comparaison.bilan.reference)
                          .map((e) => (
                            <td
                              key={e.nom}
                              className={`p-3 whitespace-nowrap text-right ${
                                !e.ecart ? "text-slate-500" : e.ecart > 0 ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {e.ecart !== null && e.ecart > 0 ? "+" : ""}
                              {fmtNombre(e.ecart)}
                              {e.variationPct !== null ? ` (${e.variationPct > 0 ? "+" : ""}${fmtNombre(e.variationPct)} %)` : ""}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center gap-2 bg-slate-50/50 dark:bg-slate-800/40">
              <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                {comparaison.bilan.cles.length ? "Aperçu : écarts et absences en premier" : "Comparaison des totaux"}
              </span>
              <span className="text-[11px] text-slate-400">Total : {comparaison.corps.length.toLocaleString("fr-FR")} lignes</span>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                    {comparaison.entetes.map((h, i) => (
                      <th key={i} className="p-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {comparaison.corps.slice(0, 50).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {typeof cell === "number" ? fmtNombre(cell) : String(cell ?? "") || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              onClick={telechargerExcelConsolide}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 shadow transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Télécharger la comparaison (.xlsx)
            </button>
            <button
              onClick={analyseCompareeFichiers}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-bold text-xs rounded-xl border border-purple-300 dark:border-purple-800 shadow-sm transition cursor-pointer"
            >
              <Scale className="w-4 h-4" />
              Analyse comparée des fichiers
            </button>
            <button
              onClick={analyserComparaison}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-lg hover:shadow-purple-500/25 transition cursor-pointer"
            >
              <BarChart2 className="w-4 h-4" />
              Analyser le tableau des écarts
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* RÉSULTATS DU TRAITEMENT & SORTIES */}
      {resultat && (
        <section className="space-y-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {resultat.rapport.mode === "jointure" ? "Lignes Résultantes" : "Volume Consolidé"}
              </span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {resultat.rapport.lignesFinales.toLocaleString("fr-FR")} lignes
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sur {resultat.rapport.lignesInitialesTotal.toLocaleString("fr-FR")} lignes initiales
              </p>
            </div>

            {resultat.rapport.mode === "jointure" ? (
              <>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-purple-600 uppercase">Correspondances</span>
                  <p className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1">
                    {(resultat.rapport.nbCorrespondances || 0).toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Paires clés réconciliées</p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Écarts A (Orphelins)</span>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
                    {(resultat.rapport.nbOrphelinsA || 0).toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Absents du second fichier</p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-indigo-500 uppercase">Colonnes Finales</span>
                  <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                    {resultat.entetes.length} colonnes
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Structure de sortie</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-rose-500 uppercase">Doublons Purgés</span>
                  <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
                    {resultat.rapport.doublonsSupprimes.toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Lignes redondantes éliminées</p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase">Nombres & Dates</span>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {(resultat.rapport.nombresHarmonises + resultat.rapport.datesHarmonisees).toLocaleString("fr-FR")}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Formats standardisés</p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-indigo-500 uppercase">Colonnes Normalisées</span>
                  <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                    {resultat.entetes.length} colonnes
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {resultat.rapport.colonnesFusionnees.length} variantes alignées
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Tableau d'aperçu */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
              <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                Aperçu des 10 premières lignes résultantes
              </span>
              <span className="text-[11px] text-slate-400">Total : {resultat.corps.length} enregistrements</span>
            </div>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                    {resultat.entetes.map((h, i) => (
                      <th key={i} className="p-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {resultat.corps.slice(0, 10).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {String(cell ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Boutons d'actions */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              onClick={telechargerExcelConsolide}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 shadow transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Télécharger le résultat Excel (.xlsx)
            </button>

            <button
              onClick={basculerVersAnalyse}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-lg hover:shadow-purple-500/25 transition cursor-pointer"
            >
              <BarChart2 className="w-4 h-4" />
              Lancer l&apos;Analyse Datenza
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
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
} from "lucide-react";
import { useData } from "../context/DataContext";
import BlocInterpretation from "../components/BlocInterpretation";
import { interpreterFusion } from "../../lib/analyse/interpretationFusion";
import {
  apercuCorrespondance,
  colonnesComparables,
  suggererCles,
  fusionnerEtNettoyer,
  type FichierEntree,
  type OptionsNettoyage,
  type ResultatFusionNettoyage,
  type ModeAssemblage,
  type TypeJointure,
} from "../../lib/analyse/fusion";
import { analyserColonnes } from "../../lib/analyse/analyse";

const STYLE_STATUT: Record<string, string> = {
  Identique: "font-bold text-emerald-600 dark:text-emerald-400",
  "Différent": "font-bold text-rose-600 dark:text-rose-400",
  "Absent de A": "font-bold text-amber-600 dark:text-amber-400",
  "Absent de B": "font-bold text-amber-600 dark:text-amber-400",
};

const TYPES_JOINTURE: { id: TypeJointure; titre: string; libelle: string; description: string }[] = [
  {
    id: "comparaison",
    titre: "Comparer les valeurs (A ↔ B)",
    libelle: "Comparaison des valeurs",
    description: "Pour chaque clé, indique si les colonnes de même nom ont les mêmes valeurs dans A et B, et chiffre les écarts (ex. montant facturé ≠ montant payé).",
  },
  { id: "inter", titre: "Lignes communes (Interne)", libelle: "Correspondances communes", description: "Garde uniquement les lignes présentes à la fois dans A et B, avec les colonnes des deux fichiers." },
  { id: "anti_gauche", titre: "Présentes seulement dans A", libelle: "Lignes propres à A", description: "Lignes de A sans correspondance dans B (ex. factures non payées)." },
  { id: "anti_droite", titre: "Présentes seulement dans B", libelle: "Lignes propres à B", description: "Lignes de B sans correspondance dans A (ex. paiements sans facture)." },
  { id: "gauche_externe", titre: "Compléter A avec B", libelle: "Enrichissement de A", description: "Garde toutes les lignes de A et y ajoute les colonnes de B quand la clé existe." },
  { id: "externe_complete", titre: "Tout garder (A + B)", libelle: "Jointure complète", description: "Toutes les lignes des deux fichiers, rapprochées quand c'est possible ; rien n'est perdu." },
];

export default function FusionNettoyagePage() {
  const router = useRouter();
  const { chargerDonnees } = useData();

  const [fichiersBruts, setFichiersBruts] = useState<FichierEntree[]>([]);
  const [chargement, setChargement] = useState(false);
  const [estEnGlissement, setEstEnGlissement] = useState(false);
  const [resultat, setResultat] = useState<ResultatFusionNettoyage | null>(null);

  // Configuration de l'assemblage
  const [modeAssemblage, setModeAssemblage] = useState<ModeAssemblage>("jointure");
  const [idxTableA, setIdxTableA] = useState<number>(0);
  const [idxTableB, setIdxTableB] = useState<number>(1);
  const [cleChoisieA, setCleChoisieA] = useState<string>("");
  const [cleChoisieB, setCleChoisieB] = useState<string>("");
  const [typeJointure, setTypeJointure] = useState<TypeJointure>("comparaison");
  // Colonnes décochées pour la comparaison (toutes cochées par défaut)
  const [colonnesExclues, setColonnesExclues] = useState<string[]>([]);

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

  // Déduction automatique des clés par défaut
  const tableA = fichiersBruts[idxTableA] || fichiersBruts[0];
  const tableB = fichiersBruts[idxTableB] || fichiersBruts[1];

  const colonnesA = useMemo(() => tableA?.entetes || [], [tableA]);
  const colonnesB = useMemo(() => tableB?.entetes || [], [tableB]);

  // Clés proposées d'après les valeurs réellement communes aux deux fichiers
  const suggestion = useMemo(() => (tableA && tableB && tableA !== tableB ? suggererCles(tableA, tableB) : null), [tableA, tableB]);

  const cleActiveA = useMemo(() => {
    if (colonnesA.includes(cleChoisieA)) return cleChoisieA;
    if (suggestion && colonnesA.includes(suggestion.cleA)) return suggestion.cleA;
    const prio = colonnesA.find((h) => /(id|code|ref|matricule|numero)/i.test(h));
    return prio || colonnesA[0] || "";
  }, [colonnesA, cleChoisieA, suggestion]);

  const cleActiveB = useMemo(() => {
    if (colonnesB.includes(cleChoisieB)) return cleChoisieB;
    if (suggestion && suggestion.cleA === cleActiveA && colonnesB.includes(suggestion.cleB)) return suggestion.cleB;
    const prioCommune = colonnesB.find((h) => h.toLowerCase() === cleActiveA.toLowerCase());
    if (prioCommune) return prioCommune;
    const prio = colonnesB.find((h) => /(id|code|ref|matricule|numero)/i.test(h));
    return prio || colonnesB[0] || "";
  }, [colonnesB, cleChoisieB, cleActiveA, suggestion]);

  const comparables = useMemo(
    () => (tableA && tableB && tableA !== tableB ? colonnesComparables(tableA, tableB, cleActiveA, cleActiveB) : []),
    [tableA, tableB, cleActiveA, cleActiveB]
  );

  // Aperçu du rapprochement avant de lancer
  const apercu = useMemo(
    () => (tableA && tableB && tableA !== tableB ? apercuCorrespondance(tableA, tableB, cleActiveA, cleActiveB) : null),
    [tableA, tableB, cleActiveA, cleActiveB]
  );

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
              colonnesAComparer: comparables.filter((c) => !colonnesExclues.includes(c)),
            }
          : undefined,
      ...options,
    };

    const res = fusionnerEtNettoyer(fichiersBruts, optionsCompletes);
    setResultat(res);
  };

  const telechargerExcelConsolide = () => {
    if (!resultat) return;
    const donneeAOA = [resultat.entetes, ...resultat.corps];
    const feuille = XLSX.utils.aoa_to_sheet(donneeAOA);
    const classeur = XLSX.utils.book_new();
    const nomFeuille = modeAssemblage === "jointure" ? `Jointure_${typeJointure}` : "Données Consolidées";
    XLSX.utils.book_append_sheet(classeur, feuille, nomFeuille);
    XLSX.writeFile(classeur, `datenza_${nomFeuille.toLowerCase()}.xlsx`);
  };

  // Bascule vers l'analyse unifiée
  const basculerVersAnalyse = () => {
    if (!resultat) return;

    const analyseStat = analyserColonnes(resultat.entetes, resultat.corps, resultat.entetes);
    const rapportDynamique: BlocRapport[] = [];

    if (resultat.rapport.mode === "jointure") {
      const typeLabel = TYPES_JOINTURE.find((t) => t.id === typeJointure)?.libelle ?? typeJointure;

      rapportDynamique.push({
        type: "intro",
        texte: `Réconciliation ${typeLabel} terminée : ${resultat.corps.length.toLocaleString("fr-FR")} lignes extraites sur les clés « ${cleActiveA} » et « ${cleActiveB} ».`,
      });

      if (resultat.rapport.nbCorrespondances !== undefined) {
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
            Combinez vos tableaux Excel et CSV par empilement vertical ou réalisez des jointures relationnelles (Inter, Anti-gauche, Anti-droite) pour traquer les écarts et les correspondances.
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
                  <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{f.nom}</span>
                        <span className="text-[11px] text-slate-400 ml-2">
                          ({f.corps.length.toLocaleString("fr-FR")} lignes · {f.entetes.length} colonnes)
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => supprimerFichier(i)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
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
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
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
                Jointure relationnelle
              </button>
            </div>

            {/* CONFIGURATION DE LA JOINTURE RELATIONNELLE */}
            {modeAssemblage === "jointure" && (
              <div className="space-y-3.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                {fichiersBruts.length < 2 ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60">
                    Veuillez ajouter au moins 2 fichiers pour activer la comparaison relationnelle.
                  </p>
                ) : (
                  <>
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
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold truncate !min-w-0 w-full"
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
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-purple-700 dark:text-purple-300 truncate !min-w-0 w-full"
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
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold truncate !min-w-0 w-full"
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
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-purple-700 dark:text-purple-300 truncate !min-w-0 w-full"
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

                    {/* Aperçu du rapprochement */}
                    {apercu && (
                      <div
                        className={`p-2.5 rounded-lg border text-[11px] leading-relaxed ${
                          apercu.partA < 0.2
                            ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-300"
                            : "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/60 dark:text-emerald-300"
                        }`}
                      >
                        <strong>{Math.round(apercu.partA * 100)} %</strong> des lignes de A retrouvent leur clé dans B, et{" "}
                        <strong>{Math.round(apercu.partB * 100)} %</strong> des lignes de B dans A.
                        {apercu.partA < 0.2 && " Très peu de correspondances : ces deux colonnes ne contiennent sans doute pas la même information."}
                        {suggestion && suggestion.cleA === cleActiveA && suggestion.cleB === cleActiveB && (
                          <span className="block text-[10px] opacity-80 mt-0.5">Clés proposées automatiquement d&apos;après les valeurs communes aux deux fichiers.</span>
                        )}
                      </div>
                    )}

                    {/* Types de réconciliation */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">
                        Que voulez-vous obtenir ?
                      </label>
                      <div className="grid grid-cols-1 gap-1.5">
                        {TYPES_JOINTURE.map((t) => (
                          <label
                            key={t.id}
                            className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                              typeJointure === t.id
                                ? "border-purple-600 bg-purple-50/60 dark:bg-purple-950/40"
                                : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            <input
                              type="radio"
                              name="typeJointure"
                              checked={typeJointure === t.id}
                              onChange={() => setTypeJointure(t.id)}
                              className="text-purple-600 mt-0.5"
                            />
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-100 block">{t.titre}</span>
                              <span className="text-[10px] text-slate-500">{t.description}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {typeJointure === "comparaison" && (
                      <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Colonnes à comparer</p>
                        {comparables.length === 0 ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            Aucune colonne ne porte le même nom dans les deux fichiers : seules les clés présentes ou absentes seront comparées. Renommez les colonnes à comparer pour qu&apos;elles aient le même nom.
                          </p>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {comparables.map((c) => {
                                const coche = !colonnesExclues.includes(c);
                                return (
                                  <label
                                    key={c}
                                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] cursor-pointer ${
                                      coche ? "border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200" : "border-slate-200 text-slate-500 dark:border-slate-700"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={coche}
                                      onChange={() => setColonnesExclues((l) => (coche ? [...l, c] : l.filter((x) => x !== c)))}
                                      className="rounded text-purple-600"
                                    />
                                    {c}
                                  </label>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-slate-500">Décochez les colonnes qui n&apos;ont pas à être identiques (par exemple une date de facture et une date de paiement).</p>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* RÈGLES DE NETTOYAGE MUTUELLES */}
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
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
              {modeAssemblage === "jointure" ? "Lancer la Réconciliation" : "Lancer la Fusion & Nettoyage"}
            </button>
          </div>
        </div>
      </div>

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
              (resultat.rapport.typeJointure === "comparaison"
                ? [
                    { titre: "Identiques", valeur: resultat.rapport.nbIdentiques ?? 0, detail: "Mêmes valeurs dans A et B", couleur: "text-emerald-600 dark:text-emerald-400" },
                    { titre: "Différentes", valeur: resultat.rapport.nbDifferentes ?? 0, detail: "Au moins une valeur diffère", couleur: "text-rose-600 dark:text-rose-400" },
                    {
                      titre: "Absentes",
                      valeur: (resultat.rapport.nbOrphelinsA ?? 0) + (resultat.rapport.nbOrphelinsB ?? 0),
                      detail: `${(resultat.rapport.nbOrphelinsA ?? 0).toLocaleString("fr-FR")} seulement dans A · ${(resultat.rapport.nbOrphelinsB ?? 0).toLocaleString("fr-FR")} seulement dans B`,
                      couleur: "text-amber-600 dark:text-amber-400",
                    },
                  ]
                : [
                    { titre: "Rapprochées", valeur: resultat.rapport.nbCorrespondances ?? 0, detail: "Lignes de A retrouvées dans B", couleur: "text-purple-700 dark:text-purple-300" },
                    { titre: "Seulement dans A", valeur: resultat.rapport.nbOrphelinsA ?? 0, detail: tableA?.nom ?? "", couleur: "text-amber-600 dark:text-amber-400" },
                    { titre: "Seulement dans B", valeur: resultat.rapport.nbOrphelinsB ?? 0, detail: tableB?.nom ?? "", couleur: "text-indigo-600 dark:text-indigo-400" },
                  ]
              ).map((c) => (
                <div key={c.titre} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{c.titre}</span>
                  <p className={`text-xl font-black mt-1 ${c.couleur}`}>{c.valeur.toLocaleString("fr-FR")}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{c.detail}</p>
                </div>
              ))
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

          {/* Bilan en clair */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-sm">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Ce qu&apos;il faut retenir</p>
            {(() => {
              const i = interpreterFusion(resultat.rapport, tableA?.nom ?? "A", tableB?.nom ?? "B");
              return (
                <BlocInterpretation
                  guide={i.guide}
                  titreGuide={resultat.rapport.mode === "jointure" ? "Comment fonctionne la réconciliation ?" : "Comment fonctionne l'empilement ?"}
                  constats={i.complements}
                  resume={i.resume}
                  pistes={i.pistes}
                />
              );
            })()}
          </div>

          {/* Tableau d'aperçu */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
              <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                Aperçu des 10 premières lignes{resultat.rapport.typeJointure === "comparaison" ? " (les écarts en premier)" : ""}
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
                        <td
                          key={cIdx}
                          className={`p-3 whitespace-nowrap ${
                            cIdx === 0 && resultat.rapport.typeJointure === "comparaison"
                              ? STYLE_STATUT[String(cell)] ?? "text-slate-700 dark:text-slate-300"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
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
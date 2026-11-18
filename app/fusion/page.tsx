"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { lireFichier, EXTENSIONS_ACCEPTEES } from "../../lib/import/lecture";
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
import CorrespondanceColonnes from "../components/CorrespondanceColonnes";
import { appliquerCorrespondance, suggererCorrespondance } from "../../lib/analyse/correspondance";
import { BoutonAnalyseComparee, ReglagesComparaisonMulti, ResultatsComparaisonMulti } from "../components/ComparaisonMulti";
import { assemblerComparaison, colonnesCommunesMulti, comparerPlusieursFichiers, type ResultatMultiComparaison } from "../../lib/analyse/comparaison";
import { interpreterFusion } from "../../lib/analyse/interpretationFusion";
import {
  apercuCorrespondance,
  colonneCorrespondante,
  colonnesComparables,
  suggererCles,
  fusionnerEtNettoyer,
  type FichierEntree,
  type OptionsNettoyage,
  type ResultatFusionNettoyage,
  type ModeAssemblage,
  type TypeJointure,
} from "../../lib/analyse/fusion";

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
  const { chargerEtAnalyser } = useData();

  const [fichiersBruts, setFichiersBruts] = useState<FichierEntree[]>([]);
  const [chargement, setChargement] = useState(false);
  const [estEnGlissement, setEstEnGlissement] = useState(false);
  const [resultat, setResultat] = useState<ResultatFusionNettoyage | null>(null);

  // Configuration de l'assemblage
  const [modeAssemblage, setModeAssemblageBrut] = useState<ModeAssemblage | "multi">("jointure");
  const [resultatMulti, setResultatMulti] = useState<ResultatMultiComparaison | null>(null);
  // Comparaison à plusieurs : ordre des fichiers, clé choisie par fichier (par nom de fichier), colonnes décochées
  const [ordreMulti, setOrdreMulti] = useState<number[]>([]);
  const [clesMultiChoisies, setClesMultiChoisies] = useState<Record<string, string>>({});
  const [colonnesExcluesMulti, setColonnesExcluesMulti] = useState<string[]>([]);
  // Correspondances corrigées à la main, par couple « référence>fichier » : colonne de référence -> colonne choisie (null = aucune)
  const [correspChoisies, setCorrespChoisies] = useState<Record<string, Record<string, string | null>>>({});
  const setModeAssemblage = (m: ModeAssemblage | "multi") => {
    setModeAssemblageBrut(m);
    setResultat(null);
    setResultatMulti(null);
  };
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
    doublonsEntreFichiers: boolean;
    harmoniserFormatsNumeriques: boolean;
    harmoniserDates: boolean;
    nettoyerEspaces: boolean;
    remplirValeursVides: boolean;
    valeurRemplacementVide: string;
    alignerColonnesSimilaires: boolean;
  }>({
    supprimerDoublons: true,
    doublonsEntreFichiers: false,
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


  // Aperçu du rapprochement avant de lancer
  const apercu = useMemo(
    () => (tableA && tableB && tableA !== tableB ? apercuCorrespondance(tableA, tableB, cleActiveA, cleActiveB) : null),
    [tableA, tableB, cleActiveA, cleActiveB]
  );

  // Ordre effectif : celui choisi, complété des fichiers ajoutés depuis
  const ordre = useMemo(() => {
    const valides = ordreMulti.filter((i) => i < fichiersBruts.length);
    return [...valides, ...fichiersBruts.map((_, i) => i).filter((i) => !valides.includes(i))];
  }, [ordreMulti, fichiersBruts]);
  const fichiersOrdonnes = useMemo(() => ordre.map((i) => fichiersBruts[i]), [ordre, fichiersBruts]);
  // Clé de chaque fichier : choisie, sinon proposée d'après les valeurs communes avec le premier fichier
  const clesMulti = useMemo(() => {
    if (fichiersOrdonnes.length < 2) return [];
    const premier = fichiersOrdonnes[0];
    const cle0 =
      (premier.entetes.includes(clesMultiChoisies[premier.nom]) && clesMultiChoisies[premier.nom]) ||
      suggererCles(premier, fichiersOrdonnes[1])?.cleA ||
      premier.entetes[0];
    return fichiersOrdonnes.map((f, pos) => {
      if (pos === 0) return cle0;
      const choisie = clesMultiChoisies[f.nom];
      if (choisie && f.entetes.includes(choisie)) return choisie;
      return colonneCorrespondante(premier, cle0, f) ?? f.entetes[0];
    });
  }, [fichiersOrdonnes, clesMultiChoisies]);

  // Correspondance des colonnes : un fichier de référence, et pour chacun des autres la colonne qui désigne la même chose
  const indexRef = modeAssemblage === "jointure" ? idxTableA : modeAssemblage === "multi" ? (ordre[0] ?? 0) : 0;
  const indicesAutres = useMemo(
    () => (modeAssemblage === "jointure" ? [idxTableB] : ordre.filter((i) => i !== indexRef)).filter((i) => i < fichiersBruts.length && i !== indexRef),
    [modeAssemblage, idxTableB, ordre, indexRef, fichiersBruts.length]
  );
  const cleDuFichier = useCallback(
    (i: number): string | undefined =>
      modeAssemblage === "jointure" ? (i === idxTableA ? cleActiveA : i === idxTableB ? cleActiveB : undefined) : modeAssemblage === "multi" ? clesMulti[ordre.indexOf(i)] : undefined,
    [modeAssemblage, idxTableA, idxTableB, cleActiveA, cleActiveB, clesMulti, ordre]
  );
  const correspondances = useMemo(() => {
    const ref = fichiersBruts[indexRef];
    const res: Record<number, Record<string, string | null>> = {};
    if (!ref) return res;
    const exclusRef = [cleDuFichier(indexRef)].filter(Boolean) as string[];
    for (const i of indicesAutres) {
      const autre = fichiersBruts[i];
      const exclus = [cleDuFichier(i)].filter(Boolean) as string[];
      const proposee = suggererCorrespondance(ref, autre, exclusRef, exclus);
      const choisie = correspChoisies[`${indexRef}>${i}`] ?? {};
      const fusion: Record<string, string | null> = {};
      for (const c of Object.keys(proposee)) {
        const v = c in choisie ? choisie[c] : proposee[c];
        fusion[c] = v && autre.entetes.includes(v) && !exclus.includes(v) ? v : null;
      }
      // Une même colonne ne peut correspondre qu'à une seule colonne de référence (le choix manuel l'emporte)
      const vues = new Set<string>();
      // Chaque colonne de référence n'est examinée qu'une fois : les choix manuels d'abord, puis les propositions
      for (const c of new Set([...Object.keys(choisie).filter((k) => k in fusion), ...Object.keys(fusion)])) {
        const v = fusion[c];
        if (!v) continue;
        if (vues.has(v)) fusion[c] = null;
        else vues.add(v);
      }
      res[i] = fusion;
    }
    return res;
  }, [fichiersBruts, indexRef, indicesAutres, cleDuFichier, correspChoisies]);
  // Fichiers avec les colonnes rapprochées renommées : c'est sur eux que portent comparaison, fusion et analyse comparée
  const fichiersEffectifs = useMemo(
    () => fichiersBruts.map((f, i) => (correspondances[i] ? appliquerCorrespondance(f, correspondances[i]) : f)),
    [fichiersBruts, correspondances]
  );
  const tableAEff = fichiersEffectifs[idxTableA] || fichiersEffectifs[0];
  const tableBEff = fichiersEffectifs[idxTableB] || fichiersEffectifs[1];
  const fichiersOrdonnesEff = useMemo(() => ordre.map((i) => fichiersEffectifs[i]), [ordre, fichiersEffectifs]);
  const comparables = useMemo(
    () => (tableAEff && tableBEff && idxTableA !== idxTableB ? colonnesComparables(tableAEff, tableBEff, cleActiveA, cleActiveB) : []),
    [tableAEff, tableBEff, idxTableA, idxTableB, cleActiveA, cleActiveB]
  );
  const colonnesMulti = useMemo(
    () => (fichiersOrdonnesEff.length >= 2 ? colonnesCommunesMulti(fichiersOrdonnesEff, clesMulti) : []),
    [fichiersOrdonnesEff, clesMulti]
  );

  const telechargerTableau = (entetes: string[], corps: unknown[][], nom: string) => {
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet([entetes, ...corps]), nom.slice(0, 31));
    XLSX.writeFile(classeur, `datenza_${nom.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.xlsx`);
  };

  /** Analyse comparée : les fichiers sont empilés sur leurs colonnes communes avec « Fichier Source », ce qui active la comparaison dans l'analyse. */
  const lancerAnalyseComparee = (liste: FichierEntree[]) => {
    const assemble = assemblerComparaison(liste);
    if (!assemble) return;
    const court = (n: string) => n.replace(/\.[^/.]+$/, "");
    chargerEtAnalyser(`Analyse comparée (${liste.map((f) => court(f.nom)).join(" vs ")})`.slice(0, 120), assemble.entetes, assemble.corps);
    router.push("/analyse");
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
    if (modeAssemblage === "multi") {
      setResultat(null);
      setResultatMulti(comparerPlusieursFichiers(fichiersOrdonnesEff, clesMulti, colonnesMulti.filter((c) => !colonnesExcluesMulti.includes(c))));
      return;
    }
    setResultatMulti(null);

    const optionsCompletes: OptionsNettoyage = {
      mode: modeAssemblage as ModeAssemblage,
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

    const res = fusionnerEtNettoyer(fichiersEffectifs, optionsCompletes);
    if (res.rapport.mode === "empilement") {
      // Colonnes réunies grâce à la correspondance (« CA » = « Chiffre d'affaires ») : ajoutées au bilan
      const reunies = res.rapport.colonnesFusionnees;
      Object.values(correspondances).forEach((corr) =>
        Object.entries(corr).forEach(([ref, col]) => {
          if (!col || col === ref) return;
          const e = reunies.find((x) => x.nomFinal === ref);
          if (e) {
            if (!e.variantesDetectees.includes(col)) e.variantesDetectees.push(col);
          } else reunies.push({ nomFinal: ref, variantesDetectees: [ref, col] });
        })
      );
    }
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

  /** Nom du fichier obtenu, tel qu'il apparaîtra dans l'analyse, les exports et les projets. */
  const nomResultat = () => {
    const court = (n?: string) => (n ?? "").replace(/\.[^/.]+$/, "");
    if (!resultat) return "";
    if (resultat.rapport.mode === "empilement") return `Fusion de ${resultat.rapport.nbFichiers} fichiers (${fichiersBruts.map((f) => court(f.nom)).join(", ")})`.slice(0, 120);
    const libelle = TYPES_JOINTURE.find((t) => t.id === resultat.rapport.typeJointure)?.libelle ?? "Rapprochement";
    return `${libelle} — ${court(tableA?.nom)} et ${court(tableB?.nom)}`.slice(0, 120);
  };

  /**
   * Le fichier obtenu devient le fichier actif, exactement comme un fichier importé (même nettoyage, même analyse).
   * « analyser » ouvre directement l'analyse ; sinon l'accueil montre l'aperçu et le choix des colonnes.
   */
  const ouvrirResultat = (destination: "analyser" | "accueil") => {
    if (!resultat) return;
    chargerEtAnalyser(nomResultat(), resultat.entetes, resultat.corps);
    router.push(destination === "analyser" ? "/analyse" : "/");
  };

  const supprimerFichier = (index: number) => {
    setFichiersBruts((prev) => prev.filter((_, i) => i !== index));
    setCorrespChoisies({});
    setOrdreMulti([]);
    setResultat(null);
    setResultatMulti(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16 font-sans text-slate-800 dark:text-slate-100">
      {/* En-tête */}
      <section className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-800">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Comparer · Rapprocher · Fusionner
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
            Comparer et fusionner des fichiers
          </h1>
          <div className="grid gap-2 sm:grid-cols-2 max-w-3xl pt-1 text-xs md:text-sm text-slate-300 leading-relaxed">
            <p>
              <strong className="text-white">Comparer ou rapprocher 2 fichiers</strong> : factures et paiements, stock théorique et inventaire, liste de l&apos;an dernier et de cette année… Trouvez ce qui manque, ce qui est en trop et les valeurs qui diffèrent.
            </p>
            <p>
              <strong className="text-white">Fusionner plusieurs fichiers</strong> de même structure (un par mois, par agence, par région) en un seul tableau, puis l&apos;analyser comme un fichier normal.
            </p>
          </div>
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
        {fichiersBruts.length >= 2 && fichiersBruts[indexRef] && indicesAutres.length > 0 && (
            <CorrespondanceColonnes
              reference={fichiersBruts[indexRef]}
              exclusRef={[cleDuFichier(indexRef)].filter(Boolean) as string[]}
              autres={indicesAutres.map((i) => ({ index: i, fichier: fichiersBruts[i], exclus: [cleDuFichier(i)].filter(Boolean) as string[] }))}
              correspondances={correspondances}
              onChange={(i, colRef, col) =>
                setCorrespChoisies((c) => ({ ...c, [`${indexRef}>${i}`]: { ...(c[`${indexRef}>${i}`] ?? {}), [colRef]: col } }))
              }
            />
          )}
        </div>

        {/* Panneau de configuration (Mode & Règles) */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-600" />
              Que voulez-vous faire ?
            </h3>

            {/* Sélecteur de Mode : Empilement vs Jointure */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold">
              {(
                [
                  { id: "jointure", libelle: "Comparer 2 fichiers", Icone: GitMerge },
                  { id: "multi", libelle: "Comparer plusieurs", Icone: Files },
                  { id: "empilement", libelle: "Fusionner (empiler)", Icone: Layers },
                ] as const
              ).map(({ id, libelle, Icone }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModeAssemblage(id)}
                  className={`py-2 px-1.5 rounded-lg flex flex-col items-center justify-center gap-1 text-center leading-tight transition ${
                    modeAssemblage === id ? "bg-white dark:bg-slate-900 text-purple-600 shadow-xs" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Icone className="w-3.5 h-3.5" />
                  {libelle}
                </button>
              ))}
            </div>

            {modeAssemblage === "multi" &&
              (fichiersBruts.length < 2 ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60">
                  Ajoutez au moins 2 fichiers (idéalement 3 ou plus) pour les comparer.
                </p>
              ) : (
                <ReglagesComparaisonMulti
                  fichiers={fichiersBruts}
                  ordre={ordre}
                  onOrdre={setOrdreMulti}
                  cles={clesMulti}
                  onCle={(iF, cle) => setClesMultiChoisies((c) => ({ ...c, [fichiersBruts[iF].nom]: cle }))}
                  colonnes={colonnesMulti}
                  colonnesExclues={colonnesExcluesMulti}
                  onBasculerColonne={(c) => setColonnesExcluesMulti((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]))}
                />
              ))}

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
                          Fichier A et colonne qui identifie chaque ligne
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
                          Fichier B et colonne correspondante
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
                            Aucune colonne n&apos;est rapprochée entre les deux fichiers : seules les clés présentes ou absentes seront comparées. Indiquez les colonnes qui se correspondent dans « Correspondance des colonnes », sous la liste des fichiers.
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
            <div className={`space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs ${modeAssemblage === "multi" ? "hidden" : ""}`}>
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
                  <span className="text-[11px] text-slate-400">Élimine les lignes strictement identiques à l&apos;intérieur d&apos;un même fichier.</span>
                </div>
              </label>

              {modeAssemblage === "empilement" && options.supprimerDoublons && (
                <label className="flex items-start gap-2.5 cursor-pointer pl-6">
                  <input
                    type="checkbox"
                    checked={options.doublonsEntreFichiers}
                    onChange={(e) => setOptions({ ...options, doublonsEntreFichiers: e.target.checked })}
                    className="rounded text-purple-600 mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">Aussi entre fichiers différents</span>
                    <span className="text-[11px] text-slate-400">
                      À cocher seulement si une même ligne a pu être exportée dans deux fichiers. Laissez décoché pour des agences ou des mois différents : leurs chiffres peuvent être identiques.
                    </span>
                  </div>
                </label>
              )}

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
              {modeAssemblage === "empilement" ? "Lancer la fusion" : "Lancer la comparaison"}
            </button>
          </div>
        </div>
      </div>

      {resultatMulti && (
        <ResultatsComparaisonMulti
          resultat={resultatMulti}
          onTelecharger={() => telechargerTableau(resultatMulti.entetes, resultatMulti.corps, "Comparaison_plusieurs_fichiers")}
          onAnalyserTableau={() => {
            chargerEtAnalyser(`Comparaison de ${resultatMulti.bilan.fichiers.length} fichiers (${resultatMulti.bilan.fichiers.join(", ")})`.slice(0, 120), resultatMulti.entetes, resultatMulti.corps);
            router.push("/analyse");
          }}
          onAnalyseComparee={() => lancerAnalyseComparee(fichiersOrdonnesEff)}
        />
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
          <p className="text-[11px] text-slate-500 text-right">
            Le fichier obtenu s&apos;utilise comme n&apos;importe quel fichier importé : analyse complète, graphiques, carte, prévisions, exports, et enregistrement dans vos projets.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              onClick={telechargerExcelConsolide}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 shadow transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Télécharger le résultat Excel (.xlsx)
            </button>

            {resultat.rapport.mode === "jointure" && tableAEff && tableBEff && (
              <BoutonAnalyseComparee nb={2} onClick={() => lancerAnalyseComparee([tableAEff, tableBEff])} />
            )}

            <button
              onClick={() => ouvrirResultat("accueil")}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-700 shadow-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-purple-600" />
              L&apos;ouvrir comme fichier (aperçu, choix des colonnes)
            </button>

            <button
              onClick={() => ouvrirResultat("analyser")}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-lg hover:shadow-purple-500/25 transition cursor-pointer"
            >
              <BarChart2 className="w-4 h-4" />
              Analyser ce fichier
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
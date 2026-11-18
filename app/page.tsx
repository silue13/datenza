"use client";

import { useState, type ChangeEvent } from "react";
import { lireFichier, EXTENSIONS_ACCEPTEES } from "../lib/import/lecture";
import { useData } from "./context/DataContext";
import { analyserColonnes } from "../lib/analyse/analyse";
import { genererRapport } from "../lib/analyse/rapport";
import { type Cellule } from "../lib/analyse/utils";
import { assemblerComparaison } from "../lib/analyse/comparaison";
import { useRouter } from "next/navigation";
import BoutonInstallerApp from "./components/BoutonInstallerApp";
import GuideUtilisation from "./components/GuideUtilisation";
import BandeauSource from "./components/BandeauSource";
import { analyserAdresse, type SourceDistante } from "../lib/import/source";
import { telechargerSource } from "../lib/import/telechargement";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  CheckSquare,
  Square,
  Trash2,
  Scale,
  Table,
  LayoutGrid,
  Link2,
  Radio,
} from "lucide-react";

interface FichierImporte {
  id: string;
  nom: string;
  nbLignes: number;
  entetes: string[];
  corps: Cellule[][];
  avertissements?: string[];
  /** Renseignée quand le fichier vient d'une source en direct (Google Sheets, adresse web). */
  source?: SourceDistante;
}

export default function HomePage() {
  const {
    nomFichier,
    entetes,
    corps,
    choisies,
    chargerDonnees,
    setChoisies,
    setRapport,
    setResultat,
    source: sourceActive,
  } = useData();

  const [pageIndex, setPageIndex] = useState<number>(0);
  const [erreurImport, setErreurImport] = useState<string>("");
  const [infoComparaison, setInfoComparaison] = useState<string>("");
  const [enChargement, setEnChargement] = useState<boolean>(false);
  const [estSurvole, setEstSurvole] = useState<boolean>(false);
  const [modeVue, setModeVue] = useState<"tableau" | "fiches">("tableau");

  const [fichiers, setFichiers] = useState<FichierImporte[]>([]);
  const [fichiersSelectionnesPourComparaison, setFichiersSelectionnesPourComparaison] = useState<string[]>([]);

  const [adresseSource, setAdresseSource] = useState<string>("");
  const [connexionEnCours, setConnexionEnCours] = useState<boolean>(false);

  const router = useRouter();
  const lignesParPage = 8;

  async function parserFichier(f: File): Promise<FichierImporte> {
    // Lecture unique et robuste : vraies valeurs Excel, encodage, séparateur, ligne d'en-têtes, totaux…
    const tableau = await lireFichier(f);
    return {
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      nom: f.name,
      nbLignes: tableau.corps.length,
      entetes: tableau.entetes,
      corps: tableau.corps,
      avertissements: tableau.avertissements,
    };
  }

  async function traiterFichiers(fichiersEntrants: FileList | File[]) {
    setErreurImport("");
    setEnChargement(true);

    try {
      const liste = Array.from(fichiersEntrants);
      const nouveaux: FichierImporte[] = [];

      for (const f of liste) {
        const item = await parserFichier(f);
        nouveaux.push(item);
      }

      // La fonction passée à setFichiers ne doit faire que calculer la nouvelle liste : y charger les données
      // modifiait un autre composant pendant le rendu (erreur React « Cannot update a component while rendering »).
      const etaitVide = fichiers.length === 0;
      setFichiers((anciens) => [...anciens, ...nouveaux]);
      if (etaitVide && nouveaux.length > 0) {
        const premier = nouveaux[0];
        chargerDonnees(premier.nom, premier.entetes, premier.corps);
        setChoisies(premier.entetes);
      }

      setPageIndex(0);
    } catch (e) {
      setErreurImport(e instanceof Error ? e.message : "Erreur lors de l'import.");
    } finally {
      setEnChargement(false);
    }
  }

  /** Connecte une feuille Google Sheets ou un fichier en ligne : il devient le fichier actif et pourra être actualisé. */
  async function connecterSource() {
    if (connexionEnCours) return;
    setErreurImport("");
    setConnexionEnCours(true);
    try {
      const adresse = analyserAdresse(adresseSource);
      const { tableau, nom } = await telechargerSource(adresse.urlTelechargement, adresse.nomPropose);
      const source: SourceDistante = {
        type: adresse.type,
        adresse: adresseSource.trim(),
        urlTelechargement: adresse.urlTelechargement,
        derniereMaj: new Date().toISOString(),
        intervalleMinutes: 0,
      };
      const item: FichierImporte = {
        id: `${nom}-${Date.now()}-${Math.random()}`,
        nom,
        nbLignes: tableau.corps.length,
        entetes: tableau.entetes,
        corps: tableau.corps,
        avertissements: tableau.avertissements,
        source,
      };
      // Une même source reconnectée remplace sa version précédente dans la liste
      setFichiers((anciens) => [...anciens.filter((f) => f.source?.urlTelechargement !== source.urlTelechargement), item]);
      chargerDonnees(item.nom, item.entetes, item.corps, undefined, undefined, source);
      setChoisies(item.entetes);
      setPageIndex(0);
      setAdresseSource("");
    } catch (e) {
      setErreurImport(e instanceof Error ? e.message : "Connexion à la source impossible.");
    } finally {
      setConnexionEnCours(false);
    }
  }

  function selectionnerFichierActif(f: FichierImporte) {
    // Une source en direct déjà active a pu être actualisée depuis : on ne la remplace pas par sa version d'origine
    if (f.source && f.nom === nomFichier && sourceActive?.urlTelechargement === f.source.urlTelechargement) return;
    chargerDonnees(f.nom, f.entetes, f.corps, undefined, undefined, f.source ?? null);
    setChoisies(f.entetes);
    setPageIndex(0);
  }

  function retirerFichier(id: string) {
    const restants = fichiers.filter((f) => f.id !== id);
    setFichiers(restants);
    setFichiersSelectionnesPourComparaison((prev) => prev.filter((item) => item !== id));
    if (restants.length > 0) {
      selectionnerFichierActif(restants[0]);
    } else {
      chargerDonnees("", [], []);
      setChoisies([]);
    }
  }

  function basculerSelectionComparaison(id: string) {
    setFichiersSelectionnesPourComparaison((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function lancerComparaison() {
    setErreurImport("");
    setInfoComparaison("");
    const selection = fichiers.filter((f) => fichiersSelectionnesPourComparaison.includes(f.id));

    if (selection.length < 2) {
      setErreurImport("Veuillez cocher au moins 2 fichiers à comparer.");
      return;
    }

    const comparaison = assemblerComparaison(selection);
    if (!comparaison) {
      setErreurImport("Ces fichiers ne partagent aucune colonne en commun : comparaison impossible.");
      return;
    }
    const { entetes: entetesComparatifs, corps: corpsComparatif } = comparaison;
    const notes: string[] = [];
    if (comparaison.colonnesAlignees.length)
      notes.push(`Colonnes reconnues malgré une écriture différente : ${comparaison.colonnesAlignees.map((c) => c.variantes.join(" = ")).join(" ; ")}.`);
    if (comparaison.colonnesIgnorees.length)
      notes.push(`Colonnes écartées car absentes d'au moins un fichier : ${comparaison.colonnesIgnorees.join(", ")}.`);
    setInfoComparaison(notes.join(" "));

    const titreComparatif = `Comparatif (${selection.map((f) => f.nom).join(" vs ")})`;
    chargerDonnees(titreComparatif, entetesComparatifs, corpsComparatif);
    setChoisies(entetesComparatifs);
    setPageIndex(0);
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
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-16 font-sans">
      {/* En-tête Titre & Statut avec Guide et Installation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold mb-1 sm:mb-2">
            <span>DATENZA</span>
            <span>·</span>
            <span>Aide à la Décision</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Ingestion & Analyse des Données
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            Importez vos classeurs Excel ou fichiers CSV pour les auditer, les projeter ou les comparer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:justify-end shrink-0">
          <GuideUtilisation />
          <div className="w-full sm:w-auto">
            <BoutonInstallerApp />
          </div>
        </div>
      </div>

      {/* Zone de Glisser-Déposer */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setEstSurvole(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setEstSurvole(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setEstSurvole(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void traiterFichiers(e.dataTransfer.files);
          }
        }}
        className={`bg-white dark:bg-slate-900 border-2 border-dashed rounded-2xl sm:rounded-3xl p-6 sm:p-10 text-center transition-all relative shadow-sm ${
          estSurvole
            ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 scale-[1.01]"
            : "border-slate-300 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-600"
        }`}
      >
        <input
          type="file"
          accept={EXTENSIONS_ACCEPTEES}
          multiple
          disabled={enChargement}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            if (e.target.files && e.target.files.length > 0) {
              void traiterFichiers(e.target.files);
            }
            e.target.value = "";
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        <div className="space-y-3">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto transition-transform">
            {enChargement ? (
              <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6 sm:w-7 sm:h-7" />
            )}
          </div>

          <div>
            <p className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200">
              {enChargement
                ? "Traitement et vérification des données..."
                : "Glissez vos fichiers ici ou touchez pour parcourir"}
            </p>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
              Prise en charge de plusieurs fichiers Excel (.xlsx, .xls, .ods), CSV, TSV, TXT et JSON
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-4 text-xs text-slate-500 pt-1 font-medium">
            <span className="flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Excel
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              CSV
            </span>
          </div>
        </div>
      </div>

      {/* Source en direct : Google Sheets ou fichier en ligne */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void connecterSource();
        }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Ou connectez une source en direct</h3>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              Feuille Google Sheets ou adresse d&apos;un fichier CSV, Excel ou JSON. Les données se rechargent ensuite d&apos;un clic, sans réimporter.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="adresse-source" className="sr-only">
            Adresse de la source
          </label>
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="adresse-source"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={adresseSource}
              onChange={(e) => setAdresseSource(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              disabled={connexionEnCours}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={connexionEnCours || !adresseSource.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {connexionEnCours && <Loader2 className="w-4 h-4 animate-spin" />}
            {connexionEnCours ? "Connexion…" : "Connecter"}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Google Sheets : la feuille doit être partagée en « Tous les utilisateurs disposant du lien ». Le fichier est téléchargé par le serveur de
          DATENZA, qui ne le conserve pas.
        </p>
      </form>

      {/* Message d'erreur */}
      {erreurImport && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/50 p-3.5 sm:p-4 text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{erreurImport}</span>
        </div>
      )}

      {infoComparaison && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900/50 p-3.5 sm:p-4 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
          <Scale className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{infoComparaison}</span>
        </div>
      )}

      {/* Liste des fichiers importés */}
      {fichiers.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Fichiers importés ({fichiers.length})
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Touchez un fichier pour l&apos;activer ou cochez les cases pour comparer
              </p>
            </div>

            {fichiersSelectionnesPourComparaison.length >= 2 && (
              <button
                type="button"
                onClick={lancerComparaison}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition cursor-pointer"
              >
                <Scale className="w-4 h-4" />
                <span>Comparer ({fichiersSelectionnesPourComparaison.length} cochés)</span>
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {fichiers.map((f) => {
              const estActif = f.nom === nomFichier;
              const estCochePourComparer = fichiersSelectionnesPourComparaison.includes(f.id);

              return (
                <div
                  key={f.id}
                  onClick={() => selectionnerFichierActif(f)}
                  className={`flex items-center justify-between p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border text-xs cursor-pointer transition select-none gap-2 ${
                    estActif
                      ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 text-blue-950 dark:text-blue-200 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <input
                      type="checkbox"
                      checked={estCochePourComparer}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => basculerSelectionComparaison(f.id)}
                      title="Cocher pour comparer ce fichier"
                      className="accent-blue-600 h-4 w-4 rounded cursor-pointer shrink-0"
                    />

                    <div className="min-w-0">
                      <p className="font-bold truncate text-xs">{f.nom}</p>
                      <p className="text-[10px] text-slate-400">
                        {f.nbLignes.toLocaleString("fr-FR")} lignes · {f.entetes.length} cols
                      </p>
                      {f.avertissements && f.avertissements.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-[10px] leading-snug text-amber-700 dark:text-amber-400 whitespace-normal">
                          {f.avertissements.map((a) => (
                            <li key={a}>• {a}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {f.source && (
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md">
                        En direct
                      </span>
                    )}
                    {estActif && (
                      <span className="text-[10px] bg-blue-200/60 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 font-bold px-2 py-0.5 rounded-md">
                        Actif
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        retirerFichier(f.id);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 transition"
                      title="Retirer ce fichier"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation du fichier importé actif */}
      {nomFichier && (
        <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3 truncate">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <div className="truncate">
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate block">
                {nomFichier}
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {corps.length.toLocaleString("fr-FR")} ligne(s) · {entetes.length} colonnes
              </p>
            </div>
          </div>
        </div>
      )}

      <BandeauSource />

      {/* Section Périmètre de l'Analyse (2 colonnes sur mobile) */}
      {entetes.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 sm:pb-4">
            <div>
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Étape 2 · Sélection des variables
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                Périmètre de l&apos;analyse
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                {choisies.length} colonne(s) sélectionnée(s) sur {entetes.length}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={toutCocher}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                Tout cocher
              </button>
              <button
                type="button"
                onClick={toutDecocher}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                <Square className="w-3.5 h-3.5 text-slate-400" />
                Tout décocher
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto pr-1 scrollbar-thin">
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
              {entetes.map((nom) => {
                const estCoche = choisies.includes(nom);
                return (
                  <label
                    key={nom}
                    className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border text-xs font-semibold cursor-pointer transition select-none ${
                      estCoche
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={estCoche}
                      onChange={() => basculer(nom)}
                      className="accent-blue-600 h-4 w-4 rounded cursor-pointer shrink-0"
                    />
                    <span className="truncate">{nom}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={lancerAnalyse}
            disabled={choisies.length === 0}
            className="w-full py-3.5 sm:py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg shadow-blue-600/20 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>Lancer l&apos;analyse décisionnelle</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Aperçu des Données Paginées (Tableau Sticky Column + Mode Fiches) */}
      {corps.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Aperçu des données brutes
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400">
                Affichage des {lignesParPage} premières lignes sur {corps.length.toLocaleString("fr-FR")}
              </p>
            </div>

            {/* Bascule Mobile Tableau / Fiches */}
            <div className="sm:hidden flex items-center self-start bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setModeVue("tableau")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                  modeVue === "tableau"
                    ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs"
                    : "text-slate-500"
                }`}
              >
                <Table className="w-3 h-3" />
                <span>Tableau</span>
              </button>
              <button
                type="button"
                onClick={() => setModeVue("fiches")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                  modeVue === "fiches"
                    ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs"
                    : "text-slate-500"
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Fiches</span>
              </button>
            </div>
          </div>

          {/* VUE MOBILE ALTERNATIVE : FICHES SANS SCROLL LATÉRAL */}
          {modeVue === "fiches" ? (
            <div className="sm:hidden space-y-2.5">
              {corpsPagine.map((ligne, idx) => {
                const val0 = ligne[0];
                const autresCols = entetes.slice(1);

                return (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-slate-800 pb-1.5 text-xs font-bold text-slate-900 dark:text-white">
                      <span className="truncate">
                        {val0 !== undefined && val0 !== "" ? String(val0) : `Ligne ${pageIndex * lignesParPage + idx + 1}`}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        #{pageIndex * lignesParPage + idx + 1}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {autresCols.map((h, i) => {
                        const val = ligne[i + 1];
                        return (
                          <div
                            key={h}
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                          >
                            <span className="text-[10px] text-slate-400 block truncate">
                              {h.replace(/_/g, " ")}
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate block">
                              {val !== null && val !== undefined && val !== "" ? String(val) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* VUE TABLEAU : PREMIÈRE COLONNE STICKY & SCROLL HORIZONTAL */
            <div className="overflow-x-auto rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    {entetes.map((h, idx) => (
                      <th
                        key={h}
                        className={`p-3 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap text-[10px] sm:text-xs uppercase tracking-wider ${
                          idx === 0
                            ? "sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 shadow-[1px_0_0_0_rgba(226,232,240,1)] dark:shadow-[1px_0_0_0_rgba(51,65,85,1)]"
                            : ""
                        }`}
                      >
                        {h.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {corpsPagine.map((ligne, idx) => (
                    <tr key={idx} className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      {ligne.map((c, i) => (
                        <td
                          key={i}
                          className={`p-3 whitespace-nowrap text-slate-600 dark:text-slate-400 ${
                            i === 0
                              ? "font-sans font-bold sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 shadow-[1px_0_0_0_rgba(226,232,240,1)] dark:shadow-[1px_0_0_0_rgba(51,65,85,1)] text-slate-900 dark:text-slate-100"
                              : ""
                          }`}
                        >
                          {String(c ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((p) => p - 1)}
              className="px-3 sm:px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-30 disabled:cursor-not-allowed transition text-[11px] sm:text-xs"
            >
              ‹ Précédent
            </button>
            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium text-center">
              Page {pageIndex + 1} sur {totalPages} ({corps.length.toLocaleString("fr-FR")} lig.)
            </span>
            <button
              type="button"
              disabled={pageIndex >= totalPages - 1}
              onClick={() => setPageIndex((p) => p + 1)}
              className="px-3 sm:px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-30 disabled:cursor-not-allowed transition text-[11px] sm:text-xs"
            >
              Suivant ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
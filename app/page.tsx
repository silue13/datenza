"use client";

import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { useData } from "./context/DataContext";
import { analyserColonnes } from "../lib/analyse/analyse";
import { genererRapport } from "../lib/analyse/rapport";
import type { Cellule } from "../lib/analyse/utils";
import { useRouter } from "next/navigation";
import BoutonInstallerApp from "./components/BoutonInstallerApp";
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
} from "lucide-react";

interface FichierImporte {
  id: string;
  nom: string;
  nbLignes: number;
  entetes: string[];
  corps: Cellule[][];
}

/** En-têtes sûrs : jamais vides, jamais en double (évite les conflits d'indexation) */
function nettoyerEntetes(brut: Cellule[]): string[] {
  const vus = new Map<string, number>();
  return brut.map((c, i) => {
    const base = String(c ?? "").trim() || `Colonne ${i + 1}`;
    const n = (vus.get(base) ?? 0) + 1;
    vus.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Détection automatique du séparateur CSV (; ou ,) */
function detecterSeparateur(texte: string): string {
  const echantillon = texte.split(/\r\n|\n/).slice(0, 5).join("\n");
  const nbPointVirgule = (echantillon.match(/;/g) || []).length;
  const nbVirgule = (echantillon.match(/,/g) || []).length;
  const nbTab = (echantillon.match(/\t/g) || []).length;

  if (nbPointVirgule > nbVirgule && nbPointVirgule > nbTab) return ";";
  if (nbTab > nbVirgule && nbTab > nbPointVirgule) return "\t";
  return ",";
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
  } = useData();

  const [pageIndex, setPageIndex] = useState<number>(0);
  const [erreurImport, setErreurImport] = useState<string>("");
  const [enChargement, setEnChargement] = useState<boolean>(false);
  const [estSurvole, setEstSurvole] = useState<boolean>(false);

  // État local qui conserve tous les fichiers importés
  const [fichiers, setFichiers] = useState<FichierImporte[]>([]);

  // IDs des fichiers sélectionnés pour la comparaison
  const [fichiersSelectionnesPourComparaison, setFichiersSelectionnesPourComparaison] = useState<string[]>([]);

  const router = useRouter();
  const lignesParPage = 8;

  async function parserFichier(f: File): Promise<FichierImporte> {
    const ext = f.name.split(".").pop()?.toLowerCase();
    let lignes: Cellule[][] = [];

    if (ext === "csv") {
      const texte = await f.text();
      const separateur = detecterSeparateur(texte);
      const wb = XLSX.read(texte, {
        type: "string",
        raw: false,
        FS: separateur,
      });
      const feuille = wb.Sheets[wb.SheetNames[0]];
      if (!feuille) throw new Error(`Le fichier CSV ${f.name} est vide.`);
      lignes = XLSX.utils.sheet_to_json<Cellule[]>(feuille, {
        header: 1,
        raw: false,
        defval: "",
      });
    } else {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const feuille = wb.Sheets[wb.SheetNames[0]];
      if (!feuille) throw new Error(`Le classeur Excel ${f.name} ne contient aucune feuille.`);
      lignes = XLSX.utils.sheet_to_json<Cellule[]>(feuille, {
        header: 1,
        raw: false,
        defval: "",
      });
    }

    const [tete, ...reste] = lignes;
    if (!tete || tete.length === 0) {
      throw new Error(`Fichier ${f.name} vide : aucune colonne détectée.`);
    }

    const resteFiltre = reste.filter((ligne) =>
      ligne.some((c) => c !== null && c !== undefined && String(c).trim() !== "")
    );

    if (resteFiltre.length === 0) {
      throw new Error(`Le fichier ${f.name} contient des en-têtes mais aucune donnée.`);
    }

    const entetesNettoyes = nettoyerEntetes(tete);

    return {
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      nom: f.name,
      nbLignes: resteFiltre.length,
      entetes: entetesNettoyes,
      corps: resteFiltre,
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

      setFichiers((anciens) => {
        const tous = [...anciens, ...nouveaux];
        if (anciens.length === 0 && nouveaux.length > 0) {
          const premier = nouveaux[0];
          chargerDonnees(premier.nom, premier.entetes, premier.corps);
          setChoisies(premier.entetes);
        }
        return tous;
      });

      setPageIndex(0);
    } catch (e) {
      setErreurImport(e instanceof Error ? e.message : "Erreur lors de l'import.");
    } finally {
      setEnChargement(false);
    }
  }

  function selectionnerFichierActif(f: FichierImporte) {
    chargerDonnees(f.nom, f.entetes, f.corps);
    setChoisies(f.entetes);
    setPageIndex(0);
  }

  function retirerFichier(id: string) {
    setFichiers((anciens) => {
      const restants = anciens.filter((f) => f.id !== id);
      setFichiersSelectionnesPourComparaison((prev) => prev.filter((item) => item !== id));
      if (restants.length > 0) {
        selectionnerFichierActif(restants[0]);
      } else {
        chargerDonnees("", [], []);
        setChoisies([]);
      }
      return restants;
    });
  }

  // Bascule la sélection d'un fichier pour le mode comparaison
  function basculerSelectionComparaison(id: string) {
    setFichiersSelectionnesPourComparaison((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // LOGIQUE DE COMPARAISON : fusionne sur les colonnes communes + ajoute "Fichier Source"
  function lancerComparaison() {
    setErreurImport("");
    const selection = fichiers.filter((f) => fichiersSelectionnesPourComparaison.includes(f.id));

    if (selection.length < 2) {
      setErreurImport("Veuillez cocher au moins 2 fichiers à comparer.");
      return;
    }

    // Trouver l'intersection des colonnes communes à tous les fichiers cochés
    let colonnesCommunes = selection[0].entetes;
    for (let i = 1; i < selection.length; i++) {
      colonnesCommunes = colonnesCommunes.filter((col) => selection[i].entetes.includes(col));
    }

    if (colonnesCommunes.length === 0) {
      setErreurImport("Ces fichiers ne partagent aucune colonne en commun : comparaison impossible.");
      return;
    }

    // 1re colonne dédiée à l'étiquetage comparatif
    const entetesComparatifs = ["Fichier Source", ...colonnesCommunes];
    const corpsComparatif: Cellule[][] = [];

    selection.forEach((f) => {
      f.corps.forEach((ligne) => {
        const nouvelleLigne: Cellule[] = [f.nom];
        colonnesCommunes.forEach((col) => {
          const idx = f.entetes.indexOf(col);
          nouvelleLigne.push(idx !== -1 ? ligne[idx] : "");
        });
        corpsComparatif.push(nouvelleLigne);
      });
    });

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
    <div className="max-w-6xl mx-auto space-y-8 pb-16 font-sans">
      {/* En-tête Titre & Statut */}
   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
     <div className="space-y-1">
       <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-bold mb-2">
         <span>DATENZA</span>
         <span>·</span>
         <span>Aide à la Décision</span>
       </div>
       <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
         Ingestion & Analyse des Données
       </h1>
       <p className="text-slate-500 dark:text-slate-400 text-sm">
         Importez un ou plusieurs classeurs Excel ou fichiers CSV pour les auditer ou les comparer.
       </p>
     </div>

     {/* Bouton d'installation de l'application (Android, iPhone, Windows, Mac) */}
     <div className="sm:w-56 shrink-0">
       <BoutonInstallerApp />
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
        className={`bg-white dark:bg-slate-900 border-2 border-dashed rounded-3xl p-10 text-center transition-all relative shadow-sm ${
          estSurvole
            ? "border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 scale-[1.01]"
            : "border-purple-200 dark:border-purple-900/60 hover:border-purple-400 dark:hover:border-purple-600"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
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
          <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto transition-transform">
            {enChargement ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>

          <div>
            <p className="text-base font-bold text-slate-800 dark:text-slate-200">
              {enChargement
                ? "Traitement et vérification des données..."
                : "Glissez vos fichiers ici ou cliquez pour parcourir"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Prise en charge de plusieurs fichiers Excel (.xlsx, .xls) et CSV
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs text-slate-500 pt-2 font-medium">
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

      {/* Message d'erreur */}
      {erreurImport && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/50 p-4 text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{erreurImport}</span>
        </div>
      )}

      {/* ZONE DÉROULANTE CONTENANT LES DIFFÉRENTS FICHIERS IMPORTÉS */}
      {fichiers.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Fichiers importés ({fichiers.length})
              </h3>
              <p className="text-xs text-slate-400">
                Cliquez pour activer un fichier ou cochez les cases pour comparer plusieurs versions
              </p>
            </div>

            {/* Bouton pour déclencher la comparaison dès que 2 fichiers sont cochés */}
            {fichiersSelectionnesPourComparaison.length >= 2 && (
              <button
                type="button"
                onClick={lancerComparaison}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 transition cursor-pointer"
              >
                <Scale className="w-4 h-4" />
                <span>Comparer les {fichiersSelectionnesPourComparaison.length} fichiers cochés</span>
              </button>
            )}
          </div>

          {/* Boîte déroulante avec barre de défilement (max-h-56) */}
          <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-900">
            {fichiers.map((f) => {
              const estActif = f.nom === nomFichier;
              const estCochePourComparer = fichiersSelectionnesPourComparaison.includes(f.id);

              return (
                <div
                  key={f.id}
                  onClick={() => selectionnerFichierActif(f)}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs cursor-pointer transition select-none ${
                    estActif
                      ? "border-purple-500 bg-purple-50/60 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    {/* Case à cocher pour la comparaison */}
                    <input
                      type="checkbox"
                      checked={estCochePourComparer}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => basculerSelectionComparaison(f.id)}
                      title="Cocher pour comparer ce fichier"
                      className="accent-purple-600 h-4 w-4 rounded cursor-pointer"
                    />

                    <span className="font-bold truncate">{f.nom}</span>
                    <span className="text-slate-400 whitespace-nowrap">
                      — {f.nbLignes.toLocaleString("fr-FR")} ligne(s) · {f.entetes.length} colonnes
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {estActif && (
                      <span className="text-[10px] bg-purple-200/60 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-bold px-2 py-0.5 rounded-md">
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
        <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/40 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-bold">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{nomFichier}</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {corps.length.toLocaleString("fr-FR")} ligne(s) exploitable(s) · {entetes.length} colonnes
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section Préparation de l'Analyse */}
      {entetes.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Étape 2 · Sélection des variables
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                Périmètre de l&apos;analyse
              </h2>
              <p className="text-xs text-slate-500">
                {choisies.length} colonne(s) sélectionnée(s) sur {entetes.length}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={toutCocher}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                <CheckSquare className="w-3.5 h-3.5 text-purple-600" />
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

          {/* Grille de sélection des colonnes */}
          <div className="max-h-72 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {entetes.map((nom) => {
                const estCoche = choisies.includes(nom);
                return (
                  <label
                    key={nom}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-xs font-semibold cursor-pointer transition select-none ${
                      estCoche
                        ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={estCoche}
                      onChange={() => basculer(nom)}
                      className="accent-purple-600 h-4 w-4 rounded cursor-pointer"
                    />
                    <span className="truncate">{nom}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Bouton de confirmation principal */}
          <button
            type="button"
            onClick={lancerAnalyse}
            disabled={choisies.length === 0}
            className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-purple-600/20 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>Lancer l&apos;analyse décisionnelle</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Aperçu des Données Paginées */}
      {corps.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Aperçu des données brutes
            </h3>
            <span className="text-xs text-slate-400">
              Affichage des {lignesParPage} premières lignes
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {entetes.map((h) => (
                    <th key={h} className="p-3 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                {corpsPagine.map((ligne, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    {ligne.map((c, i) => (
                      <td key={i} className="p-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {String(c ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Contrôle de pagination */}
          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((p) => p - 1)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              ‹ Précédent
            </button>
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Page {pageIndex + 1} sur {totalPages} ({corps.length.toLocaleString("fr-FR")} lignes)
            </span>
            <button
              type="button"
              disabled={pageIndex >= totalPages - 1}
              onClick={() => setPageIndex((p) => p + 1)}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Suivant ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
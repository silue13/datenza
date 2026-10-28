"use client";

import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { useData } from "./context/DataContext";
import { analyserColonnes } from "../lib/analyse/analyse";
import { genererRapport } from "../lib/analyse/rapport";
import {
  type Cellule,
  estValeurVide,
  estLigneTotal,
} from "../lib/analyse/utils";
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

/** En-têtes sûrs : purge du BOM, suppression des guillemets et déduplication */
function nettoyerEntetes(brut: Cellule[]): string[] {
  const vus = new Map<string, number>();
  return brut.map((c, i) => {
    let base = String(c ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/^["'«»“”]|["'«»“”]$/g, "")
      .trim();

    if (!base) base = `Colonne ${i + 1}`;
    const n = (vus.get(base) ?? 0) + 1;
    vus.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Détection automatique du séparateur CSV (; ou , ou \t) */
function detecterSeparateur(texte: string): string {
  const lignes = texte.split(/\r\n|\n/).filter((l) => l.trim() !== "").slice(0, 5);
  if (!lignes.length) return ",";

  const premierLigne = lignes[0];
  const nbPVTete = (premierLigne.match(/;/g) || []).length;
  const nbVirgTete = (premierLigne.match(/,/g) || []).length;
  const nbTabTete = (premierLigne.match(/\t/g) || []).length;

  if (nbPVTete > nbVirgTete && nbPVTete > nbTabTete) return ";";
  if (nbTabTete > nbVirgTete && nbTabTete > nbPVTete) return "\t";

  const echantillon = lignes.join("\n");
  const nbPointVirgule = (echantillon.match(/;/g) || []).length;
  const nbVirgule = (echantillon.match(/,/g) || []).length;
  const nbTab = (echantillon.match(/\t/g) || []).length;

  if (nbPointVirgule > nbVirgule && nbPointVirgule > nbTab) return ";";
  if (nbTab > nbVirgule && nbTab > nbPointVirgule) return "\t";
  return ",";
}

/** Sélectionne intelligemment la feuille de données d'un classeur Excel */
function selectionnerMeilleureFeuille(wb: XLSX.WorkBook): XLSX.WorkSheet {
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error("Le classeur Excel ne contient aucune feuille.");
  }

  // 1. Priorité aux feuilles dont le nom contient "données", "donnees", "data"
  const nomDonnees = wb.SheetNames.find((n) =>
    /donn[eé]es?|data/i.test(n.trim())
  );
  if (nomDonnees && wb.Sheets[nomDonnees]) {
    return wb.Sheets[nomDonnees];
  }

  // 2. Écarter les feuilles administratives (Métadonnées, Schéma, Requêtes, Sommaire)
  const feuillesUtiles = wb.SheetNames.filter(
    (n) =>
      !/^(m[eé]tadonn[eé]es?|metadata|sch[eé]ma|requ[eê]te|notice|sommaire|notes?|lisez[- ]?moi)$/i.test(
        n.trim()
      )
  );

  const candidates = feuillesUtiles.length > 0 ? feuillesUtiles : wb.SheetNames;

  // 3. Sélectionner celle qui dispose de la plus grande plage utile
  let meilleure = wb.Sheets[candidates[0]];
  let maxCellules = 0;

  for (const nom of candidates) {
    const sh = wb.Sheets[nom];
    if (sh && sh["!ref"]) {
      const range = XLSX.utils.decode_range(sh["!ref"]);
      const nb = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
      if (nb > maxCellules) {
        maxCellules = nb;
        meilleure = sh;
      }
    }
  }

  return meilleure || wb.Sheets[wb.SheetNames[0]];
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

  const [fichiers, setFichiers] = useState<FichierImporte[]>([]);
  const [fichiersSelectionnesPourComparaison, setFichiersSelectionnesPourComparaison] = useState<string[]>([]);

  const router = useRouter();
  const lignesParPage = 8;

  async function parserFichier(f: File): Promise<FichierImporte> {
    const ext = f.name.split(".").pop()?.toLowerCase();
    let lignes: Cellule[][] = [];

    if (ext === "csv") {
      const texteBrut = await f.text();
      // Purge du BOM UTF-8 dès l'entrée
      const texte = texteBrut.replace(/^\uFEFF/, "");
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
      const feuille = selectionnerMeilleureFeuille(wb);

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

    // Filtrage des lignes vides ET des lignes de calcul parasites (Totaux, Variations)
    const resteFiltre = reste.filter((ligne) => {
      if (!ligne || ligne.length === 0) return false;
      const aDesValeurs = ligne.some((c) => !estValeurVide(c));
      if (!aDesValeurs) return false;
      return !estLigneTotal(ligne);
    });

    if (resteFiltre.length === 0) {
      throw new Error(`Le fichier ${f.name} contient des en-têtes mais aucune donnée exploitable.`);
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

  function basculerSelectionComparaison(id: string) {
    setFichiersSelectionnesPourComparaison((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function lancerComparaison() {
    setErreurImport("");
    const selection = fichiers.filter((f) => fichiersSelectionnesPourComparaison.includes(f.id));

    if (selection.length < 2) {
      setErreurImport("Veuillez cocher au moins 2 fichiers à comparer.");
      return;
    }

    let colonnesCommunes = selection[0].entetes;
    for (let i = 1; i < selection.length; i++) {
      colonnesCommunes = colonnesCommunes.filter((col) => selection[i].entetes.includes(col));
    }

    if (colonnesCommunes.length === 0) {
      setErreurImport("Ces fichiers ne partagent aucune colonne en commun : comparaison impossible.");
      return;
    }

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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold mb-2">
            <span>DATENZA</span>
            <span>·</span>
            <span>Aide à la Décision</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Ingestion & Analyse des Données
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Importez vos classeurs Excel ou fichiers CSV pour les auditer, les projeter ou les comparer.
          </p>
        </div>

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
            ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 scale-[1.01]"
            : "border-slate-300 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-600"
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
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto transition-transform">
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

      {/* Liste des fichiers importés */}
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

            {fichiersSelectionnesPourComparaison.length >= 2 && (
              <button
                type="button"
                onClick={lancerComparaison}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition cursor-pointer"
              >
                <Scale className="w-4 h-4" />
                <span>Comparer les {fichiersSelectionnesPourComparaison.length} fichiers cochés</span>
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
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs cursor-pointer transition select-none ${
                    estActif
                      ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 text-blue-950 dark:text-blue-200 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <input
                      type="checkbox"
                      checked={estCochePourComparer}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => basculerSelectionComparaison(f.id)}
                      title="Cocher pour comparer ce fichier"
                      className="accent-blue-600 h-4 w-4 rounded cursor-pointer"
                    />

                    <span className="font-bold truncate">{f.nom}</span>
                    <span className="text-slate-400 whitespace-nowrap">
                      — {f.nbLignes.toLocaleString("fr-FR")} ligne(s) · {f.entetes.length} colonnes
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
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
        <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 rounded-2xl p-4 flex items-center justify-between shadow-sm">
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

      {/* Section Périmètre de l'Analyse */}
      {entetes.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
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

          <div className="max-h-72 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {entetes.map((nom) => {
                const estCoche = choisies.includes(nom);
                return (
                  <label
                    key={nom}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-xs font-semibold cursor-pointer transition select-none ${
                      estCoche
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={estCoche}
                      onChange={() => basculer(nom)}
                      className="accent-blue-600 h-4 w-4 rounded cursor-pointer"
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
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-blue-600/20 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
"use client";
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { BlocRapport } from "../../lib/analyse/rapport";
import type { analyserColonnes } from "../../lib/analyse/analyse";
import {
  type Cellule,
  nettoyerEntetes,
  estLigneTotal,
  estValeurVide,
} from "../../lib/analyse/utils";
import { analyserNettoyage, appliquerCorrections } from "../../lib/analyse/nettoyage";
import type { ConditionFiltre, DefinitionColonneCalculee } from "../../lib/analyse/filtres";
import {
  adapterRecette,
  creerRecette,
  executerEtapes,
  retirerCalcul,
  type RapportRecette,
  type Recette,
} from "../../lib/analyse/recette";
import { chargerEtat, sauvegarderEtat, effacerEtat, type EtatPersiste } from "../../lib/persistance";
import { normaliserSource, type SourceDistante } from "../../lib/import/source";
import { telechargerSource } from "../../lib/import/telechargement";
import { appliquerModele, type DiagnosticRelation, type Relation, type TableReference } from "../../lib/analyse/modele";
import type { DefinitionMesure } from "../../lib/analyse/formules";

interface ModeleSession {
  tables: TableReference[];
  relations: Relation[];
}

/** État de la dernière actualisation d'une source en direct. */
export interface EtatActualisation {
  enCours: boolean;
  /** Ce qui a changé à la dernière actualisation réussie. */
  message: string | null;
  erreur: string | null;
}

export interface ProjetCourant {
  id: string;
  nom: string;
}

export type ResultatAnalyse = ReturnType<typeof analyserColonnes>;
export type TypeGraphique =
  | "Barres"
  | "Courbe"
  | "Camembert"
  | "Anneau"
  | "Radar"
  | "Aires"
  | "Carte"
  | "Nuage"
  | "Histogramme"
  | "Combine";

export interface GraphiqueEpingle {
  id: number | string;
  titre: string;
  type: TypeGraphique;
  labels: string[];
  datasets: {
    label: string;
    data: (number | null)[];
    backgroundColor: string | string[];
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    fill?: boolean;
    borderDash?: number[];
    pointRadius?: number;
    /** Graphique combiné : nature de la série (barres ou courbe) et axe des valeurs utilisé. */
    type?: "bar" | "line";
    yAxisID?: "y" | "y1";
    order?: number;
  }[];
  chartType?: string;
  interpretation?: string;
  /** Barres horizontales (classements à libellés longs). */
  horizontal?: boolean;
  /** Séries empilées plutôt que côte à côte. */
  empile?: boolean;
  /** Nuage de points : une ligne du fichier par point, et la droite de tendance si elle a un sens. */
  nuage?: {
    series: { nom: string; points: { x: number; y: number }[] }[];
    droite: { x1: number; y1: number; x2: number; y2: number } | null;
    r: number | null;
    nbPoints: number;
  };
  /** Titres des axes (nuage, histogramme, combiné). */
  axes?: { x?: string; y?: string; y2?: string };
  /** Constats calculés propres à ce type de graphique : remplacent la lecture générique sous le graphique. */
  constats?: { titre: string; texte: string }[];
  /** Deux indicateurs pour la fiche du PowerPoint, quand « premier rang » et « total » n'ont pas de sens. */
  indicateurs?: { titre: string; valeur: string; detail: string }[];
  /** Filtre appliqué quand on clique sur le point n° i (filtrage croisé) ; null si le point n'est pas filtrable. */
  filtresClic?: (ConditionFiltre | null)[];
}

interface DataContextType {
  nomFichier: string;
  entetes: string[];
  corps: Cellule[][];
  choisies: string[];
  rapport: BlocRapport[];
  resultat: ResultatAnalyse | null;
  graphiquesEpingles: GraphiqueEpingle[];
  filtresActifs: ConditionFiltre[];
  chargerDonnees: (
    nom: string,
    entetes: string[],
    corps: Cellule[][],
    nouveauResultat?: ResultatAnalyse | null,
    nouveauRapport?: BlocRapport[],
    source?: SourceDistante | null
  ) => void;
  /** Source en direct du fichier actif (Google Sheets, adresse web) ; null pour un fichier déposé. */
  source: SourceDistante | null;
  actualisation: EtatActualisation;
  /** Retélécharge la source et remplace les données en gardant filtres, colonnes calculées et colonnes choisies. */
  actualiserSource: () => Promise<void>;
  /** Actualisation automatique toutes les n minutes tant que l'application est ouverte ; 0 pour l'arrêter. */
  definirIntervalleSource: (minutes: number) => void;
  setChoisies: React.Dispatch<React.SetStateAction<string[]>>;
  setRapport: React.Dispatch<React.SetStateAction<BlocRapport[]>>;
  setResultat: React.Dispatch<React.SetStateAction<ResultatAnalyse | null>>;
  epinglerGraphique: (graphique: GraphiqueEpingle) => void;
  /** Graphiques actuellement à l'écran (automatiques et créés à la main) : ce sont eux qui partent dans le PowerPoint. */
  graphiquesAffiches: GraphiqueEpingle[];
  publierGraphiquesAffiches: (graphiques: GraphiqueEpingle[]) => void;
  /** Identifiants des graphiques affichés que l'utilisateur a retirés du PowerPoint. */
  graphiquesExclus: string[];
  basculerExclusionGraphique: (id: number | string) => void;
  desepinglerGraphique: (id: number | string) => void;
  ajouterFiltre: (filtre: ConditionFiltre) => void;
  supprimerFiltre: (index: number) => void;
  reinitialiserFiltres: () => void;
  creerColonneCalculee: (def: DefinitionColonneCalculee) => void;
  /** Colonnes calculées actives, dans l'ordre où elles sont appliquées. */
  definitionsCalculs: DefinitionColonneCalculee[];
  /** Retire une colonne calculée et ce qui en dépend ; renvoie la description des étapes retirées par ricochet. */
  supprimerColonneCalculee: (index: number) => string[];
  /** Colonnes du fichier importé, avant toute étape. */
  colonnesSource: string[];
  /** Recette décrivant les étapes actuelles (colonnes calculées, filtres, colonnes choisies). */
  recetteCourante: (nom: string) => Recette;
  /** Remplace les étapes actuelles par celles d'une recette, adaptées aux colonnes du fichier actif. */
  appliquerRecette: (recette: Recette) => RapportRecette;
  /** Charge un autre fichier en rejouant une recette (par défaut, les étapes actuelles). */
  rejouerSurFichier: (nom: string, entetes: string[], corps: Cellule[][], recette?: Recette) => RapportRecette;
  nettoyerDonnees: (corrections: { colonne: string; valeurOriginale: any; valeurSuggeree: any }[]) => void;
  supprimerDonnees: () => void;
  restaurationTerminee: boolean;
  /** Vrai dès qu'un fichier est chargé, même si les filtres actifs ne laissent aucune ligne. */
  aDesDonnees: boolean;
  /** Projet du compte ouvert ou enregistré dans cette session ; null pour un fichier non enregistré en ligne. */
  projetCourant: ProjetCourant | null;
  definirProjetCourant: (projet: ProjetCourant | null) => void;
  /** État complet de la session (données sources + réglages), tel qu'il est enregistré dans un projet. */
  obtenirEtat: () => EtatPersiste;
  /** Remplace la session par un projet enregistré. */
  ouvrirEtat: (etat: EtatPersiste, projet?: ProjetCourant | null) => void;
  /** Projet partagé affiché en lecture seule : rien n'est sauvegardé, la session du visiteur reste intacte. */
  lectureSeule: boolean;
  /** Modèle de données : tables de référence reliées à la table principale par des relations. */
  tablesReference: TableReference[];
  relations: Relation[];
  /** État de chaque relation (correspondances trouvées, clés introuvables), dans l'ordre des relations. */
  diagnosticsModele: DiagnosticRelation[];
  /** Table principale telle qu'importée (avant colonnes reliées, colonnes calculées et filtres). */
  tablePrincipale: { entetes: string[]; corps: Cellule[][] };
  /** Colonnes utilisables comme point de départ d'une relation : table principale puis colonnes déjà reliées. */
  colonnesPourRelation: string[];
  ajouterTableReference: (table: TableReference) => void;
  retirerTableReference: (id: string) => void;
  enregistrerRelation: (relation: Relation) => void;
  retirerRelation: (id: string) => void;
  /** Mesures réutilisables (formules nommées). */
  mesures: DefinitionMesure[];
  enregistrerMesure: (mesure: DefinitionMesure) => void;
  supprimerMesure: (id: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

interface DataProviderProps {
  children: ReactNode;
  /** Projet partagé à afficher : la session locale n'est alors ni lue ni modifiée. */
  etatInitial?: EtatPersiste;
  lectureSeule?: boolean;
}

export function DataProvider({ children, etatInitial, lectureSeule = false }: DataProviderProps) {
  const [projetCourant, setProjetCourant] = useState<ProjetCourant | null>(null);
  const [nomFichier, setNomFichier] = useState<string>("");
  const [sources, setSources] = useState<{ entetes: string[]; corps: Cellule[][] }>({ entetes: [], corps: [] });
  const [entetes, setEntetes] = useState<string[]>([]);
  const [corps, setCorps] = useState<Cellule[][]>([]);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [rapport, setRapport] = useState<BlocRapport[]>([]);
  const [resultat, setResultat] = useState<ResultatAnalyse | null>(null);
  const [graphiquesEpingles, setGraphiquesEpingles] = useState<GraphiqueEpingle[]>([]);
  const [filtresActifs, setFiltresActifs] = useState<ConditionFiltre[]>([]);
  const [definitionsCalculs, setDefinitionsCalculs] = useState<DefinitionColonneCalculee[]>([]);
  const [restaurationTerminee, setRestaurationTerminee] = useState(false);
  const [source, setSource] = useState<SourceDistante | null>(null);
  const [actualisation, setActualisation] = useState<EtatActualisation>({ enCours: false, message: null, erreur: null });
  const actualisationEnCours = useRef(false);
  const [tablesReference, setTablesReference] = useState<TableReference[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [diagnosticsModele, setDiagnosticsModele] = useState<DiagnosticRelation[]>([]);
  const [mesures, setMesures] = useState<DefinitionMesure[]>([]);

  // Recalcule le jeu de données affiché : sources → colonnes reliées → colonnes calculées → filtres
  function regenererDonnees(
    sourceEntetes: string[],
    sourceCorps: Cellule[][],
    calculs: DefinitionColonneCalculee[],
    filtres: ConditionFiltre[],
    modele: ModeleSession = { tables: tablesReference, relations }
  ) {
    if (!sourceEntetes.length || !sourceCorps.length) return;

    // 0. Colonnes des tables de référence (relations du modèle de données)
    const avecModele = appliquerModele(sourceEntetes, sourceCorps, modele.tables, modele.relations);
    setDiagnosticsModele(avecModele.diagnostics);
    const colonnesReliees = avecModele.entetes.slice(sourceEntetes.length);

    // 1. Colonnes calculées puis filtres (même fonction que celle qui rejoue les recettes)
    const final = executerEtapes(avecModele.entetes, avecModele.corps, calculs, filtres);
    setEntetes(final.entetes);
    setCorps(final.corps);
    setChoisies((prev) => Array.from(new Set([...prev, ...colonnesReliees, ...calculs.map((c) => c.nomNouvelleColonne)])));
  }

  /** Prépare un tableau importé : en-têtes propres, lignes vides et lignes de totaux retirées, corrections de saisie évidentes. */
  function nettoyerImport(entetesData: string[], corpsData: Cellule[][]): { entetes: string[]; corps: Cellule[][] } {
    // 1. Purge immédiate du BOM UTF-8 et des guillemets sur les en-têtes
    const entetesPropres = nettoyerEntetes(entetesData);

    // 2. Filtrage des lignes de calculs parasites (Totaux, Variations, Lignes vides)
    const corpsFiltre = corpsData.filter((ligne) => {
      if (!ligne || ligne.length === 0) return false;
      const aDesValeurs = ligne.some((c) => !estValeurVide(c));
      if (!aDesValeurs) return false;
      return !estLigneTotal(ligne);
    });

    // 3. Conversion en objets avec protection mémoire pour grands volumes
    const echantillon = corpsFiltre.slice(0, 2500);
    const echantillonObjets = echantillon.map((ligne) => {
      const obj: Record<string, any> = {};
      entetesPropres.forEach((h, idx) => {
        obj[h] = ligne[idx];
      });
      return obj;
    });

    const rapportNettoyage = analyserNettoyage(echantillonObjets);
    const corrections: { colonne: string; valeurOriginale: any; valeurSuggeree: any }[] = [];

    Object.values(rapportNettoyage.suggestionsParColonne).forEach((suggestions) => {
      suggestions.forEach((s) => {
        if (s.colonne && s.valeurOriginale && s.valeurSuggeree) {
          corrections.push({
            colonne: s.colonne,
            valeurOriginale: s.valeurOriginale,
            valeurSuggeree: s.valeurSuggeree,
          });
        }
      });
    });

    let corpsNettoye = corpsFiltre;
    if (corrections.length > 0) {
      const donneesCompletesObjets = corpsFiltre.map((ligne) => {
        const obj: Record<string, any> = {};
        entetesPropres.forEach((h, idx) => {
          obj[h] = ligne[idx];
        });
        return obj;
      });

      const donneesPropres = appliquerCorrections(donneesCompletesObjets, corrections);
      corpsNettoye = donneesPropres.map((obj) => entetesPropres.map((h) => obj[h]));
    }
    return { entetes: entetesPropres, corps: corpsNettoye };
  }

  function chargerDonnees(
    nom: string,
    entetesData: string[],
    corpsData: Cellule[][],
    nouveauResultat?: ResultatAnalyse | null,
    nouveauRapport?: BlocRapport[],
    nouvelleSource?: SourceDistante | null
  ) {
    const { entetes: entetesPropres, corps: corpsNettoye } = nettoyerImport(entetesData, corpsData);

    setSource(nouvelleSource ?? null);
    setActualisation({ enCours: false, message: null, erreur: null });
    // Nouveau fichier : le modèle et les mesures du précédent ne s'appliquent plus
    setTablesReference([]);
    setRelations([]);
    setDiagnosticsModele([]);
    setMesures([]);
    setProjetCourant(null);
    setNomFichier(nom);
    setSources({ entetes: entetesPropres, corps: corpsNettoye });
    setEntetes(entetesPropres);
    setCorps(corpsNettoye);
    setChoisies(entetesPropres);
    setFiltresActifs([]);
    setDefinitionsCalculs([]);

    setRapport(nouveauRapport ?? []);
    setResultat(nouveauResultat ?? null);
    setGraphiquesEpingles([]);
  }

  /**
   * Retélécharge la source en direct et remplace les données.
   * Les réglages sont conservés tant que leurs colonnes existent encore ; l'analyse est recalculée.
   */
  async function actualiserSource() {
    if (!source || lectureSeule || actualisationEnCours.current) return;
    actualisationEnCours.current = true;
    setActualisation((a) => ({ ...a, enCours: true, erreur: null }));
    const origine = source;
    try {
      const { tableau } = await telechargerSource(origine.urlTelechargement, nomFichier);
      const propre = nettoyerImport(tableau.entetes, tableau.corps);

      // Colonnes calculées puis filtres : rejoués comme une recette, sur les colonnes du fichier et celles des tables reliées
      // (colonnes renommées reconnues, étapes impossibles écartées)
      const entetesReliees = appliquerModele(propre.entetes, propre.corps, tablesReference, relations).entetes;
      const adaptation = adapterRecette(creerRecette("", sources.entetes, definitionsCalculs, filtresActifs), entetesReliees);
      const { calculs, filtres } = adaptation;
      const disponibles = new Set([...entetesReliees, ...calculs.map((c) => c.nomNouvelleColonne)]);

      const ajoutees = propre.entetes.filter((h) => !sources.entetes.includes(h));
      const retirees = sources.entetes.filter((h) => !propre.entetes.includes(h));
      const ecart = propre.corps.length - sources.corps.length;
      const notes = [`${propre.corps.length.toLocaleString("fr-FR")} lignes${ecart ? ` (${ecart > 0 ? "+" : "−"}${Math.abs(ecart).toLocaleString("fr-FR")})` : ", nombre inchangé"}`];
      if (ajoutees.length) notes.push(`${ajoutees.length} colonne(s) ajoutée(s) : ${ajoutees.slice(0, 4).join(", ")}${ajoutees.length > 4 ? "…" : ""}`);
      if (retirees.length) notes.push(`${retirees.length} colonne(s) disparue(s) : ${retirees.slice(0, 4).join(", ")}${retirees.length > 4 ? "…" : ""}`);
      const reglagesPerdus = definitionsCalculs.length - calculs.length + (filtresActifs.length - filtres.length);
      if (reglagesPerdus) notes.push(`${reglagesPerdus} filtre(s) ou colonne(s) calculée(s) retiré(s), faute de colonne`);
      if (adaptation.renommees.length) notes.push(`colonne(s) reconnue(s) sous un autre nom : ${adaptation.renommees.map(([a, b]) => `${a} → ${b}`).join(", ")}`);

      setSources(propre);
      setDefinitionsCalculs(calculs);
      setFiltresActifs(filtres);
      const renomme = new Map(adaptation.renommees);
      setChoisies((prev) => {
        const gardees = prev.map((c) => renomme.get(c) ?? c).filter((c) => disponibles.has(c));
        return [...gardees, ...ajoutees.filter((c) => !gardees.includes(c))];
      });
      regenererDonnees(propre.entetes, propre.corps, calculs, filtres);
      // L'analyse et le rapport décrivaient les anciennes données : ils sont recalculés à l'affichage
      setResultat(null);
      setRapport([]);
      setSource((actuelle) => (actuelle && actuelle.urlTelechargement === origine.urlTelechargement ? { ...actuelle, derniereMaj: new Date().toISOString() } : actuelle));
      setActualisation({ enCours: false, message: `${notes.join(" · ")}.`, erreur: null });
    } catch (e) {
      setActualisation((a) => ({ ...a, enCours: false, erreur: e instanceof Error ? e.message : "L'actualisation a échoué." }));
    } finally {
      actualisationEnCours.current = false;
    }
  }

  function definirIntervalleSource(minutes: number) {
    setSource((actuelle) => (actuelle ? normaliserSource({ ...actuelle, intervalleMinutes: minutes }) : actuelle));
  }

  // Actualisation automatique : à intervalle régulier tant que l'onglet est visible, et au retour sur l'onglet si le délai est dépassé
  const actualiserRef = useRef(actualiserSource);
  actualiserRef.current = actualiserSource;
  const intervalleMinutes = source?.intervalleMinutes ?? 0;
  const adresseSource = source?.urlTelechargement ?? "";
  const derniereMajRef = useRef<string>("");
  derniereMajRef.current = source?.derniereMaj ?? "";
  useEffect(() => {
    if (lectureSeule || !adresseSource || !intervalleMinutes) return;
    const delai = intervalleMinutes * 60_000;
    const siPerimee = () => {
      if (document.visibilityState !== "visible") return;
      const age = Date.now() - Date.parse(derniereMajRef.current || "");
      if (Number.isNaN(age) || age >= delai - 5000) void actualiserRef.current();
    };
    const minuteur = setInterval(siPerimee, Math.min(delai, 60_000));
    document.addEventListener("visibilitychange", siPerimee);
    return () => {
      clearInterval(minuteur);
      document.removeEventListener("visibilitychange", siPerimee);
    };
  }, [lectureSeule, adresseSource, intervalleMinutes]);

  function ajouterFiltre(filtre: ConditionFiltre) {
    const maj = [...filtresActifs, filtre];
    setFiltresActifs(maj);
    regenererDonnees(sources.entetes, sources.corps, definitionsCalculs, maj);
  }

  function supprimerFiltre(index: number) {
    const maj = filtresActifs.filter((_, i) => i !== index);
    setFiltresActifs(maj);
    regenererDonnees(sources.entetes, sources.corps, definitionsCalculs, maj);
  }

  function reinitialiserFiltres() {
    setFiltresActifs([]);
    regenererDonnees(sources.entetes, sources.corps, definitionsCalculs, []);
  }

  function creerColonneCalculee(def: DefinitionColonneCalculee) {
    const maj = [...definitionsCalculs, def];
    setDefinitionsCalculs(maj);
    regenererDonnees(sources.entetes, sources.corps, maj, filtresActifs);
  }

  function supprimerColonneCalculee(index: number): string[] {
    const r = retirerCalcul(definitionsCalculs, filtresActifs, index);
    const retirees = new Set(definitionsCalculs.filter((c) => !r.calculs.includes(c)).map((c) => c.nomNouvelleColonne));
    setDefinitionsCalculs(r.calculs);
    setFiltresActifs(r.filtres);
    setChoisies((prev) => prev.filter((c) => !retirees.has(c)));
    regenererDonnees(sources.entetes, sources.corps, r.calculs, r.filtres);
    return r.ricochets;
  }

  /** Colonnes disponibles avant les étapes : celles du fichier, plus celles des tables reliées par le modèle de données. */
  function colonnesAvecModele(base: { entetes: string[]; corps: Cellule[][] }): string[] {
    return appliquerModele(base.entetes, base.corps, tablesReference, relations).entetes;
  }

  function recetteCourante(nom: string): Recette {
    const disponibles = colonnesAvecModele(sources);
    // Colonnes choisies enregistrées seulement si l'utilisateur en a écarté : sinon « toutes », y compris les futures
    const toutes = [...disponibles, ...definitionsCalculs.map((c) => c.nomNouvelleColonne)];
    const restreint = toutes.some((c) => !choisies.includes(c));
    return creerRecette(nom, disponibles, definitionsCalculs, filtresActifs, restreint ? choisies.filter((c) => toutes.includes(c)) : undefined);
  }

  /** Installe des données sources et des étapes adaptées, et invalide ce qui décrivait l'état précédent. */
  function installerEtapes(base: { entetes: string[]; corps: Cellule[][] }, rapportRecette: RapportRecette) {
    setDefinitionsCalculs(rapportRecette.calculs);
    setFiltresActifs(rapportRecette.filtres);
    regenererDonnees(base.entetes, base.corps, rapportRecette.calculs, rapportRecette.filtres);
    setChoisies(rapportRecette.colonnesChoisies);
    setResultat(null);
    setRapport([]);
  }

  function appliquerRecette(recette: Recette): RapportRecette {
    const r = adapterRecette(recette, colonnesAvecModele(sources));
    installerEtapes(sources, r);
    return r;
  }

  function rejouerSurFichier(nom: string, entetesData: string[], corpsData: Cellule[][], recette?: Recette): RapportRecette {
    const aRejouer = recette ?? recetteCourante(nomFichier || "Étapes actuelles");
    const propre = nettoyerImport(entetesData, corpsData);
    // Le modèle de données (tables de référence, relations) et les mesures font partie de la préparation : ils sont gardés
    const r = adapterRecette(aRejouer, colonnesAvecModele(propre));
    setNomFichier(nom);
    setSources(propre);
    setSource(null);
    setActualisation({ enCours: false, message: null, erreur: null });
    setProjetCourant(null);
    // Les graphiques épinglés sont des instantanés de l'ancien fichier : les garder montrerait d'anciens chiffres
    setGraphiquesEpingles([]);
    installerEtapes(propre, r);
    return r;
  }

  function nettoyerDonnees(corrections: { colonne: string; valeurOriginale: any; valeurSuggeree: any }[]) {
    if (!corrections.length) return;
    const objs = sources.corps.map((ligne) => {
      const obj: Record<string, any> = {};
      sources.entetes.forEach((h, idx) => {
        obj[h] = ligne[idx];
      });
      return obj;
    });
    const propres = appliquerCorrections(objs, corrections);
    const corpsPropre: Cellule[][] = propres.map((obj) => sources.entetes.map((h) => obj[h]));
    setSources({ entetes: sources.entetes, corps: corpsPropre });
    regenererDonnees(sources.entetes, corpsPropre, definitionsCalculs, filtresActifs);
  }

  function appliquerEtat(etat: EtatPersiste) {
    const modele: ModeleSession = { tables: etat.tablesReference ?? [], relations: etat.relations ?? [] };
    setNomFichier(etat.nomFichier);
    setSources(etat.sources);
    setDefinitionsCalculs(etat.definitionsCalculs);
    setFiltresActifs(etat.filtresActifs);
    setTablesReference(modele.tables);
    setRelations(modele.relations);
    setMesures(etat.mesures ?? []);
    regenererDonnees(etat.sources.entetes, etat.sources.corps, etat.definitionsCalculs, etat.filtresActifs, modele);
    setChoisies(etat.choisies);
    setRapport(etat.rapport);
    setResultat(etat.resultat);
    setGraphiquesEpingles(etat.graphiquesEpingles || []);
    setProjetCourant(etat.projet ?? null);
    setSource(normaliserSource(etat.source));
    setActualisation({ enCours: false, message: null, erreur: null });
  }

  function ouvrirEtat(etat: EtatPersiste, projet: ProjetCourant | null = null) {
    appliquerEtat({ ...etat, projet });
  }

  function obtenirEtat(): EtatPersiste {
    return {
      nomFichier,
      sources,
      choisies,
      rapport,
      resultat,
      graphiquesEpingles,
      filtresActifs,
      definitionsCalculs,
      projet: projetCourant,
      source,
      tablesReference,
      relations,
      mesures,
    };
  }

  // Restauration de l'état persisté (ou affichage direct d'un projet partagé)
  useEffect(() => {
    if (etatInitial) {
      appliquerEtat({ ...etatInitial, projet: null });
      setRestaurationTerminee(true);
      return;
    }
    let annule = false;
    chargerEtat().then((etat) => {
      if (annule) return;
      if (etat) appliquerEtat(etat);
      setRestaurationTerminee(true);
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sauvegarde automatique
  useEffect(() => {
    if (!restaurationTerminee || lectureSeule) return;
    if (!sources.corps.length) {
      void effacerEtat();
      return;
    }
    const minuteur = setTimeout(() => {
      void sauvegarderEtat({
        nomFichier,
        sources,
        choisies,
        rapport,
        resultat,
        graphiquesEpingles,
        filtresActifs,
        definitionsCalculs,
        projet: projetCourant,
        source,
        tablesReference,
        relations,
        mesures,
      });
    }, 600);
    return () => clearTimeout(minuteur);
  }, [restaurationTerminee, lectureSeule, nomFichier, sources, choisies, rapport, resultat, graphiquesEpingles, filtresActifs, definitionsCalculs, projetCourant, source, tablesReference, relations, mesures]);

  function supprimerDonnees() {
    setNomFichier("");
    setSources({ entetes: [], corps: [] });
    setEntetes([]);
    setCorps([]);
    setChoisies([]);
    setRapport([]);
    setResultat(null);
    setGraphiquesEpingles([]);
    setFiltresActifs([]);
    setDefinitionsCalculs([]);
    setProjetCourant(null);
    setSource(null);
    setActualisation({ enCours: false, message: null, erreur: null });
    setTablesReference([]);
    setRelations([]);
    setDiagnosticsModele([]);
    setMesures([]);
    if (!lectureSeule) void effacerEtat();
  }

  // ---------- Modèle de données et mesures

  /** Modifie le modèle et recalcule aussitôt les données (filtres ou calculs qui ne s'appliquent plus sont retirés). */
  function changerModele(modele: ModeleSession) {
    const disponibles = new Set(appliquerModele(sources.entetes, sources.corps, modele.tables, modele.relations).entetes);
    const calculs: DefinitionColonneCalculee[] = [];
    for (const def of definitionsCalculs) {
      if (disponibles.has(def.colonneA) && (!def.colonneB || disponibles.has(def.colonneB))) {
        calculs.push(def);
        disponibles.add(def.nomNouvelleColonne);
      }
    }
    const filtres = filtresActifs.filter((f) => disponibles.has(f.colonne));
    setTablesReference(modele.tables);
    setRelations(modele.relations);
    setDefinitionsCalculs(calculs);
    setFiltresActifs(filtres);
    setChoisies((prev) => prev.filter((c) => disponibles.has(c)));
    regenererDonnees(sources.entetes, sources.corps, calculs, filtres, modele);
    // L'analyse décrivait les anciennes colonnes : elle est recalculée à l'affichage
    setResultat(null);
    setRapport([]);
  }

  function ajouterTableReference(table: TableReference) {
    changerModele({ tables: [...tablesReference.filter((t) => t.id !== table.id), table], relations });
  }

  function retirerTableReference(id: string) {
    changerModele({ tables: tablesReference.filter((t) => t.id !== id), relations: relations.filter((r) => r.tableId !== id) });
  }

  function enregistrerRelation(relation: Relation) {
    const existe = relations.some((r) => r.id === relation.id);
    changerModele({ tables: tablesReference, relations: existe ? relations.map((r) => (r.id === relation.id ? relation : r)) : [...relations, relation] });
  }

  function retirerRelation(id: string) {
    changerModele({ tables: tablesReference, relations: relations.filter((r) => r.id !== id) });
  }

  function enregistrerMesure(mesure: DefinitionMesure) {
    setMesures((prev) => (prev.some((m) => m.id === mesure.id) ? prev.map((m) => (m.id === mesure.id ? mesure : m)) : [...prev, mesure]));
  }

  function supprimerMesure(id: string) {
    setMesures((prev) => prev.filter((m) => m.id !== id));
  }

  const colonnesPourRelation = [...sources.entetes, ...diagnosticsModele.flatMap((d) => d.colonnesAjoutees.map((c) => c.nom))];

  const [graphiquesAffiches, setGraphiquesAffiches] = useState<GraphiqueEpingle[]>([]);
  const [graphiquesExclus, setGraphiquesExclus] = useState<string[]>([]);

  function publierGraphiquesAffiches(graphiques: GraphiqueEpingle[]) {
    setGraphiquesAffiches(graphiques);
  }

  function basculerExclusionGraphique(id: number | string) {
    const cle = String(id);
    setGraphiquesExclus((prev) => (prev.includes(cle) ? prev.filter((x) => x !== cle) : [...prev, cle]));
  }

  function epinglerGraphique(graphique: GraphiqueEpingle) {
    setGraphiquesEpingles((prev) =>
      prev.some((g) => String(g.id) === String(graphique.id)) ? prev : [graphique, ...prev]
    );
  }

  function desepinglerGraphique(id: number | string) {
    setGraphiquesEpingles((prev) => prev.filter((g) => String(g.id) !== String(id)));
  }

  return (
    <DataContext.Provider
      value={{
        nomFichier,
        entetes,
        corps,
        choisies,
        rapport,
        resultat,
        graphiquesEpingles,
        graphiquesAffiches,
        publierGraphiquesAffiches,
        graphiquesExclus,
        basculerExclusionGraphique,
        filtresActifs,
        chargerDonnees,
        source,
        actualisation,
        actualiserSource,
        definirIntervalleSource,
        tablesReference,
        relations,
        diagnosticsModele,
        colonnesPourRelation,
        tablePrincipale: sources,
        ajouterTableReference,
        retirerTableReference,
        enregistrerRelation,
        retirerRelation,
        mesures,
        enregistrerMesure,
        supprimerMesure,
        setChoisies,
        setRapport,
        setResultat,
        epinglerGraphique,
        desepinglerGraphique,
        ajouterFiltre,
        supprimerFiltre,
        reinitialiserFiltres,
        creerColonneCalculee,
        definitionsCalculs,
        supprimerColonneCalculee,
        colonnesSource: sources.entetes,
        recetteCourante,
        appliquerRecette,
        rejouerSurFichier,
        nettoyerDonnees,
        supprimerDonnees,
        restaurationTerminee,
        aDesDonnees: sources.corps.length > 0,
        projetCourant,
        definirProjetCourant: setProjetCourant,
        obtenirEtat,
        ouvrirEtat,
        lectureSeule,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData doit être utilisé dans un DataProvider");
  }
  return context;
}
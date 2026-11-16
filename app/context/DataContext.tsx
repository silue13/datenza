"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { BlocRapport } from "../../lib/analyse/rapport";
import type { analyserColonnes } from "../../lib/analyse/analyse";
import {
  type Cellule,
  nettoyerEntetes,
  estLigneTotal,
  estValeurVide,
} from "../../lib/analyse/utils";
import { analyserNettoyage, appliquerCorrections } from "../../lib/analyse/nettoyage";
import {
  appliquerFiltres,
  ajouterColonneCalculee,
  type ConditionFiltre,
  type DefinitionColonneCalculee,
} from "../../lib/analyse/filtres";
import { chargerEtat, sauvegarderEtat, effacerEtat, type EtatPersiste } from "../../lib/persistance";

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
    nouveauRapport?: BlocRapport[]
  ) => void;
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

  // Recalcule le jeu de données affiché à partir des sources, calculs et filtres
  function regenererDonnees(
    baseEntetes: string[],
    baseCorps: Cellule[][],
    calculs: DefinitionColonneCalculee[],
    filtres: ConditionFiltre[]
  ) {
    if (!baseEntetes.length || !baseCorps.length) return;

    // 1. Conversion en objets
    let objs = baseCorps.map((ligne) => {
      const obj: Record<string, any> = {};
      baseEntetes.forEach((h, idx) => {
        obj[h] = ligne[idx];
      });
      return obj;
    });

    // 2. Application des colonnes calculées
    for (const def of calculs) {
      objs = ajouterColonneCalculee(objs, def);
    }

    // 3. Application des filtres
    const objsFiltres = appliquerFiltres(objs, filtres);

    // 4. Reconstruction des entêtes et corps finaux
    const entetesFinales = [...baseEntetes, ...calculs.map((c) => c.nomNouvelleColonne)];
    const corpsFinal: Cellule[][] = objsFiltres.map((obj) => entetesFinales.map((h) => obj[h]));

    setEntetes(entetesFinales);
    setCorps(corpsFinal);
    setChoisies((prev) => Array.from(new Set([...prev, ...calculs.map((c) => c.nomNouvelleColonne)])));
  }

  function chargerDonnees(
    nom: string,
    entetesData: string[],
    corpsData: Cellule[][],
    nouveauResultat?: ResultatAnalyse | null,
    nouveauRapport?: BlocRapport[]
  ) {
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
    setNomFichier(etat.nomFichier);
    setSources(etat.sources);
    setDefinitionsCalculs(etat.definitionsCalculs);
    setFiltresActifs(etat.filtresActifs);
    regenererDonnees(etat.sources.entetes, etat.sources.corps, etat.definitionsCalculs, etat.filtresActifs);
    setChoisies(etat.choisies);
    setRapport(etat.rapport);
    setResultat(etat.resultat);
    setGraphiquesEpingles(etat.graphiquesEpingles || []);
    setProjetCourant(etat.projet ?? null);
  }

  function ouvrirEtat(etat: EtatPersiste, projet: ProjetCourant | null = null) {
    appliquerEtat({ ...etat, projet });
  }

  function obtenirEtat(): EtatPersiste {
    return { nomFichier, sources, choisies, rapport, resultat, graphiquesEpingles, filtresActifs, definitionsCalculs, projet: projetCourant };
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
      });
    }, 600);
    return () => clearTimeout(minuteur);
  }, [restaurationTerminee, lectureSeule, nomFichier, sources, choisies, rapport, resultat, graphiquesEpingles, filtresActifs, definitionsCalculs, projetCourant]);

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
    if (!lectureSeule) void effacerEtat();
  }

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
        setChoisies,
        setRapport,
        setResultat,
        epinglerGraphique,
        desepinglerGraphique,
        ajouterFiltre,
        supprimerFiltre,
        reinitialiserFiltres,
        creerColonneCalculee,
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
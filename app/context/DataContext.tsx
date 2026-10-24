"use client";
import { createContext, useContext, useState, ReactNode } from "react";
import type { BlocRapport } from "../../lib/analyse/rapport";
import type { analyserColonnes } from "../../lib/analyse/analyse";
import type { Cellule } from "../../lib/analyse/utils";
import { analyserNettoyage, appliquerCorrections } from "../../lib/analyse/nettoyage";
import {
  appliquerFiltres,
  ajouterColonneCalculee,
  type ConditionFiltre,
  type DefinitionColonneCalculee,
} from "../../lib/analyse/filtres";

export type ResultatAnalyse = ReturnType<typeof analyserColonnes>;
export type TypeGraphique = "Barres" | "Courbe" | "Camembert" | "Anneau" | "Radar" | "Aires" | "Carte";

export interface GraphiqueEpingle {
  id: number;
  titre: string;
  type: TypeGraphique;
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string | string[];
    borderColor: string;
    borderWidth: number;
  }[];
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
  desepinglerGraphique: (id: number) => void;
  ajouterFiltre: (filtre: ConditionFiltre) => void;
  supprimerFiltre: (index: number) => void;
  reinitialiserFiltres: () => void;
  creerColonneCalculee: (def: DefinitionColonneCalculee) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
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
    // Nettoyage automatique initial de la casse
    const donneesObjets = corpsData.map((ligne) => {
      const obj: Record<string, any> = {};
      entetesData.forEach((h, idx) => {
        obj[h] = ligne[idx];
      });
      return obj;
    });

    const rapportNettoyage = analyserNettoyage(donneesObjets);
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

    let corpsNettoye = corpsData;
    if (corrections.length > 0) {
      const donneesPropres = appliquerCorrections(donneesObjets, corrections);
      corpsNettoye = donneesPropres.map((obj) => entetesData.map((h) => obj[h]));
    }

    setNomFichier(nom);
    setSources({ entetes: entetesData, corps: corpsNettoye });
    setEntetes(entetesData);
    setCorps(corpsNettoye);
    setChoisies(entetesData);
    setFiltresActifs([]);
    setDefinitionsCalculs([]);

    // Conserve le résultat et le rapport fournis lors d'une fusion
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

  function epinglerGraphique(graphique: GraphiqueEpingle) {
    setGraphiquesEpingles((prev) => (prev.some((g) => g.id === graphique.id) ? prev : [graphique, ...prev]));
  }

  function desepinglerGraphique(id: number) {
    setGraphiquesEpingles((prev) => prev.filter((g) => g.id !== id));
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
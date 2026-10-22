"use client";
import { createContext, useContext, useState, ReactNode } from "react";
import type { BlocRapport } from "../../lib/analyse/rapport";
import type { analyserColonnes } from "../../lib/analyse/analyse";
import type { Cellule } from "../../lib/analyse/utils";

export type ResultatAnalyse = ReturnType<typeof analyserColonnes>;

export type TypeGraphique = "Barres" | "Courbe" | "Camembert";

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
  chargerDonnees: (nom: string, entetes: string[], corps: Cellule[][]) => void;
  setChoisies: React.Dispatch<React.SetStateAction<string[]>>;
  setRapport: React.Dispatch<React.SetStateAction<BlocRapport[]>>;
  setResultat: React.Dispatch<React.SetStateAction<ResultatAnalyse | null>>;
  epinglerGraphique: (graphique: GraphiqueEpingle) => void;
  desepinglerGraphique: (id: number) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [nomFichier, setNomFichier] = useState<string>("");
  const [entetes, setEntetes] = useState<string[]>([]);
  const [corps, setCorps] = useState<Cellule[][]>([]);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [rapport, setRapport] = useState<BlocRapport[]>([]);
  const [resultat, setResultat] = useState<ResultatAnalyse | null>(null);
  const [graphiquesEpingles, setGraphiquesEpingles] = useState<GraphiqueEpingle[]>([]);

  function chargerDonnees(nom: string, entetesData: string[], corpsData: Cellule[][]) {
    setNomFichier(nom);
    setEntetes(entetesData);
    setCorps(corpsData);
    setChoisies(entetesData);
    setRapport([]);
    setResultat(null);
    setGraphiquesEpingles([]); // les graphiques épinglés d'un ancien fichier n'ont plus de sens
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
        chargerDonnees,
        setChoisies,
        setRapport,
        setResultat,
        epinglerGraphique,
        desepinglerGraphique,
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

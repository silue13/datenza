import { describe, it, expect } from "vitest";
import {
  comparerFichiers,
  colonnesCommunes,
  empilerPourComparaison,
  normaliserValeurCle,
  cleParDefaut,
  STATUT_ECART,
  STATUT_IDENTIQUE,
  type FichierAComparer,
} from "./comparaison";
import { fusionnerEtNettoyer } from "./fusion";

const janvier: FichierAComparer = {
  nom: "janvier.xlsx",
  entetes: ["Code", "Région", "Date", "Quantité", "Montant (FCFA)"],
  corps: [
    ["A1", "Abidjan", "2025-01-05", 10, 5000],
    ["A2", "Bouaké", "2025-01-06", 4, 2000],
    ["A3", "Korhogo", "2025-01-07", 7, 3500],
  ],
};
const fevrier: FichierAComparer = {
  nom: "fevrier.xlsx",
  // En-têtes écrits autrement, nombres saisis en texte
  entetes: ["code", "region", "date", "quantite", "montant (fcfa)"],
  corps: [
    ["A1", "Abidjan", "05/01/2025", "10", "5 000"],
    ["A2", "Bouaké", "06/01/2025", 6, 3000],
    ["A4", "Man", "08/01/2025", 2, 1000],
  ],
};
const mars: FichierAComparer = {
  nom: "mars.csv",
  entetes: ["Code", "Région", "Date", "Quantité", "Montant (FCFA)"],
  corps: [
    ["A1", "Abidjan", "2025-01-05", 10, 5000],
    ["A2", "Bouaké", "2025-01-06", 8, 4000],
  ],
};

describe("normaliserValeurCle", () => {
  it("rapproche les nombres quel que soit leur format", () => {
    expect(normaliserValeurCle(1001)).toBe(normaliserValeurCle("1001"));
    expect(normaliserValeurCle("1 001")).toBe(normaliserValeurCle(1001));
    expect(normaliserValeurCle("1001,00")).toBe(normaliserValeurCle(1001));
  });
  it("rapproche les dates quel que soit leur format", () => {
    expect(normaliserValeurCle(new Date(2025, 0, 5))).toBe("2025-01-05");
    expect(normaliserValeurCle("05/01/2025")).toBe("2025-01-05");
    expect(normaliserValeurCle("2025-01-05")).toBe("2025-01-05");
  });
  it("ignore casse et accents pour le texte", () => {
    expect(normaliserValeurCle(" Bouaké ")).toBe(normaliserValeurCle("BOUAKE"));
  });
});

describe("colonnesCommunes", () => {
  it("réunit les variantes d'écriture et détecte la nature des colonnes", () => {
    const cols = colonnesCommunes([janvier, fevrier]);
    expect(cols.map((c) => c.nom)).toEqual(["Code", "Région", "Date", "Quantité", "Montant (FCFA)"]);
    const nature = Object.fromEntries(cols.map((c) => [c.nom, c.nature]));
    expect(nature["Quantité"]).toBe("numerique");
    expect(nature["Montant (FCFA)"]).toBe("numerique");
    expect(nature["Région"]).toBe("texte");
    expect(cleParDefaut(cols)).toBe("Code");
  });
});

describe("comparerFichiers", () => {
  it("compare 3 fichiers par clé, nombres compris", () => {
    const r = comparerFichiers([janvier, fevrier, mars], { cles: ["Code"] });
    expect(r.bilan.nbFichiers).toBe(3);
    expect(r.bilan.nbCles).toBe(4);

    const col = (nom: string) => r.entetes.indexOf(nom);
    const ligne = (code: string) => r.corps.find((l) => l[0] === code)!;

    // A1 : identique partout, même si février a saisi « 5 000 » en texte et la date au format français
    expect(ligne("A1")[col("Statut")]).toBe(STATUT_IDENTIQUE);
    expect(ligne("A1")[col("Date — comparaison")]).toBe("Identique");

    // A2 : écarts numériques calculés pour chaque fichier par rapport à la référence (janvier)
    const a2 = ligne("A2");
    expect(a2[col("Statut")]).toBe(STATUT_ECART);
    expect(a2[col("Quantité [janvier]")]).toBe(4);
    expect(a2[col("Quantité [fevrier]")]).toBe(6);
    expect(a2[col("Quantité [mars]")]).toBe(8);
    expect(a2[col("Quantité — écart fevrier vs janvier")]).toBe(2);
    expect(a2[col("Quantité — écart mars vs janvier")]).toBe(4);
    expect(a2[col("Montant (FCFA) — variation % mars vs janvier")]).toBe(100);

    // A3 et A4 : absents d'au moins un fichier
    expect(ligne("A3")[col("Statut")]).toBe("Absent de : fevrier, mars");
    expect(ligne("A4")[col("Présence")]).toBe("1/3");
    expect(r.bilan.parFichier.map((p) => p.absentes)).toEqual([1, 1, 2]);

    // Les écarts sont listés en premier
    expect(r.corps[0][col("Statut")]).toBe(STATUT_ECART);
  });

  it("regroupe par une colonne texte en sommant les montants", () => {
    const a = { nom: "a.csv", entetes: ["Région", "Montant"], corps: [["Nord", 10], ["Nord", 5], ["Sud", 3]] };
    const b = { nom: "b.csv", entetes: ["Région", "Montant"], corps: [["Nord", 20], ["Sud", 3]] };
    const r = comparerFichiers([a, b], { cles: ["Région"] });
    const nord = r.corps.find((l) => l[0] === "Nord")!;
    expect(nord[r.entetes.indexOf("Montant [a]")]).toBe(15);
    expect(nord[r.entetes.indexOf("Montant — écart b vs a")]).toBe(5);
    expect(r.bilan.lignesRegroupees).toBe(1);
  });

  it("sans clé, compare les totaux de chaque colonne numérique", () => {
    const r = comparerFichiers([janvier, fevrier, mars], { cles: [] });
    expect(r.entetes.slice(0, 5)).toEqual(["Indicateur", "Calcul", "janvier", "fevrier", "mars"]);
    const montant = r.corps.find((l) => l[0] === "Montant (FCFA)")!;
    expect(montant.slice(2, 5)).toEqual([10500, 9000, 9000]);
    expect(r.synthese.find((s) => s.colonne === "Quantité")?.parFichier.map((p) => p.valeur)).toEqual([21, 18, 18]);
  });

  it("prend la référence choisie pour les écarts", () => {
    const r = comparerFichiers([janvier, fevrier], { cles: ["Code"], reference: 1 });
    expect(r.entetes).toContain("Quantité — écart janvier vs fevrier");
  });

  it("refuse les fichiers sans colonne commune", () => {
    expect(() => comparerFichiers([janvier, { nom: "x", entetes: ["Autre"], corps: [[1]] }], { cles: [] })).toThrow();
  });
});

describe("empilerPourComparaison", () => {
  it("garde toutes les colonnes communes, même écrites différemment", () => {
    const r = empilerPourComparaison([janvier, fevrier]);
    expect(r.entetes).toEqual(["Fichier Source", "Code", "Région", "Date", "Quantité", "Montant (FCFA)"]);
    expect(r.corps).toHaveLength(6);
    expect(r.corps[3]).toEqual(["fevrier.xlsx", "A1", "Abidjan", "05/01/2025", "10", "5 000"]);
  });
});

describe("jointure de la page Fusion", () => {
  it("rapproche une clé numérique saisie en nombre d'un côté et en texte de l'autre", () => {
    const a = { nom: "a", entetes: ["Matricule", "Nom"], corps: [[1001, "Koné"], [1002, "Traoré"]] };
    const b = { nom: "b", entetes: ["Matricule", "Salaire"], corps: [["1001", 300000], ["1 002", 250000]] };
    const r = fusionnerEtNettoyer([a, b], {
      mode: "jointure",
      jointure: { indexFichierA: 0, indexFichierB: 1, cleFichierA: "Matricule", cleFichierB: "Matricule", typeJointure: "inter" },
      supprimerDoublons: false,
      harmoniserFormatsNumeriques: false,
      harmoniserDates: false,
      nettoyerEspaces: false,
      remplirValeursVides: false,
      valeurRemplacementVide: "",
      alignerColonnesSimilaires: false,
    });
    expect(r.rapport.nbCorrespondances).toBe(2);
  });
});

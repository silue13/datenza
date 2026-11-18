import { describe, it, expect } from "vitest";
import { appliquerCorrespondance, ressemblanceNoms, suggererCorrespondance } from "./correspondance";

describe("analyse/correspondance", () => {
  it("reconnaît les synonymes et les variantes d'écriture", () => {
    expect(ressemblanceNoms("CA", "Chiffre d'affaires")).toBeGreaterThanOrEqual(0.9);
    expect(ressemblanceNoms("Qté", "Quantité")).toBeGreaterThanOrEqual(0.9);
    expect(ressemblanceNoms("Localité", "Ville")).toBeGreaterThanOrEqual(0.9);
    expect(ressemblanceNoms("Montant_TTC", "montant ttc")).toBe(1);
    expect(ressemblanceNoms("Nom du client", "Client")).toBeGreaterThanOrEqual(0.6);
    expect(ressemblanceNoms("Montant HT", "Montant TTC")).toBe(0);
    expect(ressemblanceNoms("Date", "Région")).toBe(0);
  });

  it("propose une correspondance une à une, la plus sûre d'abord", () => {
    const ref = { nom: "a", entetes: ["Code", "CA", "Ville", "Date"], corps: [] };
    const autre = { nom: "b", entetes: ["Référence", "Chiffre d'affaires", "Localité", "Commentaire"], corps: [] };
    expect(suggererCorrespondance(ref, autre, ["Code"], ["Référence"])).toEqual({ CA: "Chiffre d'affaires", Ville: "Localité", Date: null });
  });

  it("renomme les colonnes rapprochées sans créer de doublon", () => {
    const autre = { nom: "b", entetes: ["Chiffre d'affaires", "CA", "Ville"], corps: [[1, 2, "x"]] };
    const r = appliquerCorrespondance(autre, { CA: "Chiffre d'affaires", Ville: "Ville" });
    expect(r.entetes).toEqual(["CA", "CA (2)", "Ville"]);
    expect(r.corps).toBe(autre.corps);
  });
});

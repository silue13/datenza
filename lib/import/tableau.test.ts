import { describe, it, expect } from "vitest";
import { decoderTexte, detecterSeparateur, jsonVersLignes, parserCsv, preparerTableau } from "./tableau";

describe("import/tableau", () => {
  it("ignore le titre, les totaux et les en-têtes répétés", () => {
    const csv =
      'Rapport des ventes 2024;;;\nExtrait le 01/02/2024;;;\n\nRégion;Produit;"Montant (FCFA)";Date\n' +
      'Poro;"Riz; long";1 250,5;15/01/2024\nGbeke;Maïs;"2 000";16/01/2024\nRégion;Produit;Montant (FCFA);Date\nTOTAL;;3 250,5;\n';
    expect(detecterSeparateur(csv)).toBe(";");
    const t = preparerTableau(parserCsv(csv));
    expect(t.entetes).toEqual(["Région", "Produit", "Montant (FCFA)", "Date"]);
    expect(t.corps).toEqual([
      ["Poro", "Riz; long", "1 250,5", "15/01/2024"],
      ["Gbeke", "Maïs", "2 000", "16/01/2024"],
    ]);
    expect(t.avertissements).toHaveLength(3);
  });
  it("convertit les nombres anglais et les dates américaines", () => {
    const csv = 'Order Date,Sales,Name\n12/25/2024,"1,234.50","Doe, John"\n1/5/2024,"12,000",Ann\n3/17/2024,"1,234,567.00",Bob\n';
    expect(detecterSeparateur(csv)).toBe(",");
    const t = preparerTableau(parserCsv(csv));
    expect(t.corps).toEqual([
      ["2024-12-25", 1234.5, "Doe, John"],
      ["2024-01-05", 12000, "Ann"],
      ["2024-03-17", 1234567, "Bob"],
    ]);
  });
  it("ne touche pas aux décimales françaises", () => {
    const t = preparerTableau(parserCsv("Produit;Prix\nA;1,234\nB;12,5\nC;0,750\n"));
    expect(t.corps.map((l) => l[1])).toEqual(["1,234", "12,5", "0,750"]);
  });
  it("gère les retours à la ligne dans une cellule et les guillemets doublés", () => {
    const l = parserCsv('a,b\n"ligne 1\nligne 2","dit ""oui"""\n');
    expect(l).toEqual([["a", "b"], ["ligne 1\nligne 2", 'dit "oui"']]);
  });
  it("retire les colonnes vides et nomme les colonnes sans titre ou en double", () => {
    const t = preparerTableau([["Nom", "", "Nom", ""], ["a", "", "b", "x"], ["c", "", "d", "y"]]);
    expect(t.entetes).toEqual(["Nom", "Nom (2)", "Colonne 3"]);
    expect(t.corps[0]).toEqual(["a", "b", "x"]);
  });
  it("accepte des années comme en-têtes et des dates Excel", () => {
    const t = preparerTableau([["Pays", 2019, 2020], ["CI", 1, 2], ["SN", new Date(2024, 2, 8), 4]]);
    expect(t.entetes).toEqual(["Pays", "2019", "2020"]);
    expect(t.corps[1][1]).toBe("2024-03-08");
  });
  it("lit du JSON imbriqué", () => {
    const t = preparerTableau(jsonVersLignes('{"data":[{"a":1,"b":{"c":"x"}},{"a":2,"d":[1,2]}]}'));
    expect(t.entetes).toEqual(["a", "b.c", "d"]);
    expect(t.corps).toEqual([[1, "x", ""], [2, "", "1, 2"]]);
  });
  it("décode les CSV Windows (accents) comme l'UTF-8", () => {
    expect(decoderTexte(new Uint8Array([0x52, 0xe9, 0x67, 0x69, 0x6f, 0x6e]))).toBe("Région");
    expect(decoderTexte(new Uint8Array([0xef, 0xbb, 0xbf, 0x52, 0xc3, 0xa9]))).toBe("Ré");
  });
  it("lit le point comme séparateur de milliers dans un tableau de recensement", () => {
    const t = preparerTableau([
      ["Localite", "Hommes", "Menages", "Taille_moyenne_menage", "Superficie"],
      ["A", "9.073", "2.618", "6.4", "9.073"],
      ["B", "44.710", "981", "5.5", "12.250"],
      ["C", "433.752", "152.187", "8", "3.100"],
      ["D", "5.790", "1.592", "7.3", "0.250"],
    ]);
    expect(t.corps.map((l) => l[1])).toEqual([9073, 44710, 433752, 5790]);
    expect(t.corps.map((l) => l[2])).toEqual([2618, 981, 152187, 1592]);
    // Vraies décimales : intactes
    expect(t.corps.map((l) => l[3])).toEqual(["6.4", "5.5", "8", "7.3"]);
    expect(t.corps.map((l) => l[4])).toEqual(["9.073", "12.250", "3.100", "0.250"]);
    expect(t.avertissements.join(" ")).toContain("Hommes, Menages");
  });
  it("répare une colonne de comptage déjà enregistrée avec la mauvaise lecture", () => {
    const t = preparerTableau([
      ["Localite", "Population_totale", "Menages", "Taille_moyenne_menage", "Rendement"],
      ["A", 16.826, 2.618, 6.4, 1.234],
      ["B", 85.6, 981, 5.5, 2.345],
      ["C", 832.371, 152.187, 8, 3.456],
      ["D", 11.586, 1.592, 7.3, 4.567],
    ]);
    expect(t.corps.map((l) => l[1])).toEqual([16826, 85600, 832371, 11586]);
    expect(t.corps.map((l) => l[2])).toEqual([2618, 981, 152187, 1592]);
    expect(t.corps.map((l) => l[3])).toEqual([6.4, 5.5, 8, 7.3]);
    // Sans nom de comptage, des nombres à 3 décimales restent des décimales
    expect(t.corps.map((l) => l[4])).toEqual([1.234, 2.345, 3.456, 4.567]);
  });
});

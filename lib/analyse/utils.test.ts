// src/lib/analyse/utils.test.ts
import { describe, it, expect } from "vitest";
import { arrondir, estColonneIdentifiant, estColonneTemporelle, estLigneTotal, estValeurVide, parseNombre, statistiquesNumeriques, versNumeriques } from "./utils";

describe("analyse/utils", () => {
  it("calcule les statistiques de base", () => {
    const s = statistiquesNumeriques([1, 2, 3, 4, 5]);
    expect(s.n).toBe(5);
    expect(s.moyenne).toBe(3);
    expect(s.mediane).toBe(3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.atypiques).toBe(0);
  });

  it("détecte une valeur atypique", () => {
    const s = statistiquesNumeriques([10, 11, 12, 11, 10, 12, 11, 500]);
    expect(s.atypiques).toBe(1);
  });

  it("gère la virgule décimale et ignore le non numérique", () => {
    expect(versNumeriques(["1,5", " 2 ", "", "abc"])).toEqual([1.5, 2]);
  });

  it("lit les milliers séparés par des espaces", () => {
    expect(versNumeriques(["1 234,5", "2\u00A0000", "3\u202F500"])).toEqual([1234.5, 2000, 3500]);
  });

  it("reconnaît les valeurs vides", () => {
    expect(estValeurVide("N/A")).toBe(true);
    expect(estValeurVide("  ")).toBe(true);
    expect(estValeurVide(null)).toBe(true);
    expect(estValeurVide(0)).toBe(false);
  });

  it("renvoie des null pour un tableau vide", () => {
    expect(statistiquesNumeriques([]).moyenne).toBeNull();
  });
});

describe("analyse/utils — robustesse", () => {
  const seq = (n: number, f: (i: number) => string | number) => Array.from({ length: n }, (_, i) => f(i));
  it("lit tous les formats de nombres courants", () => {
    const cas: [unknown, number | null][] = [
      ["1 250,50", 1250.5], ["1,250.50", 1250.5], ["1.250,50", 1250.5], ["1'250", 1250], ["(1 250)", -1250],
      ["1250-", -1250], ["−12", -12], ["12 %", 12], ["1 500 FCFA", 1500], ["45 000 F CFA", 45000], ["$ 1,200.00", 1200],
      ["35 kg", 35], ["1,5 M", 1500000], ["2,3 milliards", 2.3e9], ["1.234.567", 1234567], ["1,234,567", 1234567],
      ["1 234 567,89 €", 1234567.89], [".5", 0.5], [42, 42],
    ];
    for (const [entree, attendu] of cas) expect(parseNombre(entree)).toBe(attendu);
  });
  it("refuse ce qui n'est pas un nombre", () => {
    for (const v of ["192.168.1.1", "1.2.3", "12A", "Infinity", "0x1F", "2024-01-15", "15/01/2024", "12:30", "2 Plateaux", "abc", "", NaN, null])
      expect(parseNombre(v)).toBeNull();
  });
  it("ne confond pas une catégorie avec une ligne de total", () => {
    for (const l of [["TOTAL", 1], ["Total général", 5], ["Variation 2023/2022", 3], ["Sous-total Nord", 4], ["Total Poro", 4]]) expect(estLigneTotal(l)).toBe(true);
    for (const l of [["Moyenne gamme", 3], ["Totalgaz", 2], ["Sommelier", 1], ["Général Motors", 4], [12, "x"]]) expect(estLigneTotal(l)).toBe(false);
  });
  it("ne classe pas une mesure parmi les identifiants", () => {
    expect(estColonneIdentifiant("Ventes", seq(40, (i) => 1234.56 + i * 77.3))).toBe(false);
    expect(estColonneIdentifiant("Nombre de dossiers", seq(40, (i) => i + 1))).toBe(false);
    expect(estColonneIdentifiant("Demandes traitées", seq(30, (i) => i % 7))).toBe(false);
    expect(estColonneIdentifiant("Client", seq(40, (i) => `Client ${i % 5}`))).toBe(false);
    expect(estColonneIdentifiant("Client", seq(40, (i) => `C${i}`))).toBe(true);
    expect(estColonneIdentifiant("N°", seq(30, (i) => i + 1))).toBe(true);
    expect(estColonneIdentifiant("Ligne", seq(30, (i) => i + 1))).toBe(true);
  });
  it("reconnaît un axe de temps à ses valeurs, pas seulement à son nom", () => {
    expect(estColonneTemporelle("Mois", ["Janvier", "Février", "Mars"])).toBe(true);
    expect(estColonneTemporelle("Période", ["T1 2024", "T2 2024"])).toBe(true);
    expect(estColonneTemporelle("Order Date", ["12/25/2024", "1/5/2024", "3/17/2024"])).toBe(true);
    expect(estColonneTemporelle("Durée en mois", [3, 12, 24, 7])).toBe(false);
    expect(estColonneTemporelle("Mise à jour par", ["Awa", "Koffi", "Yao"])).toBe(false);
    expect(estColonneTemporelle("Montant", [1950, 2010, 2050, 1999])).toBe(false);
  });
  it("calcule un écart-type d'échantillon et garde les petites valeurs", () => {
    expect(statistiquesNumeriques([2, 4, 4, 4, 5, 5, 7, 9])).toMatchObject({ somme: 40, moyenne: 5, ecartType: 2.14 });
    expect(statistiquesNumeriques([0, 0, 0, 0, 0, 0, 0, 5]).atypiques).toBe(0);
    expect(arrondir(0.003456)).toBe(0.003456);
    expect(arrondir(1234.5678)).toBe(1234.57);
  });
});

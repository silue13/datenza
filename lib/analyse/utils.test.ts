// src/lib/analyse/utils.test.ts
import { describe, it, expect } from "vitest";
import { estValeurVide, versNumeriques, statistiquesNumeriques } from "./utils";

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
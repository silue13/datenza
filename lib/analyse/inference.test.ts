import { describe, expect, it } from "vitest";
import {
  anova,
  corrigerHolm,
  formaterP,
  pCorrelation,
  pFisher,
  pKhiDeux,
  pStudentBilateral,
  resumerGroupe,
  testKhiDeux,
  testWelch,
} from "./inference";

// Valeurs de référence calculées avec SciPy 1.x (scipy.stats)
describe("lois de probabilité", () => {
  it("Student bilatérale", () => {
    expect(pStudentBilateral(2.0, 10)).toBeCloseTo(0.07338803477, 9);
    expect(pStudentBilateral(1.5, 3.7)).toBeCloseTo(0.21359816920, 9); // ddl non entiers (Welch)
    expect(pStudentBilateral(0, 5)).toBeCloseTo(1, 12);
  });

  it("Fisher", () => {
    expect(pFisher(4.102821, 2, 10)).toBeCloseTo(0.05, 8);
    expect(pFisher(0, 2, 10)).toBe(1);
  });

  it("khi-deux", () => {
    expect(pKhiDeux(3.841458820694124, 1)).toBeCloseTo(0.05, 10);
    expect(pKhiDeux(40, 30)).toBeCloseTo(0.10486428110, 9);
  });
});

describe("tests", () => {
  it("t de Welch", () => {
    const r = testWelch([12, 15, 14, 10, 13, 18, 16], [22, 19, 25, 21, 24, 20])!;
    expect(r.statistique).toBeCloseTo(-5.691223886, 8);
    expect(r.ddl as number).toBeCloseTo(10.98628144, 6);
    expect(r.pValeur).toBeCloseTo(0.000140660633, 10);
    expect(r.effet).toBeCloseTo(-3.131436068, 8);
    expect(r.ampleur).toBe("forte");
  });

  it("t de Welch : null sans variabilité ou avec un seul individu", () => {
    expect(testWelch([5, 5, 5], [5, 5])).toBeNull();
    expect(testWelch([1], [2, 3])).toBeNull();
  });

  it("ANOVA de Welch", () => {
    const r = anova([[1, 2, 3, 4, 5], [3, 4, 5, 6, 7, 8], [6, 7, 8, 9, 10, 11, 12]])!;
    expect(r.methode).toBe("welch");
    expect(r.statistique).toBeCloseTo(14.45683265, 7);
    expect((r.ddl as number[])[1]).toBeCloseTo(9.888318044, 7);
    expect(r.pValeur).toBeCloseTo(0.00116010435, 9);
    expect(r.effet).toBeCloseTo(0.66261398176, 9); // η²
  });

  it("ANOVA classique en repli quand un groupe est constant", () => {
    const r = anova([[4, 4, 4], [3, 4, 5, 6, 7, 8], [6, 7, 8, 9, 10, 11, 12]])!;
    expect(r.methode).toBe("classique");
    expect(r.pValeur).toBeLessThan(0.05);
  });

  it("khi-deux d'indépendance", () => {
    const r = testKhiDeux([[20, 15, 5], [10, 25, 25]], ["A", "B"], ["x", "y", "z"])!;
    expect(r.statistique).toBeCloseTo(15.79861111, 7);
    expect(r.ddl).toBe(2);
    expect(r.pValeur).toBeCloseTo(0.00037100109, 9);
    expect(r.effet).toBeCloseTo(0.397474667, 8); // V de Cramér
    expect(r.approximatif).toBe(false);
    expect(r.ecartMax).toMatchObject({ ligne: "A", colonne: "x", observe: 20 });
  });

  it("khi-deux 2×2 sans correction de Yates", () => {
    expect(testKhiDeux([[20, 10], [5, 25]])!.pValeur).toBeCloseTo(8.568298e-5, 9);
  });

  it("khi-deux signale les effectifs attendus trop petits", () => {
    expect(testKhiDeux([[3, 1], [1, 4]])!.approximatif).toBe(true);
  });

  it("significativité d'une corrélation", () => {
    // pearsonr([1..8], [2,1,4,3,7,8,6,9]) : r = 0,8964, p = 0,002567
    expect(pCorrelation(0.8964214570007951, 8)).toBeCloseTo(0.0025667661, 9);
    expect(pCorrelation(0.5, 2)).toBeNull();
    expect(pCorrelation(1, 10)).toBe(0);
  });
});

describe("outils", () => {
  it("correction de Holm", () => {
    // Exemple classique : p = 0,01 ; 0,04 ; 0,03 ; 0,005
    const a = corrigerHolm([0.01, 0.04, 0.03, 0.005]);
    expect(a.map((x) => +x.toFixed(4))).toEqual([0.03, 0.06, 0.06, 0.02]);
  });

  it("résumé pour boîte à moustaches", () => {
    const r = resumerGroupe("G", [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(r.mediane).toBe(5.5);
    expect(r.q1).toBe(3.25);
    expect(r.q3).toBe(7.75);
    expect(r.moustacheHaute).toBe(9);
    expect(r.moustacheBasse).toBe(1);
    expect(r.nbAtypiques).toBe(1);
  });

  it("formatage des p-valeurs", () => {
    expect(formaterP(0.0004)).toBe("p < 0,001");
    expect(formaterP(0.0123)).toBe("p = 0,01");
    expect(formaterP(0.0042)).toBe("p = 0,004");
    expect(formaterP(0.42, "en")).toBe("p = 0.42");
    expect(formaterP(1)).toBe("p > 0,99");
  });
});

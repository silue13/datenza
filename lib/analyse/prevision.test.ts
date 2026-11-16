import { describe, it, expect } from "vitest";
import { agregerSerieGenerique, calculerPrevisionGenerale } from "./prevision";

describe("analyse/prevision", () => {
  it("range les mois en lettres dans l'ordre du calendrier", () => {
    const corps = [["Mars", 30], ["Janvier", 10], ["Février", 20], ["Avril", 40]];
    const { serie } = agregerSerieGenerique(["Mois", "V"], corps, "Mois", "V", "somme");
    expect(serie.map((p) => p.periode)).toEqual(["Janvier", "Février", "Mars", "Avril"]);
  });
  it("comprend une colonne de dates américaines", () => {
    const corps = [["12/25/2024", 5], ["1/5/2024", 1], ["3/17/2024", 2]];
    const { serie, format } = agregerSerieGenerique(["D", "V"], corps, "D", "V", "somme");
    expect(format).toBe("date_mois");
    expect(serie.map((p) => p.periode)).toEqual(["2024-01", "2024-03", "2024-12"]);
  });
  it("ne prévoit pas de valeur négative pour une grandeur toujours positive", () => {
    const serie = [100, 70, 45, 20, 5].map((valeur, i) => ({ periode: String(2019 + i), valeur }));
    const r = calculerPrevisionGenerale(serie, "annee", 3);
    expect(r.possible).toBe(true);
    if (r.possible) {
      expect(r.projections.every((p) => p.valeurPrevue >= 0 && p.borneBasse >= 0)).toBe(true);
      expect(r.projections[0].periode).toBe("2024");
    }
  });
  it("plafonne la fiabilité quand l'historique est très court", () => {
    const serie = [1, 2, 3, 4].map((valeur, i) => ({ periode: String(2020 + i), valeur }));
    const r = calculerPrevisionGenerale(serie, "annee", 2);
    expect(r.possible && r.metriques.r2).toBe(1);
    expect(r.possible && r.metriques.fiabilite).toBe("Faible");
  });
  it("intègre un cycle annuel quand il existe", () => {
    // 3 ans : tendance +2 par mois, et un pic de +50 chaque décembre
    const serie = Array.from({ length: 36 }, (_, i) => ({
      periode: `${2022 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      valeur: 100 + 2 * i + (i % 12 === 11 ? 50 : 0),
    }));
    const r = calculerPrevisionGenerale(serie, "date_mois", 12);
    expect(r.possible && r.metriques.saisonnalite).toBe(true);
    if (r.possible) {
      const dec = r.projections.find((p) => p.periode === "2025-12")!;
      const nov = r.projections.find((p) => p.periode === "2025-11")!;
      expect(dec.valeurPrevue - nov.valeurPrevue).toBeGreaterThan(40);
      expect(r.metriques.r2).toBeGreaterThan(0.99);
    }
  });
  it("n'invente pas de cycle sur une série sans saisonnalité", () => {
    const serie = Array.from({ length: 36 }, (_, i) => ({
      periode: `${2022 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      valeur: 100 + 2 * i + ((i * 7919) % 13) - 6,
    }));
    const r = calculerPrevisionGenerale(serie, "date_mois", 3);
    expect(r.possible && r.metriques.saisonnalite).toBe(false);
  });
  it("ne laisse pas un pic de fin de série gonfler la tendance", () => {
    // 2 ans, tendance réelle +2 par mois, pic de +300 chaque décembre (dont le dernier point)
    const serie = Array.from({ length: 24 }, (_, i) => ({
      periode: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      valeur: 200 + 2 * i + (i % 12 === 11 ? 300 : 0),
    }));
    const r = calculerPrevisionGenerale(serie, "date_mois", 12);
    expect(r.possible && r.metriques.saisonnalite).toBe(true);
    if (r.possible) {
      // Janvier 2025 attendu : 200 + 2 × 24 = 248 (et non ~300 avec une tendance gonflée par les pics)
      expect(Math.abs(r.projections[0].valeurPrevue - 248)).toBeLessThan(3);
      expect(Math.abs(r.metriques.pente - 2)).toBeLessThan(0.2);
      const dec = r.projections.find((p) => p.periode === "2025-12")!;
      expect(Math.abs(dec.valeurPrevue - (200 + 2 * 35 + 300))).toBeLessThan(5);
    }
  });
});

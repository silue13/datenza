import { describe, it, expect } from "vitest";
import { analyserColonnes } from "./analyse";

const entetes = ["Region", "Montant", "Surface", "Actif"];
const corps = [
  ["Poro", "10", "20", "oui"],
  ["Poro", "20", "40", "non"],
  ["Gbeke", "30", "60", "oui"],
  ["Gbeke", "40", "80", "oui"],
];

describe("analyse/analyserColonnes", () => {
  const res = analyserColonnes(entetes, corps, entetes);

  it("détecte le type de chaque colonne", () => {
    expect(res.statistiques.Region.type).toBe("categorielle");
    expect(res.statistiques.Region.geo).toBe(true);
    expect(res.statistiques.Montant.type).toBe("numerique");
    expect(res.statistiques.Actif.type).toBe("booleen");
  });
  it("calcule les statistiques numériques", () => {
    expect(res.statistiques.Montant.stats).toMatchObject({ n: 4, moyenne: 25 });
    expect(res.statistiques.Montant.tendance?.direction).toBe("hausse");
  });
  it("compte les booléens", () => {
    expect(res.statistiques.Actif.stats).toEqual({ vrai: 3, faux: 1 });
  });
  it("calcule la corrélation entre colonnes numériques", () => {
    expect(res.correlations).toEqual([
      { colonneA: "Montant", colonneB: "Surface", coefficient: 1, interpretation: "très forte et positive" },
    ]);
  });
});
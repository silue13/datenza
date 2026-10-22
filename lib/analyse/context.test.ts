import { describe, it, expect } from "vitest";
import { analyserColonnes } from "./analyse";
import { construireContexte } from "./context";

const entetes = ["Region", "Montant", "Surface", "Actif"];
const corps = [
  ["Poro", "10", "20", "oui"],
  ["Poro", "20", "40", "non"],
  ["Gbeke", "30", "60", "oui"],
  ["Gbeke", "40", "80", "oui"],
];

describe("analyse/context", () => {
  it("résume toutes les colonnes analysées", () => {
    const res = analyserColonnes(entetes, corps, entetes);
    const ctx = construireContexte("test.xlsx", entetes, corps, res);
    expect(ctx.lignes).toBe(4);
    expect(ctx.colonnesAnalysees).toHaveLength(4);
    expect(ctx.correlations).toHaveLength(1);
  });
  it("garde toutesLesColonnes même si une seule est analysée", () => {
    const res = analyserColonnes(entetes, corps, ["Montant"]);
    const ctx = construireContexte("test.xlsx", entetes, corps, res);
    expect(ctx.toutesLesColonnes).toEqual(entetes);
    expect(ctx.colonnesAnalysees).toEqual(["Montant"]);
    expect(ctx.statistiques.Montant).toBeDefined();
  });
});
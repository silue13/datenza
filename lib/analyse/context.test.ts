import { describe, it, expect } from "vitest";
import { analyserColonnes } from "./analyse";
import { construireContexte, estColonneSensible } from "./context";

const entetes = ["Region", "Montant", "Surface", "Actif"];
const corps = [
  ["Poro", "10", "20", "oui"],
  ["Poro", "20", "40", "non"],
  ["Gbeke", "30", "60", "oui"],
  ["Gbeke", "40", "80", "oui"],
  ["Poro", "50", "100", "oui"],
  ["Gbeke", "60", "120", "non"],
];

describe("analyse/context", () => {
  it("résume toutes les colonnes analysées", () => {
    const res = analyserColonnes(entetes, corps, entetes);
    const ctx = construireContexte("test.xlsx", entetes, corps, res);
    expect(ctx.lignes).toBe(6);
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
  it("fournit à l'IA des classements et des évolutions calculés sur tout le fichier", () => {
    const e = ["Mois", "Region", "Montant", "Email"];
    const c = [
      ["Mars", "Poro", "30", "a@x.ci"], ["Janvier", "Poro", "10", "a@x.ci"], ["Février", "Gbeke", "20", "b@x.ci"],
      ["Mars", "Gbeke", "5", "b@x.ci"], ["Janvier", "Gbeke", "1", "c@x.ci"], ["Février", "Poro", "4", "a@x.ci"],
    ];
    const ctx = construireContexte("t.csv", e, c, analyserColonnes(e, c, e));
    expect(ctx.evolutions?.[0].points).toEqual([
      { periode: "Janvier", valeur: 11 },
      { periode: "Février", valeur: 24 },
      { periode: "Mars", valeur: 35 },
    ]);
    expect(ctx.classements?.[0]).toMatchObject({ dimension: "Region", lignes: [{ valeur: "Poro", resultat: 44, lignes: 3 }, { valeur: "Gbeke", resultat: 26, lignes: 3 }] });
    expect(JSON.stringify(ctx)).not.toContain("a@x.ci");
  });
  it("ne masque que les vraies colonnes sensibles", () => {
    for (const n of ["Email", "Téléphone", "Tel", "Salaire brut", "N° de compte bancaire", "Date de naissance"]) expect(estColonneSensible(n)).toBe(true);
    for (const n of ["Hôtel", "Contribution", "Compteur", "Carte", "Total", "Distribution", "Comptes ouverts"]) expect(estColonneSensible(n)).toBe(false);
  });
});

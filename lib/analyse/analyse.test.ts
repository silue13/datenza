import { describe, it, expect } from "vitest";
import { analyserColonnes } from "./analyse";

const entetes = ["Region", "Montant", "Surface", "Actif"];
const corps = [
  ["Poro", "10", "20", "oui"],
  ["Poro", "20", "40", "non"],
  ["Gbeke", "30", "60", "oui"],
  ["Gbeke", "40", "80", "oui"],
  ["Poro", "50", "100", "oui"],
  ["Gbeke", "60", "120", "non"],
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
    expect(res.statistiques.Montant.stats).toMatchObject({ n: 6, moyenne: 35, somme: 210 });
    // Pas d'axe de temps dans ce fichier : aucune tendance n'est annoncée (l'ordre des lignes ne veut rien dire)
    expect(res.statistiques.Montant.tendance).toBeUndefined();
  });
  it("compte les booléens", () => {
    expect(res.statistiques.Actif.stats).toEqual({ vrai: 4, faux: 2 });
  });
  it("calcule la corrélation entre colonnes numériques", () => {
    expect(res.correlations).toEqual([
      { colonneA: "Montant", colonneB: "Surface", coefficient: 1, nbPaires: 6, interpretation: "très forte et positive" },
    ]);
  });
});

describe("analyse/analyserColonnes — fichiers pièges", () => {
  it("ne prend pas une mesure aux valeurs toutes différentes pour un identifiant", () => {
    const corpsVentes = Array.from({ length: 40 }, (_, i) => [`F${i}`, (1234.56 + i * 77.3).toFixed(2)]);
    const r = analyserColonnes(["Facture", "Ventes"], corpsVentes, ["Facture", "Ventes"]);
    expect(r.statistiques.Ventes.type).toBe("numerique");
    expect(r.statistiques.Facture.type).toBe("identifiant");
  });
  it("calcule la tendance dans l'ordre du calendrier, pas dans l'ordre du fichier", () => {
    const c = [["Mars", "30"], ["Janvier", "10"], ["Février", "20"], ["Avril", "40"], ["Mai", "50"]];
    const r = analyserColonnes(["Mois", "Montant"], c, ["Mois", "Montant"]);
    expect(r.statistiques.Mois.type).toBe("date");
    expect(r.statistiques.Montant.tendance?.direction).toBe("hausse");
    expect(r.statistiques.Montant.tendance?.r2).toBe(1);
  });
  it("n'annonce pas de corrélation sur trop peu de lignes ou sur une colonne constante", () => {
    const r = analyserColonnes(["A", "B"], [["1", "2"], ["2", "4"]], ["A", "B"]);
    expect(r.correlations).toEqual([]);
    const k = analyserColonnes(["A", "B"], [["1", "5"], ["2", "5"], ["3", "5"], ["4", "5"], ["5", "5"], ["6", "5"]], ["A", "B"]);
    expect(k.correlations).toEqual([]);
  });
  it("garde une catégorie dont le nom commence comme un total", () => {
    const c = [["Moyenne gamme", "10"], ["Haut de gamme", "20"], ["TOTAL", "30"]];
    const r = analyserColonnes(["Gamme", "Montant"], c, ["Gamme", "Montant"]);
    expect(r.nbLignes).toBe(2);
  });
});

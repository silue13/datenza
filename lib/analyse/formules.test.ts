import { describe, it, expect } from "vitest";
import { lireFormule, validerFormule, CalculateurMesures, estAdditive, formaterMesure, modelesMesures, type DefinitionMesure } from "./formules";

const entetes = ["Culture", "Région", "Quantité", "Prix", "Coût"];
const lignes = [
  ["Cacao", "Nawa", 10, 1500, 9000],
  ["Cacao", "Poro", 5, "1 400", 5000],
  ["Café", "Nawa", 4, 900, 3000],
  ["Coton", "Poro", 20, 300, null],
  ["Coton", "Poro", "n/a", 310, 1000],
];
const m = (nom: string, formule: string, format: DefinitionMesure["format"] = "nombre"): DefinitionMesure => ({ id: nom, nom, formule, format });
const mesures = [
  m("CA", "SOMME([Quantité] * [Prix])"),
  m("Coûts", "SOMME([Coût])"),
  m("Marge", "[CA] - [Coûts]"),
  m("Taux de marge", "[Marge] / [CA]", "pourcentage"),
  m("Part du CA", "[CA] / TOTAL([CA])", "pourcentage"),
  m("CA Cacao", 'SOMME([Quantité] * [Prix]; [Culture] = "cacao")'),
];

describe("analyse/formules — lecture et validation", () => {
  it("lit les opérations dans le bon ordre", () => {
    const calc = new CalculateurMesures(entetes, lignes, [m("x", "2 + 3 * 4 - (1 + 1) / 2")]);
    expect(calc.calculer(m("x", "2 + 3 * 4 - (1 + 1) / 2"), lignes)).toBe(13);
    expect(() => lireFormule("SOMME([A]")).toThrow(/parenthèse/);
    expect(() => lireFormule("SOMME(A)")).toThrow(/crochets/);
    expect(() => lireFormule("[A")).toThrow(/crochet/);
    expect(() => lireFormule("")).toThrow(/vide/);
    expect(lireFormule("SOMME([Prix]; [Quantité] > 2,5)")).toMatchObject({ t: "agregat", f: "somme" });
  });
  it("valide colonnes, mesures et place des éléments", () => {
    expect(validerFormule("SOMME([Quantité]) + [CA]", entetes, mesures)).toMatchObject({ ok: true, colonnes: ["Quantité"], mesures: ["CA"] });
    expect(validerFormule("SOMME([Inconnue])", entetes, mesures).erreur).toMatch(/introuvable/);
    expect(validerFormule("[Prix] * 2", entetes, mesures).erreur).toMatch(/agrégée/);
    expect(validerFormule("SOMME([CA])", entetes, mesures).erreur).toMatch(/est une mesure/);
    expect(validerFormule("SOMME(MOYENNE([Prix]))", entetes, mesures).erreur).toMatch(/agrégat/);
    expect(validerFormule("SOMME([quantite])", entetes, mesures).ok).toBe(true);
  });
  it("refuse les références circulaires", () => {
    const boucle = [m("A", "[B] + 1"), m("B", "[A] * 2")];
    expect(validerFormule("[B] + 1", entetes, boucle, "A").erreur).toMatch(/circulaire/);
    expect(validerFormule("[A] + 1", entetes, mesures, "A").ok).toBe(false);
  });
});

describe("analyse/formules — calcul", () => {
  const calc = new CalculateurMesures(entetes, lignes, mesures);
  const v = (nom: string, l = lignes) => calc.calculer(mesures.find((x) => x.nom === nom)!, l);
  it("calcule des agrégats sur des expressions par ligne, en ignorant les valeurs non numériques", () => {
    expect(v("CA")).toBe(10 * 1500 + 5 * 1400 + 4 * 900 + 20 * 300);
    expect(v("Coûts")).toBe(18000);
  });
  it("réutilise des mesures et calcule par groupe", () => {
    const poro = lignes.filter((l) => l[1] === "Poro");
    expect(v("Marge", poro)).toBe(5 * 1400 + 20 * 300 - 6000);
    expect(v("Taux de marge", poro)).toBeCloseTo(7000 / 13000);
  });
  it("TOTAL ignore le groupe, la condition filtre", () => {
    const nawa = lignes.filter((l) => l[1] === "Nawa");
    expect(v("Part du CA", nawa)).toBeCloseTo((15000 + 3600) / 31600);
    expect(v("CA Cacao")).toBe(22000);
    expect(v("CA Cacao", nawa)).toBe(15000);
  });
  it("donne vide plutôt que zéro quand rien n'est calculable", () => {
    expect(v("CA", [])).toBeNull();
    expect(v("Taux de marge", [])).toBeNull();
    expect(calc.calculer(m("n", "NOMBRE()"), [])).toBe(0);
    expect(calc.calculer(m("d", "SOMME([Prix]) / 0"), lignes)).toBeNull();
  });
  it("compte, compte les distincts, médiane, min, max, SI", () => {
    expect(calc.calculer(m("a", "NOMBRE()"), lignes)).toBe(5);
    expect(calc.calculer(m("b", "NOMBRE([Coût])"), lignes)).toBe(4);
    expect(calc.calculer(m("c", "DISTINCT([Culture])"), lignes)).toBe(3);
    expect(calc.calculer(m("d", "MEDIANE([Prix])"), lignes)).toBe(900);
    expect(calc.calculer(m("e", "MAX([Prix]) - MIN([Prix])"), lignes)).toBe(1200);
    expect(calc.calculer(m("f", "SI(SOMME([Quantité]) > 30; 1; 0)"), lignes)).toBe(1);
    expect(calc.calculer(m("g", 'NOMBRE(; [Région] = "Poro" ET [Prix] > 305)'.replace("(;", "([Culture];")), lignes)).toBe(2);
  });
  it("signale une formule invalide sans planter l'appelant", () => {
    expect(() => calc.calculer(m("x", "SOMME("), lignes)).toThrow();
    expect(calc.calculerOuVide(m("x", "SOMME("), lignes)).toBeNull();
  });
});

describe("analyse/formules — affichage", () => {
  it("formate nombres, unités et pourcentages", () => {
    expect(formaterMesure(31600, { format: "nombre", unite: "FCFA" })).toMatch(/^31\s600 FCFA$/);
    expect(formaterMesure(0.53846, { format: "pourcentage" })).toBe("53,8 %");
    expect(formaterMesure(null, { format: "nombre" })).toBe("—");
  });
  it("reconnaît les mesures additives", () => {
    expect(estAdditive(mesures[2], mesures)).toBe(true);
    expect(estAdditive(mesures[3], mesures)).toBe(false);
    expect(estAdditive(m("moy", "MOYENNE([Prix])"), mesures)).toBe(false);
  });
  it("propose des modèles adaptés aux colonnes", () => {
    expect(modelesMesures(["Quantité", "Prix"]).map((x) => x.formule)).toContain("SOMME([Quantité] * [Prix])");
    expect(modelesMesures([])).toHaveLength(1);
  });
});

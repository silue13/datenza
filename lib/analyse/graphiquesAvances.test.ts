import { describe, it, expect } from "vitest";
import { calculerNuage, expliquerNuage, calculerHistogramme, expliquerHistogramme, calculerCombine, expliquerCombine, pasRond } from "./graphiquesAvances";

describe("analyse/graphiquesAvances — nuage de points", () => {
  const entetes = ["Surface", "Rendement", "Zone"];
  const corps = [
    [1, 2, "Nord"],
    [2, 4, "Nord"],
    [3, 6, "Sud"],
    ["4", "8,0", "Sud"],
    ["n/a", 5, "Sud"],
    [null, null, "Sud"],
  ];
  it("place une ligne par point et écarte les valeurs non numériques", () => {
    const n = calculerNuage(entetes, corps, "Surface", "Rendement");
    expect(n.nbPoints).toBe(4);
    expect(n.nbIgnores).toBe(1);
    expect(n.series).toHaveLength(1);
    expect(n.series[0].points[3]).toEqual({ x: 4, y: 8 });
  });
  it("calcule la corrélation et la droite de tendance", () => {
    const n = calculerNuage(entetes, corps, "Surface", "Rendement");
    expect(n.r).toBe(1);
    expect(n.droite?.pente).toBeCloseTo(2);
    expect(n.droite?.ordonnee).toBeCloseTo(0);
    expect(n.droite).toMatchObject({ x1: 1, x2: 4 });
  });
  it("sépare les points par catégorie", () => {
    const n = calculerNuage(entetes, corps, "Surface", "Rendement", { colonneSerie: "Zone" });
    expect(n.series.map((s) => [s.nom, s.points.length])).toEqual([["Nord", 2], ["Sud", 2]]);
    expect(n.nbSeriesTotal).toBe(2);
  });
  it("échantillonne l'affichage sans changer les calculs", () => {
    const gros = Array.from({ length: 5000 }, (_, i) => [i, i * 3 + 1, "A"]);
    const n = calculerNuage(entetes, gros, "Surface", "Rendement", { maxPoints: 500 });
    expect(n.nbPoints).toBe(5000);
    expect(n.nbAffiches).toBe(500);
    expect(n.droite?.x2).toBe(4999);
    expect(expliquerNuage(n, "Surface", "Rendement").at(-1)?.texte).toContain("échantillon");
  });
  it("ne parle pas de relation quand une colonne est constante", () => {
    const n = calculerNuage(["A", "B"], [[1, 5], [2, 5], [3, 5]], "A", "B");
    expect(n.r).toBeNull();
    expect(n.droite).toBeNull();
    expect(expliquerNuage(n, "A", "B")[0].texte).toContain("ne varie pas");
  });
  it("annonce une liaison négative ou l'absence de liaison", () => {
    const neg = calculerNuage(["A", "B"], [[1, 9], [2, 7], [3, 4], [4, 1]], "A", "B");
    expect(expliquerNuage(neg, "A", "B")[0].texte).toMatch(/très forte.*diminuer/);
    const nul = calculerNuage(["A", "B"], [[1, 1], [2, -1], [3, -1], [4, 1]], "A", "B");
    expect(expliquerNuage(nul, "A", "B")[0].texte).toContain("Pas de liaison");
    expect(expliquerNuage(nul, "A", "B")).toHaveLength(2);
  });
});

describe("analyse/graphiquesAvances — histogramme", () => {
  it("choisit des pas ronds", () => {
    expect(pasRond(0.37)).toBe(0.5);
    expect(pasRond(13)).toBe(20);
    expect(pasRond(2.3)).toBe(2.5);
    expect(pasRond(1000)).toBe(1000);
  });
  it("répartit les valeurs en classes à bornes rondes, sans en perdre", () => {
    const corps = [3, 7, 12, 18, 21, 25, 33, 41, 47, 50].map((v) => [v]);
    const h = calculerHistogramme(["Age"], corps, "Age", { nbClasses: 5 });
    expect(h.classes.map((c) => [c.min, c.max, c.effectif])).toEqual([
      [0, 10, 2],
      [10, 20, 2],
      [20, 30, 2],
      [30, 40, 1],
      [40, 50, 3],
    ]);
    expect(h.classes.reduce((s, c) => s + c.effectif, 0)).toBe(h.n);
    expect(h.classes[4]).toMatchObject({ minObserve: 41, maxObserve: 50 });
  });
  it("gère les décimales sans erreur d'arrondi", () => {
    const corps = [0.1, 0.2, 0.3, 0.7, 0.9].map((v) => [v]);
    const h = calculerHistogramme(["Taux"], corps, "Taux", { nbClasses: 4 });
    expect(h.pas).toBe(0.2);
    expect(h.classes.map((c) => c.min)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(h.classes.map((c) => c.effectif)).toEqual([1, 2, 0, 1, 1]);
  });
  it("ne découpe pas des entiers en classes plus fines que 1", () => {
    const h = calculerHistogramme(["Note"], [[1], [2], [2], [3]], "Note", { nbClasses: 10 });
    expect(h.pas).toBe(1);
    expect(h.classes.map((c) => c.effectif)).toEqual([1, 3]);
  });
  it("ignore le texte et accepte une colonne constante", () => {
    const h = calculerHistogramme(["V"], [[5], ["abc"], [5], [null]], "V");
    expect(h).toMatchObject({ n: 2, nbIgnores: 1, min: 5, max: 5 });
    expect(h.classes).toHaveLength(1);
    expect(h.classes[0].effectif).toBe(2);
    expect(expliquerHistogramme(h, "V")[0].titre).toBe("Une seule valeur");
  });
  it("décrit la classe la plus fréquente et signale une moyenne tirée par les extrêmes", () => {
    const corps = [1, 2, 2, 3, 3, 3, 4, 4, 200].map((v) => [v]);
    const h = calculerHistogramme(["V"], corps, "V");
    const lignes = expliquerHistogramme(h, "V");
    expect(lignes[0].texte).toContain("8 lignes");
    expect(lignes[1].texte).toContain("tirée vers le haut");
  });
});

describe("analyse/graphiquesAvances — combiné", () => {
  const entetes = ["Region", "Ventes", "Prix"];
  const corps = [
    ["Poro", 100, 10],
    ["Poro", 300, 20],
    ["Gbeke", 150, 30],
    ["Tonkpi", 50, "n/a"],
    ["Nawa", 20, 40],
  ];
  it("aligne la courbe sur l'axe des barres", () => {
    const c = calculerCombine(entetes, corps, "Region", { colonne: "Ventes", agregation: "Somme" }, { colonne: "Prix", agregation: "Moyenne" });
    expect(c.axe.map((a) => a.label)).toEqual(["Poro", "Gbeke", "Tonkpi", "Nawa"]);
    expect(c.barres).toEqual([400, 150, 50, 20]);
    expect(c.courbe).toEqual([15, 30, null, 40]);
    expect(c.echellesEloignees).toBe(true);
  });
  it("respecte la limite sans créer de barre « Autres »", () => {
    const c = calculerCombine(entetes, corps, "Region", { colonne: "Ventes", agregation: "Somme" }, { colonne: null, agregation: "Nombre" }, { limite: 2 });
    expect(c.axe.map((a) => a.label)).toEqual(["Poro", "Gbeke"]);
    expect(c.courbe).toEqual([2, 1]);
    expect(c.tronque).toBe(true);
  });
  it("reconnaît deux mesures de même ordre de grandeur", () => {
    const c = calculerCombine(["G", "A", "B"], [["x", 10, 12], ["y", 20, 18]], "G", { colonne: "A", agregation: "Somme" }, { colonne: "B", agregation: "Somme" });
    expect(c.echellesEloignees).toBe(false);
  });
  it("explique chaque mesure et prévient quand il y a deux échelles", () => {
    const c = calculerCombine(entetes, corps, "Region", { colonne: "Ventes", agregation: "Somme" }, { colonne: "Prix", agregation: "Moyenne" });
    const lignes = expliquerCombine(c, c.axe.map((a) => a.label), "Ventes", "Prix", true);
    expect(lignes[0].texte).toContain("« Poro » : 400");
    expect(lignes[1].texte).toContain("« Nawa » : 40");
    expect(lignes.at(-1)?.titre).toBe("Deux échelles");
  });
});

import { nomFichierImage } from "./imageGraphique";
describe("analyse/imageGraphique", () => {
  it("donne un nom de fichier lisible et sûr", () => {
    expect(nomFichierImage("Somme — Ventes par Région (2024)")).toBe("somme-ventes-par-region-2024.png");
    expect(nomFichierImage("")).toBe("graphique.png");
    expect(nomFichierImage("///")).toBe("graphique.png");
  });
});

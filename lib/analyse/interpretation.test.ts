import { describe, it, expect } from "vitest";
import { guideLecture, interpreterGraphique } from "./interpretation";
import { interpreterPareto } from "./interpretationMetier";

describe("analyse/interpretation", () => {
  it("adapte le guide de lecture au type de graphique", () => {
    expect(guideLecture("Camembert")).toContain("100 %");
    expect(guideLecture("Courbe")).toContain("temps");
    expect(guideLecture("Nuage")).toContain("Chaque point");
    expect(guideLecture("Barres")).toContain("Chaque barre");
  });

  it("décrit une tendance à la hausse et propose des pistes", () => {
    const i = interpreterGraphique({
      titre: "Ventes selon Mois",
      type: "Courbe",
      labels: ["janv. 2024", "févr. 2024", "mars 2024", "avr. 2024", "mai 2024", "juin 2024"],
      datasets: [{ label: "Somme — Ventes", data: [100, 110, 125, 130, 145, 160] }],
    })!;
    expect(i.complements.find((l) => l.titre === "Tendance de fond")?.texte).toMatch(/^À la hausse/);
    expect(i.resume).toContain("« Ventes » a progressé");
    expect(i.pistes.some((p) => p.includes("saisonnier"))).toBe(true);
  });

  it("signale une chute de la dernière période à vérifier", () => {
    const i = interpreterGraphique({ type: "Courbe", labels: ["T1", "T2", "T3", "T4"], datasets: [{ label: "Ventes", data: [100, 105, 102, 40] }] })!;
    expect(i.pistes[0]).toContain("complète");
  });

  it("mesure la concentration entre catégories", () => {
    const i = interpreterGraphique({
      type: "Barres",
      temporel: false,
      labels: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      datasets: [{ label: "Montant", data: [900, 50, 10, 10, 10, 5, 5, 5, 3, 2] }],
    })!;
    expect(i.complements.find((l) => l.titre === "Répartition")?.texte).toContain("très concentrée");
    expect(i.resume).toContain("« A » domine nettement");
    expect(i.complements.find((l) => l.titre === "Poids du premier")).toBeTruthy();
  });

  it("ne parle pas de part du total pour des moyennes, et remplace le mot catégorie", () => {
    const i = interpreterGraphique({
      titre: "Moyenne — Prix",
      type: "Barres",
      temporel: false,
      interactif: false,
      motCategorie: "zone",
      labels: ["Nord", "Sud", "Est"],
      datasets: [{ label: "Moyenne — Prix", data: [10, 20, 60] }],
    })!;
    const texte = [i.resume, ...i.complements.map((l) => l.texte), ...i.pistes].join(" ");
    expect(texte).not.toContain("du total");
    expect(texte).not.toContain("catégorie");
    expect(texte).toContain("zone");
    expect(i.pistes.some((p) => p.includes("Cliquez"))).toBe(false);
  });

  it("interprète un Pareto concentré", () => {
    const i = interpreterPareto(
      {
        elements: [],
        total: 100,
        classes: { A: { nb: 2, part: 80 }, B: { nb: 3, part: 15 }, C: { nb: 5, part: 5 } },
        partElementsPour80: 20,
        nbPour80: 2,
      },
      "Client",
      "Montant"
    );
    expect(i.resume).toContain("Une petite minorité");
    expect(i.complements.find((l) => l.titre === "Par rapport à la règle des 80/20")?.texte).toContain("presque exactement");
  });
});

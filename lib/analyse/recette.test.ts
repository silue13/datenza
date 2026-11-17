import { describe, expect, it } from "vitest";
import {
  adapterRecette,
  associerColonnes,
  creerRecette,
  decrireCalcul,
  decrireFiltre,
  executerEtapes,
  lireRecette,
  resumerRapport,
  retirerCalcul,
} from "./recette";
import type { ConditionFiltre, DefinitionColonneCalculee } from "./filtres";

const marge: DefinitionColonneCalculee = { nomNouvelleColonne: "Marge", type: "operation", colonneA: "Montant", colonneB: "Coût", operateur: "-" };
const tauxMarge: DefinitionColonneCalculee = { nomNouvelleColonne: "Taux de marge", type: "operation", colonneA: "Marge", colonneB: "Montant", operateur: "ratio" };
const abidjan: ConditionFiltre = { colonne: "Region", operateur: "egal", valeur: "Abidjan" };
const margePositive: ConditionFiltre = { colonne: "Marge", operateur: "superieur", valeur: "0" };

const recette = creerRecette("Ventes mensuelles", ["Region", "Montant", "Coût", "Canal"], [marge, tauxMarge], [abidjan, margePositive], ["Region", "Montant", "Marge"]);

describe("exécution des étapes", () => {
  it("calcule puis filtre, dans l'ordre", () => {
    const r = executerEtapes(
      ["Region", "Montant", "Coût"],
      [["Abidjan", 100, 60], ["Abidjan", 50, 80], ["Bouaké", 200, 100]],
      [marge, tauxMarge],
      [abidjan, margePositive]
    );
    expect(r.entetes).toEqual(["Region", "Montant", "Coût", "Marge", "Taux de marge"]);
    expect(r.corps).toEqual([["Abidjan", 100, 60, 40, 40]]);
  });
});

describe("rejouer une recette sur un autre fichier", () => {
  it("rejoue tout quand les colonnes sont identiques", () => {
    const r = adapterRecette(recette, ["Region", "Montant", "Coût", "Canal"]);
    expect(r.calculs).toHaveLength(2);
    expect(r.filtres).toHaveLength(2);
    expect(r.ignorees).toEqual([]);
    expect(r.renommees).toEqual([]);
    expect(r.colonnesChoisies).toEqual(["Region", "Montant", "Marge", "Taux de marge"]);
  });

  it("reconnaît une colonne dont l'écriture a changé", () => {
    const r = adapterRecette(recette, ["REGION", "montant ", "cout", "Canal"]);
    expect(r.renommees).toEqual([["Region", "REGION"], ["Montant", "montant "], ["Coût", "cout"]]);
    expect(r.calculs[0]).toMatchObject({ colonneA: "montant ", colonneB: "cout" });
    expect(r.filtres[0].colonne).toBe("REGION");
    // Les colonnes calculées gardent leur nom
    expect(r.filtres[1].colonne).toBe("Marge");
  });

  it("écarte en cascade ce qui dépend d'une colonne disparue, avec la raison", () => {
    const r = adapterRecette(recette, ["Region", "Montant", "Canal"]);
    expect(r.calculs).toEqual([]);
    expect(r.filtres).toEqual([abidjan]);
    expect(r.ignorees.map((e) => e.raison)).toEqual([
      "colonne « Coût » absente du fichier",
      "colonne « Marge » absente du fichier",
      "colonne « Marge » absente du fichier",
    ]);
    expect(resumerRapport(r)).toMatch(/^1 étape\(s\) sur 4 rejouée\(s\) · ignorée\(s\) : Colonne « Marge »/);
  });

  it("ne devine pas quand deux colonnes sont équivalentes", () => {
    expect(associerColonnes(["Montant"], ["montant", "MONTANT"]).has("Montant")).toBe(false);
  });

  it("montre les colonnes apparues depuis la création de la recette", () => {
    const r = adapterRecette(recette, ["Region", "Montant", "Coût", "Canal", "Remise"]);
    expect(r.nouvelles).toEqual(["Remise"]);
    expect(r.colonnesChoisies).toContain("Remise");
  });

  it("ne remplace pas une colonne que le fichier contient déjà", () => {
    const r = adapterRecette(recette, ["Region", "Montant", "Coût", "Marge"]);
    expect(r.calculs.map((c) => c.nomNouvelleColonne)).toEqual(["Taux de marge"]);
    expect(r.ignorees[0].raison).toMatch(/contient déjà une colonne « Marge »/);
  });
});

describe("lecture d'une recette", () => {
  it("relit une recette exportée", () => {
    expect(lireRecette(JSON.stringify(recette))).toEqual(recette);
  });

  it("refuse un fichier qui n'est pas une recette", () => {
    expect(() => lireRecette('{"a":1}')).toThrow(/pas une recette/);
    expect(() => lireRecette({ ...recette, version: 99 })).toThrow(/plus récente/);
  });

  it("refuse une étape mal formée", () => {
    const abimee = { ...recette, calculs: [{ ...marge, operateur: "eval" }] };
    expect(() => lireRecette(abimee)).toThrow(/mal formée/);
    const filtreAbime = { ...recette, filtres: [{ colonne: "Region", operateur: "egal", valeur: { x: 1 } }] };
    expect(() => lireRecette(filtreAbime)).toThrow(/mal formée/);
  });
});

describe("description des étapes", () => {
  it("en langage courant", () => {
    expect(decrireCalcul(marge)).toBe("Colonne « Marge » = Montant − Coût");
    expect(decrireCalcul(tauxMarge)).toBe("Colonne « Taux de marge » = Marge en % de Montant");
    expect(decrireFiltre(abidjan)).toBe("Filtre : Region = « Abidjan »");
    expect(decrireFiltre({ colonne: "Montant", operateur: "entre", valeur: 10, valeurFin: 20 })).toBe("Filtre : Montant entre 10 et 20");
  });
});

describe("suppression d'une colonne calculée", () => {
  it("retire aussi ce qui en dépend", () => {
    const r = retirerCalcul([marge, tauxMarge], [abidjan, margePositive], 0);
    expect(r.calculs).toEqual([]);
    expect(r.filtres).toEqual([abidjan]);
    expect(r.ricochets).toEqual(["Colonne « Taux de marge » = Marge en % de Montant", "Filtre : Marge ≥ « 0 »"]);
  });

  it("ne touche pas au reste", () => {
    const r = retirerCalcul([marge, tauxMarge], [abidjan, margePositive], 1);
    expect(r.calculs).toEqual([marge]);
    expect(r.filtres).toHaveLength(2);
    expect(r.ricochets).toEqual([]);
  });
});

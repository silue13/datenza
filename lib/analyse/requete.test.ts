import { describe, it, expect } from "vitest";
import { contientBlocRequetes, executerRequete, extraireRequetes, resultatsPourIA, trouverColonne } from "./requete";

const e = ["Date", "Departement", "Sous_prefecture", "Population_totale", "Statut", "Email"];
const c = [
  ["15/01/2024", "BOUAKE", "BOUAKE", 832371, "Urbain", "a@x.ci"],
  ["20/01/2024", "BOUAKE", "BOUNDA", 15710, "Rural", "b@x.ci"],
  ["03/02/2024", "BEOUMI", "BEOUMI", "85 600", "Urbain", "c@x.ci"],
  ["10/03/2024", "BEOUMI", "BODOKRO", 37048, "Rural", "d@x.ci"],
  ["11/03/2024", "BOTRO", "BOTRO", "n/a", "Rural", "e@x.ci"],
];

describe("analyse/requete", () => {
  it("regroupe, agrège et classe sur toutes les lignes", () => {
    const r = executerRequete(e, c, {
      titre: "Population par département",
      grouper_par: ["Departement"],
      mesures: [{ colonne: "Population_totale", calcul: "somme" }, { calcul: "nombre" }],
    });
    expect(r.colonnes).toEqual(["Departement", "Somme de Population_totale", "Nombre de lignes"]);
    expect(r.lignes).toEqual([["BOUAKE", 848081, 2], ["BEOUMI", 122648, 2], ["BOTRO", null, 1]]);
    expect(r.nbLignesRetenues).toBe(5);
  });
  it("filtre avant de calculer, y compris sur des dates", () => {
    const r = executerRequete(e, c, {
      filtres: [{ colonne: "statut", operateur: "=", valeur: "rural" }, { colonne: "Date", operateur: "entre", valeur: "01/01/2024", valeurFin: "28/02/2024" }],
      mesures: [{ colonne: "Population_totale", calcul: "moyenne" }],
    });
    expect(r.lignes).toEqual([[15710]]);
    expect(r.nbLignesRetenues).toBe(1);
  });
  it("regroupe une colonne de dates par mois, dans l'ordre du calendrier", () => {
    const r = executerRequete(e, c, { grouper_par: ["Date"], granularite: "mois", mesures: [{ colonne: "Population_totale", calcul: "max" }] });
    expect(r.lignes).toEqual([["2024-01", 832371], ["2024-02", 85600], ["2024-03", 37048]]);
  });
  it("respecte le tri et la limite demandés", () => {
    const r = executerRequete(e, c, {
      grouper_par: ["Sous_prefecture"],
      mesures: [{ colonne: "Population_totale", calcul: "somme" }],
      trier: { par: "Population_totale", ordre: "asc" },
      limite: 2,
    });
    expect(r.lignes).toEqual([["BOUNDA", 15710], ["BODOKRO", 37048]]);
    expect(r.tronque).toBe(true);
    expect(r.nbGroupes).toBe(5);
  });
  it("tolère les noms de colonnes approximatifs et explique ses refus", () => {
    expect(trouverColonne(e, "population totale")).toBe("Population_totale");
    expect(executerRequete(e, c, { grouper_par: ["Region"] }).erreur).toContain("introuvable");
    expect(executerRequete(e, c, { mesures: [{ colonne: "Statut", calcul: "somme" }] }).erreur).toContain("ne contient pas de nombres");
    expect(executerRequete(e, c, { mesures: [{ colonne: "Statut", calcul: "distincts" }] }).lignes).toEqual([[2]]);
    const interdit = (n: string) => n === "Email";
    expect(executerRequete(e, c, { grouper_par: ["Email"] }, interdit).erreur).toContain("données personnelles");
    expect(executerRequete(e, c, { mesures: [{ colonne: "Email", calcul: "distincts" }] }, interdit).lignes).toEqual([[5]]);
    expect(executerRequete(e, c, "n'importe quoi").lignes).toEqual([[5]]);
  });
  it("lit le bloc de requêtes émis par le modèle", () => {
    const texte = 'Je calcule.\n```\nDATENZA_REQUETES: [{"titre":"a [test]","grouper_par":["Departement"]},{"mesures":[{"calcul":"nombre"}]}]\n```\nfin';
    expect(extraireRequetes(texte)).toHaveLength(2);
    expect(extraireRequetes("Réponse sans calcul")).toBeNull();
    expect(extraireRequetes("DATENZA_REQUETES: [{cassé")).toBeNull();
    const r = executerRequete(e, c, { titre: "T", grouper_par: ["Statut"] });
    expect(resultatsPourIA([r, executerRequete(e, c, { grouper_par: ["X"] })])).toContain("Rural | 3");
    expect(resultatsPourIA([executerRequete(e, c, { grouper_par: ["X"] })])).toContain("ERREUR");
  });
});

describe("analyse/requete — cas limites", () => {
  const e2 = ["Date", "Dept", "Pop", "Statut", "Salaire"];
  const c2 = [
    ["2024-01-15", "Bouaké", 1000, "Urbain", 500],
    ["2024-02-20", "BOUAKE", 1500, "Rural", 900],
    ["2024-03-03", "Béoumi", 2000, "", 100],
    ["2025-01-10", "Botro", 1000, "Rural", 300],
    ["01/02/2024", "Botro", 250, "Rural", 300],
  ];
  const nb = (spec: unknown) => executerRequete(e2, c2, spec).lignes[0][0];

  it("distingue « plus de » (strict) de « au moins »", () => {
    expect(nb({ filtres: [{ colonne: "Pop", operateur: ">", valeur: 1000 }] })).toBe(2);
    expect(nb({ filtres: [{ colonne: "Pop", operateur: "superieur", valeur: 1000 }] })).toBe(4);
    expect(nb({ filtres: [{ colonne: "Pop", operateur: "<", valeur: 1000 }] })).toBe(1);
    expect(nb({ filtres: [{ colonne: "Pop", operateur: "<=", valeur: 1000 }] })).toBe(3);
  });
  it("classe du plus petit au plus grand même si la colonne de tri est absente ou mal nommée", () => {
    const base = { grouper_par: ["Dept"], mesures: [{ colonne: "Pop", calcul: "somme" }], limite: 1 };
    expect(executerRequete(e2, c2, { ...base, trier: { ordre: "asc" } }).lignes).toEqual([["Bouaké", 1000]]);
    expect(executerRequete(e2, c2, { ...base, trier: { par: "total", ordre: "asc" } }).lignes).toEqual([["Bouaké", 1000]]);
    expect(executerRequete(e2, c2, base).lignes).toEqual([["Béoumi", 2000]]);
  });
  it("n'ignore jamais une demande mal formée", () => {
    expect(nb({ mesures: { colonne: "Pop", calcul: "somme" } })).toBe(5750);
    expect(nb({ filtres: { colonne: "Dept", operateur: "egal", valeur: "Botro" } })).toBe(2);
    expect(executerRequete(e2, c2, { grouper_par: "Dept" }).nbGroupes).toBe(4);
    expect(executerRequete(e2, c2, { filtres: [{ colonne: "Pop", operateur: "entre", valeur: 10 }] }).erreur).toContain("valeurFin");
    expect(executerRequete(e2, c2, { filtres: [{ colonne: "Pop", operateur: ">", valeur: "beaucoup" }] }).erreur).toContain("n'est pas");
    expect(executerRequete(e2, c2, { grouper_par: ["Date"], granularite: "semaine" }).erreur).toContain("Granularité");
  });
  it("filtre sans accents, sur une liste, et sur une année ou un mois entier", () => {
    expect(nb({ filtres: [{ colonne: "Dept", operateur: "egal", valeur: "bouake" }] })).toBe(2);
    expect(nb({ filtres: [{ colonne: "Dept", operateur: "egal", valeur: ["Botro", "Béoumi"] }] })).toBe(3);
    expect(nb({ filtres: [{ colonne: "Dept", operateur: "different", valeur: ["Botro", "Béoumi"] }] })).toBe(2);
    expect(nb({ filtres: [{ colonne: "Date", operateur: "egal", valeur: "2024" }] })).toBe(4);
    expect(nb({ filtres: [{ colonne: "Date", operateur: "egal", valeur: "2024-02" }] })).toBe(2);
    expect(nb({ filtres: [{ colonne: "Date", operateur: ">", valeur: 2024 }] })).toBe(1);
    expect(nb({ filtres: [{ colonne: "Date", operateur: "entre", valeur: "2024-02", valeurFin: "2024-03" }] })).toBe(3);
  });
  it("lit les dates américaines de la même façon pour filtrer et pour regrouper", () => {
    const us = [["01/13/2024", 1], ["02/14/2024", 1], ["03/05/2024", 1], ["12/25/2024", 1], ["03/04/2024", 1]];
    const r = executerRequete(["Date", "V"], us, { filtres: [{ colonne: "Date", operateur: "entre", valeur: "2024-03-01", valeurFin: "2024-03-31" }] });
    expect(r.lignes).toEqual([[2]]);
  });
  it("refuse un filtre sur une colonne sensible et signale les lignes sans groupe", () => {
    const interdit = (n: string) => n === "Salaire";
    expect(executerRequete(e2, c2, { filtres: [{ colonne: "Salaire", operateur: ">=", valeur: 500 }], grouper_par: ["Dept"] }, interdit).erreur).toContain("filtre");
    const r = executerRequete(e2, c2, { grouper_par: ["Statut"] });
    expect(r.nbLignesSansGroupe).toBe(1);
    expect(resultatsPourIA([r])).toContain("dont 1 sans valeur de regroupement");
  });
  it("lit un bloc de requêtes imparfait", () => {
    expect(extraireRequetes('DATENZA_REQUETES: {"mesures":[{"calcul":"nombre"}]}')).toHaveLength(1);
    expect(extraireRequetes('DATENZA_REQUETES:\n```json\n[{"mesures":[{"calcul":"nombre"},],}]\n```')).toHaveLength(1);
    expect(contientBlocRequetes("DATENZA_REQUETES: [{cassé")).toBe(true);
    expect(contientBlocRequetes("Réponse normale")).toBe(false);
  });
});

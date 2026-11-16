import { describe, it, expect } from "vitest";
import { executerRequete, extraireRequetes, resultatsPourIA, trouverColonne } from "./requete";

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

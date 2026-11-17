import { describe, it, expect } from "vitest";
import { assemblerEtat, compresserDonnees, decompresserDonnees, estUuid, extraireReglages, nomParDefaut, type DonneesProjet } from "./format";
import type { EtatPersiste } from "../persistance";

const donnees: DonneesProjet = { v: 1, sources: { entetes: ["Région", "Montant"], corps: [["Gbêkê", 1200.5], ["Poro", null], ["Tonkpi", "1 000"]] } };

describe("projets/format", () => {
  it("compresse puis relit les données à l'identique", async () => {
    const blob = await compresserDonnees(donnees);
    expect(await decompresserDonnees(blob)).toEqual(donnees);
    expect(await decompresserDonnees(new Blob([JSON.stringify(donnees)]))).toEqual(donnees);
  });
  it("réduit nettement la taille d'un gros fichier", async () => {
    const gros: DonneesProjet = { v: 1, sources: { entetes: ["A", "B"], corps: Array.from({ length: 20000 }, (_, i) => ["Abidjan", i % 7]) } };
    const blob = await compresserDonnees(gros);
    expect(blob.size).toBeLessThan(JSON.stringify(gros).length / 5);
  });
  it("reconstitue l'état, même avec des réglages incomplets", () => {
    const etat = assemblerEtat("ventes.xlsx", donnees, { choisies: ["Montant"], filtresActifs: [{ colonne: "Région", operateur: "egal", valeur: "Poro" }] });
    expect(etat.sources.corps).toHaveLength(3);
    expect(etat.choisies).toEqual(["Montant"]);
    expect(etat.filtresActifs).toHaveLength(1);
    expect(etat.resultat).toBeNull();
    expect(assemblerEtat("f", donnees, null).choisies).toEqual(["Région", "Montant"]);
    expect(() => assemblerEtat("f", { sources: { entetes: [], corps: [] } }, {})).toThrow();
    expect(() => assemblerEtat("f", "n'importe quoi", {})).toThrow();
  });
  it("n'enregistre pas l'analyse ni les lignes dans les réglages", () => {
    const etat = { ...assemblerEtat("f", donnees, {}), resultat: { nbLignes: 3 } } as unknown as EtatPersiste;
    const r = extraireReglages(etat) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["apercu", "choisies", "definitionsCalculs", "filtresActifs", "graphiquesEpingles", "mesures", "rapport", "relations", "source"]);
  });
  it("propose un nom et reconnaît un identifiant de partage", () => {
    expect(nomParDefaut("Ventes 2024.xlsx")).toBe("Ventes 2024");
    expect(nomParDefaut("")).toBe("Mon projet");
    expect(estUuid("3f2b8c1e-9d4a-4e7b-8a56-0c1d2e3f4a5b")).toBe(true);
    expect(estUuid("../etc")).toBe(false);
  });
});

describe("projets/format — modèle de données et mesures", () => {
  it("enregistre relations et mesures dans les réglages, tables dans les données, et les relit", async () => {
    const { extraireReglages, assemblerEtat, compresserDonnees, decompresserDonnees } = await import("./format");
    const tables = [{ id: "t1", nom: "Produits", entetes: ["Code", "Prix"], corps: [["P1", 10]] }];
    const relations = [{ id: "r1", tableId: "t1", colonnePrincipale: "Région", colonneCle: "Code", colonnes: ["Prix"] }];
    const mesures = [{ id: "m1", nom: "CA", formule: "SOMME([Prix])", format: "nombre" as const, unite: "FCFA" }];
    const etat = {
      nomFichier: "v.csv", sources: donnees.sources, choisies: [], rapport: [], resultat: null, graphiquesEpingles: [], filtresActifs: [], definitionsCalculs: [],
      tablesReference: tables, relations, mesures,
    };
    const reglages = extraireReglages(etat);
    expect(reglages.relations).toEqual(relations);
    expect(reglages.mesures).toEqual(mesures);
    expect("tablesReference" in reglages).toBe(false);
    const blob = await compresserDonnees({ v: 1, sources: donnees.sources, tables });
    const relu = assemblerEtat("v.csv", await decompresserDonnees(blob), reglages);
    expect(relu.tablesReference).toEqual(tables);
    expect(relu.relations).toEqual(relations);
    expect(relu.mesures).toEqual(mesures);
  });
  it("ouvre un ancien projet sans modèle", () => {
    const relu = assemblerEtat("f", donnees, { choisies: ["Montant"] });
    expect(relu.tablesReference).toEqual([]);
    expect(relu.relations).toEqual([]);
    expect(relu.mesures).toEqual([]);
  });
});

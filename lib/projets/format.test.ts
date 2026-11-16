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
    expect(Object.keys(r).sort()).toEqual(["choisies", "definitionsCalculs", "filtresActifs", "graphiquesEpingles", "rapport"]);
  });
  it("propose un nom et reconnaît un identifiant de partage", () => {
    expect(nomParDefaut("Ventes 2024.xlsx")).toBe("Ventes 2024");
    expect(nomParDefaut("")).toBe("Mon projet");
    expect(estUuid("3f2b8c1e-9d4a-4e7b-8a56-0c1d2e3f4a5b")).toBe(true);
    expect(estUuid("../etc")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { construireApercu, normaliserApercu, decrirePartage } from "./apercu";

describe("projets/apercu", () => {
  it("prend le premier graphique résumable et ses 8 premières barres", () => {
    const a = construireApercu([
      { type: "Carte", titre: "Carte", labels: [], datasets: [] },
      { type: "Nuage", titre: "Nuage", labels: [], datasets: [] },
      { type: "Barres", titre: "Ventes par région", labels: "ABCDEFGHIJ".split(""), datasets: [{ data: [10, 9, 8, null, 6, 5, 4, 3, 2, 1] }] },
    ]);
    expect(a?.titre).toBe("Ventes par région");
    expect(a?.barres).toHaveLength(8);
    expect(a?.barres[3]).toEqual({ label: "D", valeur: null });
  });
  it("garde les dernières périodes d'une courbe", () => {
    const a = construireApercu([{ type: "Courbe", titre: "Évolution", labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], datasets: [{ data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }] }]);
    expect(a?.barres.map((b) => b.label)).toEqual(["3", "4", "5", "6", "7", "8", "9", "10"]);
  });
  it("ignore un graphique sans au moins deux valeurs", () => {
    expect(construireApercu([{ type: "Barres", labels: ["a", "b"], datasets: [{ data: [1, null] }] }])).toBeNull();
    expect(construireApercu([])).toBeNull();
  });
  it("relit un aperçu enregistré sans faire confiance à son contenu", () => {
    expect(normaliserApercu({ titre: "T", barres: [{ label: "a", valeur: 1 }, { label: "b", valeur: "2" }, { label: "c", valeur: 3 }] })).toEqual({
      titre: "T",
      barres: [{ label: "a", valeur: 1 }, { label: "b", valeur: null }, { label: "c", valeur: 3 }],
    });
    expect(normaliserApercu({ barres: "x" })).toBeNull();
    expect(normaliserApercu(null)).toBeNull();
  });
  it("décrit le lien partagé", () => {
    expect(decrirePartage({ nb_lignes: 1250, nb_colonnes: 8 }, { titre: "Ventes par région", barres: [] })).toMatch(/^1\s250 lignes et 8 colonnes analysées · Ventes par région\. Explorez/);
    expect(decrirePartage({}, null)).toMatch(/^Analyse de données partagée\./);
  });
});

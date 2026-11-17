import { describe, it, expect } from "vitest";
import { appliquerModele, cleRapprochement, suggererRelation, nommerColonneReliee, type TableReference, type Relation } from "./modele";

const ventes = {
  entetes: ["Date", "Code produit", "Quantité", "Region"],
  corps: [
    ["2024-01-02", "P1", 3, "Poro"],
    ["2024-01-03", "p2 ", 1, "Gbêkê"],
    ["2024-01-04", "P9", 5, "Poro"],
    ["2024-01-05", "", 2, "Tonkpi"],
    ["2024-01-06", "P1", 4, "Nawa"],
  ],
};
const produits: TableReference = {
  id: "t1",
  nom: "Produits",
  entetes: ["Code", "Libellé", "Prix", "Famille", "Region"],
  corps: [
    ["P1", "Cacao", 1500, "F1", "Sud"],
    ["P2", "Café", 900, "F1", "Ouest"],
    ["P3", "Coton", 300, "F2", "Nord"],
    ["P1", "Cacao bis", 1, "F9", "x"],
  ],
};
const familles: TableReference = { id: "t2", nom: "Familles", entetes: ["Id", "Famille (libellé)"], corps: [["F1", "Cultures de rente"], ["F2", "Fibres"]] };

describe("analyse/modele", () => {
  it("rapproche les clés malgré la casse, les espaces et l'écriture des nombres", () => {
    expect(cleRapprochement(" p2 ")).toBe(cleRapprochement("P2"));
    expect(cleRapprochement("10,0")).toBe(cleRapprochement(10));
    expect(cleRapprochement("010")).toBe(cleRapprochement("10"));
    expect(cleRapprochement("Côte")).toBe(cleRapprochement("cote"));
    expect(cleRapprochement(null)).toBe("");
  });

  it("ajoute les colonnes choisies sans perdre de ligne et diagnostique les clés", () => {
    const rel: Relation = { id: "r1", tableId: "t1", colonnePrincipale: "Code produit", colonneCle: "Code", colonnes: ["Libellé", "Prix", "Region"] };
    const r = appliquerModele(ventes.entetes, ventes.corps, [produits], [rel]);
    expect(r.entetes).toEqual(["Date", "Code produit", "Quantité", "Region", "Libellé", "Prix", "Region (Produits)"]);
    expect(r.corps).toHaveLength(5);
    expect(r.corps[0].slice(4)).toEqual(["Cacao", 1500, "Sud"]);
    expect(r.corps[1].slice(4)).toEqual(["Café", 900, "Ouest"]);
    expect(r.corps[2].slice(4)).toEqual([null, null, null]);
    expect(r.diagnostics[0]).toMatchObject({ lignesReliees: 3, lignesSansCorrespondance: 1, exemplesSansCorrespondance: ["P9"], clesEnDouble: ["P1"], erreur: null });
  });

  it("enchaîne les relations (Ventes → Produits → Familles)", () => {
    const r = appliquerModele(ventes.entetes, ventes.corps, [produits, familles], [
      { id: "r1", tableId: "t1", colonnePrincipale: "Code produit", colonneCle: "Code", colonnes: ["Famille"] },
      { id: "r2", tableId: "t2", colonnePrincipale: "Famille", colonneCle: "Id", colonnes: ["Famille (libellé)"] },
    ]);
    expect(r.corps.map((l) => l[l.length - 1])).toEqual(["Cultures de rente", "Cultures de rente", null, null, "Cultures de rente"]);
  });

  it("signale une relation devenue invalide sans casser les autres", () => {
    const r = appliquerModele(ventes.entetes, ventes.corps, [produits], [
      { id: "r1", tableId: "absente", colonnePrincipale: "Code produit", colonneCle: "Code", colonnes: ["Prix"] },
      { id: "r2", tableId: "t1", colonnePrincipale: "Inconnue", colonneCle: "Code", colonnes: ["Prix"] },
      { id: "r3", tableId: "t1", colonnePrincipale: "Code produit", colonneCle: "Code", colonnes: ["Prix", "Disparue"] },
    ]);
    expect(r.diagnostics[0].erreur).toMatch(/retirée/);
    expect(r.diagnostics[1].erreur).toMatch(/Inconnue/);
    expect(r.entetes).toEqual([...ventes.entetes, "Prix"]);
  });

  it("propose la bonne paire de colonnes", () => {
    expect(suggererRelation(ventes, produits)).toMatchObject({ colonnePrincipale: "Code produit", colonneCle: "Code" });
    expect(suggererRelation(ventes, { entetes: ["X"], corps: [["a"], ["b"]] })).toBeNull();
  });

  it("nomme les colonnes sans collision", () => {
    expect(nommerColonneReliee("Prix", "Produits", new Set(["Prix", "Prix (Produits)"]))).toBe("Prix (Produits) 2");
  });
});

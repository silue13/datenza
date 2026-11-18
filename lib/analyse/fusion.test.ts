import { describe, it, expect } from "vitest";
import { apercuCorrespondance, fusionnerEtNettoyer, normaliserCle, suggererCles, valeursEquivalentes, type FichierEntree, type OptionsNettoyage, type TypeJointure } from "./fusion";
import { assemblerComparaison } from "./comparaison";

const A: FichierEntree = {
  nom: "factures.xlsx",
  entetes: ["Ref", "Client", "Montant", "Date"],
  corps: [
    ["00123", "Kouassi", "1 000", "05/01/2024"],
    ["124", "Bamba", 2500, "2024-01-06"],
    ["125", "Traoré", 300, "2024-01-07"],
    ["", "Sans clé", 10, ""],
  ],
};
const B: FichierEntree = {
  nom: "paiements.csv",
  entetes: ["Montant", "Référence", "Date"],
  corps: [
    [1000, 123, "2024-01-05"],
    [2400, "124", "2024-01-06"],
    [80, "999", "2024-02-01"],
  ],
};
const options = (typeJointure: TypeJointure): OptionsNettoyage => ({
  mode: "jointure",
  jointure: { indexFichierA: 0, indexFichierB: 1, cleFichierA: "Ref", cleFichierB: "Référence", typeJointure },
  supprimerDoublons: true,
  harmoniserFormatsNumeriques: true,
  harmoniserDates: true,
  nettoyerEspaces: true,
  remplirValeursVides: false,
  valeurRemplacementVide: "",
  alignerColonnesSimilaires: true,
});

describe("analyse/fusion", () => {
  it("rapproche des codes écrits différemment", () => {
    expect(normaliserCle("00123")).toBe(normaliserCle(123));
    expect(normaliserCle("123.0")).toBe("123");
    expect(normaliserCle("  CI  001 ")).toBe("ci 001");
  });

  it("donne le même bilan quel que soit le type de jointure", () => {
    for (const t of ["inter", "anti_gauche", "anti_droite", "gauche_externe", "externe_complete"] as TypeJointure[]) {
      const r = fusionnerEtNettoyer([A, B], options(t)).rapport;
      expect([r.nbCorrespondances, r.nbOrphelinsA, r.nbOrphelinsB, r.lignesSansCleA]).toEqual([2, 1, 1, 1]);
    }
  });

  it("garde toutes les lignes des deux fichiers en jointure externe complète", () => {
    const r = fusionnerEtNettoyer([A, B], options("externe_complete"));
    // 2 correspondances + 2 lignes propres à A (dont celle sans clé) + 1 propre à B
    expect(r.corps).toHaveLength(5);
    expect(r.entetes[0]).toBe("Origine");
    expect(r.entetes).not.toContain("Fichier Source");
    const ligneB = r.corps.find((l) => l[0] === "Seulement dans paiements.csv")!;
    expect(String(ligneB[r.entetes.indexOf("Ref")])).toBe("999");
  });

  it("compare les valeurs des colonnes communes, au format près", () => {
    const r = fusionnerEtNettoyer([A, B], options("comparaison"));
    expect(r.entetes.slice(0, 3)).toEqual(["Statut", "Ref", "Colonnes en écart"]);
    expect(r.rapport.colonnesComparees).toEqual(["Montant", "Date"]);
    expect(r.rapport.nbIdentiques).toBe(1);
    expect(r.rapport.nbDifferentes).toBe(1);
    expect(r.rapport.ecartsParColonne).toEqual([{ colonne: "Montant", nb: 1 }]);
    expect(r.corps[0][0]).toBe("Différent");
    expect(r.corps[0][2]).toBe("Montant");
    expect(r.corps[0][r.entetes.indexOf("Montant (écart B − A)")]).toBe(-100);
    expect(r.corps.map((l) => l[0])).toEqual(["Différent", "Absent de B", "Absent de A", "Identique"]);
  });

  it("ne compare que les colonnes choisies", () => {
    const o = options("comparaison");
    o.jointure!.colonnesAComparer = ["Montant"];
    const r = fusionnerEtNettoyer([A, B], o);
    expect(r.rapport.colonnesComparees).toEqual(["Montant"]);
    expect(r.entetes).not.toContain("Date (A)");
  });

  it("reconnaît des valeurs équivalentes", () => {
    expect(valeursEquivalentes("1 000", 1000)).toBe(true);
    expect(valeursEquivalentes("05/01/2024", "2024-01-05")).toBe(true);
    expect(valeursEquivalentes(" Abidjan ", "abidjan")).toBe(true);
    expect(valeursEquivalentes("", null)).toBe(true);
    expect(valeursEquivalentes("10", "")).toBe(false);
  });

  it("propose la bonne clé et mesure la correspondance", () => {
    const s = suggererCles(A, B)!;
    expect([s.cleA, s.cleB]).toEqual(["Ref", "Référence"]);
    expect(apercuCorrespondance(A, B, "Ref", "Référence")).toEqual({ partA: 2 / 3, partB: 2 / 3 });
  });
});

describe("analyse/comparaison", () => {
  it("aligne les colonnes écrites différemment et signale celles écartées", () => {
    const r = assemblerComparaison([
      { nom: "2024.xlsx", entetes: ["Région", "Montant", "Commentaire"], corps: [["Poro", 10]] },
      { nom: "2024.xlsx", entetes: ["region", "MONTANT "], corps: [["Gbêkê", 20]] },
    ])!;
    expect(r.entetes).toEqual(["Fichier Source", "Région", "Montant"]);
    expect(r.sources).toEqual(["2024.xlsx", "2024.xlsx (2)"]);
    expect(r.corps[1]).toEqual(["2024.xlsx (2)", "Gbêkê", 20]);
    expect(r.colonnesIgnorees).toEqual(["Commentaire"]);
    expect(r.colonnesAlignees.map((c) => c.nomFinal)).toEqual(["Région", "Montant"]);
    expect(assemblerComparaison([{ nom: "a", entetes: ["X"], corps: [] }, { nom: "b", entetes: ["Y"], corps: [] }])).toBeNull();
  });
});

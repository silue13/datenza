import { describe, it, expect } from "vitest";
import { analyserColonnes } from "./analyse";
import { genererRapport } from "./rapport";

describe("analyse/mesures — ventes", () => {
  const entetes = ["Region", "Produit", "Quantite", "Prix_unitaire", "Montant"];
  const corps = [
    ["Abidjan", "Riz", "10", "1000", "10000"],
    ["Abidjan", "Riz", "5", "1000", "5000"],
    ["Abidjan", "Huile", "1", "500", "500"],
    ["Bouake", "Riz", "20", "1000", "20000"],
    ["Bouake", "Huile", "40", "500", ""], // montant manquant : ne doit pas compter comme 0
    ["Korhogo", "Huile", "10", "500", "30000"],
  ];
  const res = analyserColonnes(entetes, corps, entetes);

  it("additionne un montant et classe par total, pas par nombre de lignes", () => {
    const m = res.mesures.find((x) => x.colonne === "Montant")!;
    expect(m.operation).toBe("somme");
    expect(m.totalGlobal).toBe(65500);
    const region = m.repartitions.find((r) => r.dimension === "Region")!;
    expect(region.lignes[0].valeur).toBe("Korhogo"); // 1 seule ligne mais le plus gros total
  });
  it("moyenne un prix unitaire au lieu de l'additionner", () => {
    const p = res.mesures.find((x) => x.colonne === "Prix_unitaire");
    if (p) {
      expect(p.operation).toBe("moyenne");
      expect(p.totalGlobal).toBeNull();
    }
  });
});

describe("analyse/mesures — autre domaine (agriculture)", () => {
  const entetes = ["Region", "Culture", "Annee", "Superficie", "Rendement"];
  const corps = [
    ["Nord", "Cacao", "2022", "10", "2"],
    ["Nord", "Cacao", "2023", "20", "3"],
    ["Sud", "Hevea", "2022", "100", "1"],
    ["Sud", "Hevea", "2023", "50", "1"],
    ["Ouest", "Cacao", "2023", "5", "4"],
  ];
  const res = analyserColonnes(entetes, corps, entetes);

  it("ignore l'année, additionne la superficie, moyenne le rendement", () => {
    const noms = res.mesures.map((m) => m.colonne);
    expect(noms).not.toContain("Annee");
    expect(res.mesures.find((m) => m.colonne === "Superficie")!.operation).toBe("somme");
    expect(res.mesures.find((m) => m.colonne === "Rendement")!.operation).toBe("moyenne");
  });
  it("le rapport classe les régions par superficie", () => {
    const textes = genererRapport(res).map((b) => b.texte);
    expect(textes.some((t) => t.includes("Superficie (total) par Region : Sud"))).toBe(true);
  });
});

describe("analyse/mesures — colonne inconnue", () => {
  it("moyenne par défaut quand le sens du nom est inconnu", () => {
    const entetes = ["Groupe", "Xyz"];
    const corps = [["A", "1"], ["A", "3"], ["B", "10"], ["B", "20"]];
    const m = analyserColonnes(entetes, corps, entetes).mesures[0];
    expect(m.operation).toBe("moyenne");
  });
});

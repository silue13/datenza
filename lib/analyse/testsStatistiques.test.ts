import { describe, expect, it } from "vitest";
import { analyserColonnes } from "./analyse";
import { genererRapport } from "./rapport";
import { interpreterTest, libelleEffet, questionTest, trierTests, verdictTest, type ComparaisonGroupes, type LienCategories } from "./testsStatistiques";

// Générateur déterministe : les tests ne doivent pas dépendre du hasard
function alea(graine: number) {
  let s = graine;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

function fichierVentes() {
  const r = alea(42);
  const regions = ["Abidjan", "Bouaké", "Korhogo"];
  const niveaux: Record<string, number> = { Abidjan: 1000, Bouaké: 600, Korhogo: 300 };
  const corps: (string | number)[][] = [];
  for (let i = 0; i < 90; i++) {
    const region = regions[i % 3];
    // Le canal ne dépend pas de la région, ni le montant du canal
    const canal = r() < 0.5 ? "Boutique" : "En ligne";
    corps.push([region, canal, Math.round(niveaux[region] + (r() - 0.5) * 300)]);
  }
  return { entetes: ["Region", "Canal", "Montant"], corps };
}

describe("tests statistiques sur un fichier", () => {
  const { entetes, corps } = fichierVentes();
  const res = analyserColonnes(entetes, corps, entetes);

  it("détecte la différence de montant entre régions", () => {
    const t = res.tests.find((x) => x.type === "comparaison" && x.dimension === "Region") as ComparaisonGroupes;
    expect(t).toBeDefined();
    expect(t.methode).toBe("anova-welch");
    expect(t.significatif).toBe(true);
    expect(t.test.ampleur).toBe("forte");
    expect(t.groupes.map((g) => g.nom)).toEqual(["Abidjan", "Bouaké", "Korhogo"]);
    expect(interpreterTest(t)).toMatch(/varie réellement selon « Region »/);
  });

  it("ne conclut pas à une différence selon le canal (aucune n'a été simulée)", () => {
    const t = res.tests.find((x) => x.type === "comparaison" && x.dimension === "Canal") as ComparaisonGroupes;
    expect(t.methode).toBe("t-welch");
    expect(t.significatif).toBe(false);
    expect(interpreterTest(t)).toMatch(/^Aucune différence démontrée/);
  });

  it("ne trouve pas de lien entre région et canal", () => {
    const t = res.tests.find((x) => x.type === "lien") as LienCategories;
    expect(t.significatif).toBe(false);
  });

  it("signale une colonne qui découle d'une autre", () => {
    const villes = ["Abidjan", "Bouaké", "Korhogo", "Man"];
    const region: Record<string, string> = { Abidjan: "Abidjan", Bouaké: "Gbêkê", Korhogo: "Poro", Man: "Tonkpi" };
    const c = Array.from({ length: 80 }, (_, i) => [villes[i % 4], region[villes[i % 4]], i]);
    const r = analyserColonnes(["Ville", "Region", "Rang"], c, ["Ville", "Region", "Rang"]);
    const lien = r.tests.find((x) => x.type === "lien") as LienCategories;
    expect(lien.prudences).toContain("redondant");
    expect(interpreterTest(lien)).toMatch(/découle de l'autre/);
  });

  it("le rapport rédigé reprend le résultat significatif", () => {
    const blocs = genererRapport(res).filter((b) => b.type === "test");
    expect(blocs.length).toBeGreaterThan(0);
    expect(blocs[0].texte).toMatch(/Region/);
  });

  it("les corrélations portent leur significativité", () => {
    const c = Array.from({ length: 30 }, (_, i) => [i, 2 * i + (i % 3), (i * 7) % 11]);
    const r = analyserColonnes(["Prix", "Montant", "Note"], c, ["Prix", "Montant", "Note"]);
    const forte = r.correlations.find((x) => x.colonneA === "Prix" && x.colonneB === "Montant")!;
    expect(forte.significative).toBe(true);
    expect(forte.pValeur).toBeLessThan(0.001);
  });
});

describe("présentation commune des tests", () => {
  const { entetes, corps } = fichierVentes();
  const tests = analyserColonnes(entetes, corps, entetes).tests;

  it("classe les résultats démontrés en premier", () => {
    const tries = trierTests(tests);
    expect(verdictTest(tries[0])).toBe("demontre");
    expect(questionTest(tries[0])).toBe("Montant selon Region");
    expect(tries.map(verdictTest).slice(1).every((v) => v !== "demontre")).toBe(true);
  });
});

describe("libellé de la taille d'effet", () => {
  it("n'affiche pas « 0 » pour un effet minuscule", () => {
    const { entetes, corps } = fichierVentes();
    const t = analyserColonnes(entetes, corps, entetes).tests[0];
    expect(libelleEffet({ ...t, test: { ...t.test, effet: 0.0004 } })).toMatch(/^(η²|d|V de Cramér) < 0,01$/);
    expect(libelleEffet({ ...t, test: { ...t.test, effet: 0.48 } })).toMatch(/= 0,48$/);
  });
});

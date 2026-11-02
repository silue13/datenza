import { describe, it, expect, beforeAll } from "vitest";
import { analyserColonnes } from "./analyse";
import { genererRapport } from "./rapport";

describe("analyse/rapport", () => {
  const entetes = ["Region", "Montant", "Surface", "Actif"];
  const corps = [
    ["Poro", "10", "20", "oui"],
    ["Poro", "20", "40", "non"],
    ["Gbeke", "30", "60", "oui"],
    ["Gbeke", "40", "80", "oui"],
  ];

  let res: ReturnType<typeof analyserColonnes>;

  beforeAll(() => {
    res = analyserColonnes(entetes, corps, entetes);
  });

  it("produit les blocs attendus avec les types requis", () => {
    const blocs = genererRapport(res);
    const types = blocs.map((b) => b.type);

    // Décommentez pour afficher l'ordre exact produit par votre moteur :
    // console.log("Types réels générés :", types);

    expect(types[0]).toBe("intro");
    expect(types[1]).toBe("qualite");
    expect(types).toContain("numerique");
    expect(types).toContain("booleen");
    expect(types).toContain("correlation");
  });

  it("écrit en français", () => {
    const blocs = genererRapport(res);

    expect(blocs[0].texte).toMatch(/4 lignes analysées sur 4 champ\(s\)/i);
    expect(blocs[1].texte).toMatch(/aucune valeur manquante sur 16 cellules/i);

    const blocNum = blocs.find((b) => b.type === "numerique");
    expect(blocNum).toBeDefined();
    expect(blocNum!.texte).toMatch(/moyenne.*25/i);

    const blocCorr = blocs.find((b) => b.type === "correlation");
    expect(blocCorr).toBeDefined();
    expect(blocCorr!.texte).toMatch(/Montant.*Surface.*r\s*=\s*1/i);
  });

  it("écrit en anglais", () => {
    const blocsEn = genererRapport(res, "en");
    expect(blocsEn[0].texte).toMatch(/4 rows analyzed across 4 field\(s\)/i);
  });
});
import { describe, it, expect } from "vitest";
import { analyserColonnes } from "./analyse";
import { genererRapport } from "./rapport";

const entetes = ["Region", "Montant", "Surface", "Actif"];
const corps = [
  ["Poro", "10", "20", "oui"],
  ["Poro", "20", "40", "non"],
  ["Gbeke", "30", "60", "oui"],
  ["Gbeke", "40", "80", "oui"],
];
const res = analyserColonnes(entetes, corps, entetes);

describe("analyse/rapport", () => {
  it("produit les blocs dans le bon ordre", () => {
    const types = genererRapport(res).map((b) => b.type);
    expect(types).toEqual(["intro", "qualite", "categorie", "numerique", "numerique", "booleen", "correlation"]);
  });
  it("écrit en français", () => {
    const blocs = genererRapport(res);
    expect(blocs[0].texte).toBe("4 lignes analysées sur 4 champ(s).");
    expect(blocs[1].texte).toBe("Aucune valeur manquante sur 16 cellules.");
    expect(blocs[3].texte).toContain("moyenne 25");
    expect(blocs[6].texte).toBe("Montant et Surface : relation très forte et positive (r = 1).");
  });
  it("écrit en anglais", () => {
    expect(genererRapport(res, "en")[0].texte).toBe("4 rows analyzed across 4 field(s).");
  });
});
import { describe, it, expect } from "vitest";
import { analyserColonnes } from "./analyse";
import { genererRapport } from "./rapport";
import { creerFormateurs, natureValeur } from "./format";

describe("analyse/format", () => {
  it("reconnaît prix, pourcentage et nombre d'après le nom de colonne", () => {
    expect(natureValeur("Prix_unitaire")).toBe("prix");
    expect(natureValeur("Montant")).toBe("prix");
    expect(natureValeur("Coût total")).toBe("prix");
    expect(natureValeur("Taux de remplissage")).toBe("pourcentage");
    expect(natureValeur("Quantite")).toBe("nombre");
    expect(natureValeur("Superficie")).toBe("nombre");
    expect(natureValeur("Fraise")).toBe("nombre"); // « frais » ne doit pas matcher « fraise »
  });
  it("écrit chaque nature différemment", () => {
    const F = creerFormateurs("fr");
    expect(F.nombre(1637)).toBe(`1\u202F637`);
    expect(F.prix(17175800)).toBe(`17\u202F175\u202F800\u00A0FCFA`);
    expect(F.prix(15262.96)).toBe(`15\u202F263\u00A0FCFA`);
    expect(F.pourcent(35.62)).toBe("35,62\u00A0%");
    expect(creerFormateurs("en").pourcent(35.62)).toBe("35.62%");
    expect(creerFormateurs("fr", "EUR").prix(12.5)).toBe("12,5\u00A0EUR");
  });
});

describe("analyse/format — rapport de ventes", () => {
  const entetes = ["Region", "Quantite", "Prix_unitaire", "Montant"];
  const corps = [
    ["Abidjan", "10", "1000", "10000"],
    ["Abidjan", "5", "1000", "5000"],
    ["Bouake", "20", "500", "10000"],
    ["Korhogo", "10", "3000", "30000"],
  ];
  const textes = genererRapport(analyserColonnes(entetes, corps, entetes)).map((b) => b.texte);

  it("les prix portent la devise, les quantités non", () => {
    expect(textes.some((t) => t.startsWith("Montant : ") && t.includes("FCFA au total"))).toBe(true);
    expect(textes.some((t) => t.startsWith("Quantite : ") && t.includes("au total") && !t.includes("FCFA"))).toBe(true);
  });
  it("les parts sont des pourcentages", () => {
    expect(textes.some((t) => t.includes("Montant (total) par Region") && /FCFA, \d+(,\d+)?\u00A0%/.test(t))).toBe(true);
  });
});
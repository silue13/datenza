import { describe, expect, it } from "vitest";
import { analyserCohortes, analyserEvolution, analyserPareto, analyserRFM, detecterColonnesMetier } from "./metier";
import { analyserColonnes } from "./analyse";

describe("Pareto / ABC", () => {
  // 10 produits : A fait 50, B 30, puis 8 produits à 2,5 chacun (total 100)
  const corps = [["A", 50], ["B", 30], ...Array.from({ length: 8 }, (_, i) => [`P${i}`, 2.5])];
  const r = analyserPareto(["Produit", "CA"], corps, "Produit", "CA");

  it("classe A, B, C par part cumulée", () => {
    if (!r.ok) throw new Error(r.raison);
    expect(r.valeur.total).toBe(100);
    expect(r.valeur.elements.slice(0, 3).map((e) => [e.nom, e.classe, e.cumul])).toEqual([["A", "A", 50], ["B", "A", 80], ["P0", "B", 82.5]]);
    expect(r.valeur.classes.A).toEqual({ nb: 2, part: 80 });
    // 82,5 à 95 % : P0 à P5 en B ; P6 et P7 franchissent 95 % → C
    expect(r.valeur.classes.B.nb).toBe(6);
    expect(r.valeur.classes.C.nb).toBe(2);
    expect(r.valeur.nbPour80).toBe(2);
    expect(r.valeur.partElementsPour80).toBe(20);
  });

  it("refuse une mesure avec des valeurs négatives", () => {
    const r2 = analyserPareto(["P", "Marge"], [["a", 5], ["b", -2], ["c", 3]], "P", "Marge");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.raison).toMatch(/négative/);
  });
});

describe("évolution", () => {
  const lignes: (string | number)[][] = [];
  // 2024 puis 2025, deux régions ; mars 2025 : Abidjan baisse, Bouaké monte
  for (const [mois, abj, bke] of [["2024-03", 100, 50], ["2025-01", 120, 60], ["2025-02", 130, 70], ["2025-03", 90, 100]] as const) {
    lignes.push([`${mois}-01`, "Abidjan", abj], [`${mois}-15`, "Bouaké", bke]);
  }
  const r = analyserEvolution(["Date", "Region", "Ventes"], lignes, "Date", "Ventes", "Region");

  it("compare au mois précédent et au même mois de l'année précédente", () => {
    if (!r.ok) throw new Error(r.raison);
    const v = r.valeur;
    expect(v.granularite).toBe("mois");
    expect(v.periode).toBe("mars 2025");
    expect(v.valeur).toBe(190);
    expect(v.precedente).toMatchObject({ libelle: "févr. 2025", valeur: 200, ecart: -10, variation: -5 });
    expect(v.anneePrecedente).toMatchObject({ libelle: "mars 2024", valeur: 150, ecart: 40 });
    expect(v.anneePrecedente!.variation).toBeCloseTo(26.67, 2);
  });

  it("met en avant ce qui explique l'écart, dans son sens", () => {
    if (!r.ok) throw new Error(r.raison);
    // Baisse de 10 vs février : Abidjan (−40) l'explique, Bouaké (+30) l'atténue
    expect(r.valeur.precedente!.contributions.map((c) => [c.nom, c.ecart])).toEqual([["Abidjan", -40], ["Bouaké", 30]]);
  });

  it("travaille par année quand la colonne ne contient que des années", () => {
    const r2 = analyserEvolution(["Annee", "Prod"], [[2022, 10], [2023, 12], [2024, 15]], "Annee", "Prod");
    if (!r2.ok) throw new Error(r2.raison);
    expect(r2.valeur.granularite).toBe("annee");
    expect(r2.valeur.precedente).toMatchObject({ libelle: "2023", ecart: 3 });
    expect(r2.valeur.anneePrecedente).toBeNull();
  });

  it("signale un dernier mois inachevé", () => {
    const jours = Array.from({ length: 70 }, (_, i) => {
      const d = new Date(2025, 0, 1 + i);
      return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, 10];
    });
    const r3 = analyserEvolution(["Date", "V"], jours, "Date", "V");
    if (!r3.ok) throw new Error(r3.raison);
    expect(r3.valeur.periode).toBe("mars 2025");
    expect(r3.valeur.incomplete).toBe(true);
  });
});

/** Fichier de ventes : 20 clients aux comportements connus. */
function ventesClients() {
  const lignes: (string | number)[][] = [];
  const ajouter = (client: string, dates: string[], montant: number) => dates.forEach((d) => lignes.push([client, d, montant]));
  // 5 champions : achètent chaque mois de janvier à juin
  for (let i = 0; i < 5; i++) ajouter(`CH${i}`, ["2025-01-10", "2025-02-10", "2025-03-10", "2025-04-10", "2025-05-10", "2025-06-10"], 500);
  // 5 anciens bons clients : très actifs en janvier-février, plus rien ensuite
  for (let i = 0; i < 5; i++) ajouter(`AR${i}`, ["2025-01-05", "2025-01-20", "2025-02-05", "2025-02-20", "2025-02-25"], 400);
  // 5 nouveaux : un seul achat fin juin
  for (let i = 0; i < 5; i++) ajouter(`NV${i}`, ["2025-06-25"], 100);
  // 5 perdus : un seul achat en janvier
  for (let i = 0; i < 5; i++) ajouter(`PD${i}`, ["2025-01-03"], 50);
  return lignes;
}

describe("RFM", () => {
  const r = analyserRFM(["Client", "Date", "Montant"], ventesClients(), "Client", "Date", "Montant");

  it("retrouve les segments attendus", () => {
    if (!r.ok) throw new Error(r.raison);
    const seg = (prefixe: string) => [...new Set(r.valeur.clients.filter((c) => c.client.startsWith(prefixe)).map((c) => c.segment))];
    expect(seg("CH")).toEqual(["Champions"]);
    expect(seg("AR")).toEqual(["À risque"]);
    expect(seg("NV")).toEqual(["Nouveaux"]);
    expect(seg("PD")).toEqual(["Perdus"]);
    expect(r.valeur.dateReference).toBe("25/06/2025");
  });

  it("chiffre chaque segment", () => {
    if (!r.ok) throw new Error(r.raison);
    const ch = r.valeur.segments.find((s) => s.segment === "Champions")!;
    expect(ch.nb).toBe(5);
    expect(ch.partClients).toBe(25);
    expect(ch.montant).toBe(15000);
    expect(ch.partMontant).toBeCloseTo((15000 / (15000 + 10000 + 500 + 250)) * 100, 6);
  });

  it("exige assez de clients", () => {
    const r2 = analyserRFM(["Client", "Date", "Montant"], [["a", "2025-01-01", 1]], "Client", "Date", "Montant");
    expect(r2.ok).toBe(false);
  });
});

describe("cohortes", () => {
  it("mesure la part de chaque cohorte encore active les mois suivants", () => {
    const r = analyserCohortes(["Client", "Date", "Montant"], ventesClients(), "Client", "Date");
    if (!r.ok) throw new Error(r.raison);
    const janv = r.valeur.cohortes[0];
    // Cohorte de janvier : 5 champions + 5 à risque + 5 perdus
    expect(janv).toMatchObject({ mois: "janv. 2025", taille: 15 });
    expect(janv.retention.slice(0, 3).map((x) => Math.round(x!))).toEqual([100, 67, 33]);
    // Juin : dernier mois des données, pas de recul au-delà
    const juin = r.valeur.cohortes[r.valeur.cohortes.length - 1];
    expect(juin).toMatchObject({ mois: "juin 2025", taille: 5 });
    expect(juin.retention[1]).toBeNull();
  });
});

describe("détection des colonnes", () => {
  it("repère la date, le client et la mesure", () => {
    const corps = ventesClients().map(([c, d, m], i) => [c, d, m, ["Abidjan", "Bouaké", "Man"][i % 3]]);
    const res = analyserColonnes(["Code client", "Date", "Montant", "Ville"], corps, ["Code client", "Date", "Montant", "Ville"]);
    const d = detecterColonnesMetier(res.statistiques, res.mesures.map((m) => m.colonne));
    expect(d.date).toBe("Date");
    expect(d.client).toBe("Code client");
    expect(d.mesure).toBe("Montant");
    expect(d.dimensions).toContain("Ville");
  });
});

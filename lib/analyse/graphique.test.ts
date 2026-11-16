import { describe, it, expect } from "vitest";
import { expliquerGraphique, recommanderGraphiques, calculerSerie, calculerSeriesVentilees, filtrePourPoint, alignerSeries, formaterCompact, libellePeriode } from "./graphique";
import { appliquerFiltres } from "./filtres";

const entetes = ["Date", "Region", "Montant", "Mois"];
const corps = [
  ["15/01/2024", "Poro", "100", "Mars"],
  ["20/01/2024", "Gbeke", "50", "Janvier"],
  ["03/02/2024", "Poro", "n/a", "Février"],
  ["10/03/2024", "Tonkpi", "25", "Janvier"],
  ["11/03/2024", "Poro", "abc", "Mars"],
];

describe("analyse/graphique", () => {
  it("trie un axe de dates dans l'ordre chronologique", () => {
    const s = calculerSerie(entetes, corps, "Date", "Montant", { agregation: "Somme", granularite: "mois" });
    expect(s.temporel).toBe(true);
    expect(s.points.map((p) => p.label)).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(s.points.map((p) => p.valeur)).toEqual([150, null, 25]);
    expect(s.nbNonNumeriques).toBe(1);
  });
  it("trie les mois en lettres dans l'ordre du calendrier", () => {
    const s = calculerSerie(entetes, corps, "Mois", "Montant", { agregation: "Somme" });
    expect(s.points.map((p) => p.label)).toEqual(["Janvier", "Février", "Mars"]);
  });
  it("classe les catégories et regroupe le surplus dans Autres", () => {
    const s = calculerSerie(entetes, corps, "Region", "Montant", { agregation: "Somme", limite: 1 });
    expect(s.points).toEqual([
      { cle: "Poro", label: "Poro", valeur: 100, effectif: 3 },
      { label: "Autres (2)", valeur: 75, effectif: 2 },
    ]);
    expect(s.tronque).toBe(true);
  });
  it("calcule réellement médiane, pourcentage et valeurs distinctes", () => {
    const med = calculerSerie(["G", "V"], [["a", 1], ["a", 2], ["a", 30]], "G", "V", { agregation: "Mediane" });
    expect(med.points[0].valeur).toBe(2);
    const pct = calculerSerie(entetes, corps, "Region", null, { agregation: "Pourcentage" });
    expect(pct.points[0]).toMatchObject({ label: "Poro", valeur: 60, effectif: 3 });
    const dis = calculerSerie(entetes, corps, "Region", "Mois", { agregation: "Valeurs distinctes" });
    expect(dis.points[0]).toMatchObject({ label: "Poro", valeur: 2, effectif: 3 });
  });
  it("ne remplace pas une absence de donnée par zéro", () => {
    const s = calculerSerie(["G", "V"], [["a", "abc"], ["b", "5"]], "G", "V", { agregation: "Moyenne" });
    expect(s.points).toMatchObject([
      { label: "b", valeur: 5, effectif: 1 },
      { label: "a", valeur: null, effectif: 1 },
    ]);
  });
  it("aligne plusieurs séries sur un axe commun", () => {
    const a = calculerSerie(entetes, corps, "Mois", "Montant", { agregation: "Somme" }, (l) => l[1] === "Poro");
    const b = calculerSerie(entetes, corps, "Mois", "Montant", { agregation: "Somme" }, (l) => l[1] !== "Poro");
    const r = alignerSeries([a, b]);
    expect(r.labels).toEqual(["Janvier", "Février", "Mars"]);
    expect(r.donnees).toEqual([[null, null, 100], [75, null, null]]);
  });
  it("formate les nombres et les périodes", () => {
    expect(formaterCompact(1250000)).toBe("1,25 M");
    expect(formaterCompact(12345)).toBe("12,3 k");
    expect(libellePeriode("2024-T2")).toBe("T2 2024");
    expect(libellePeriode("2024-03-08")).toBe("08/03/2024");
  });
  it("ventile une mesure selon une légende (barres empilées)", () => {
    const e = ["Region", "Statut", "Montant"];
    const c = [["Poro", "Livré", 10], ["Poro", "Annulé", 5], ["Gbeke", "Livré", 20], ["Gbeke", "Livré", 1], ["Tonkpi", "Annulé", 2]];
    const v = calculerSeriesVentilees(e, c, "Region", "Statut", "Montant", { agregation: "Somme" });
    expect(v.axe.map((a) => a.label)).toEqual(["Gbeke", "Poro", "Tonkpi"]);
    expect(v.series).toEqual([
      { nom: "Livré", donnees: [21, 10, null] },
      { nom: "Annulé", donnees: [null, 5, 2] },
    ]);
    // La somme des séries redonne le total de chaque barre, y compris avec « Autres » sur l'axe et la légende
    const t = calculerSeriesVentilees(e, c, "Region", "Statut", "Montant", { agregation: "Somme", limite: 1, limiteSeries: 1 });
    expect(t.axe.map((a) => a.label)).toEqual(["Gbeke", "Autres (2)"]);
    expect(t.series).toEqual([
      { nom: "Livré", donnees: [21, 10] },
      { nom: "Autres (1)", donnees: [null, 7] },
    ]);
    const p = calculerSeriesVentilees(e, c, "Region", "Statut", null, { agregation: "Pourcentage" });
    expect(p.series.flatMap((x) => x.donnees).reduce((a: number, b) => a + (b ?? 0), 0)).toBe(100);
  });
  it("fabrique le filtre d'un clic sur un point, y compris pour une période", () => {
    expect(filtrePourPoint("Region", "Poro", null)).toEqual({ colonne: "Region", operateur: "egal", valeur: "Poro" });
    expect(filtrePourPoint("Region", undefined, null)).toBeNull();
    const f = filtrePourPoint("Date", "2024-02", "mois");
    expect(f).toEqual({ colonne: "Date", operateur: "entre", valeur: "2024-02-01", valeurFin: "2024-02-29 23:59" });
    const lignes = [{ Date: "31/01/2024" }, { Date: "03/02/2024" }, { Date: "2024-02-29 18:00" }, { Date: "01/03/2024" }];
    expect(appliquerFiltres(lignes, [f!])).toHaveLength(2);
    expect(filtrePourPoint("Date", "2024-T1", "trimestre")?.valeurFin).toBe("2024-03-31 23:59");
  });
  it("propose un tableau de bord adapté au fichier, sans doublon", () => {
    const op = (n: string) => (/taille|taux/i.test(n) ? "moyenne" : "somme") as "somme" | "moyenne";
    const e = ["Departement", "Sous_prefecture", "Hommes", "Femmes", "Population_totale", "Taille_moyenne_menage"];
    const c = Array.from({ length: 20 }, (_, i) => [`D${i % 4}`, `SP${i}`, 10 + i, 12 + i, 22 + 2 * i, 5 + (i % 3)]);
    const r = recommanderGraphiques(
      e, c,
      { temporelles: [], mesurables: e.slice(2), categorielles: ["Departement", "Sous_prefecture"] },
      op, () => false
    );
    expect(r.map((x) => [x.type, x.x, x.mesures.join("+"), x.horizontal])).toEqual([
      ["Anneau", "Departement", "Population_totale", false],
      ["Barres", "Sous_prefecture", "Population_totale", true],
      ["Barres", "Departement", "Hommes+Femmes", false],
      ["Barres", "Sous_prefecture", "Taille_moyenne_menage", true],
    ]);
    expect(r[0].titre).toBe("Répartition : Population totale par Departement");
    // Sans mesure : on compte les lignes
    const s = recommanderGraphiques(e, c, { temporelles: [], mesurables: [], categorielles: ["Departement"] }, op, () => false);
    expect(s.map((x) => [x.type, x.agregation])).toEqual([["Anneau", "Nombre"]]);
  });
  it("explique un classement sans compter les vides comme des zéros ni citer « Autres »", () => {
    const e = expliquerGraphique({
      titre: "Somme — Montant selon Region",
      type: "Barres",
      labels: ["Poro", "Gbeke", "Tonkpi", "Bagoue", "Autres (7)"],
      datasets: [{ label: "Somme — Montant", data: [50, 30, null, 10, 110] }],
    })!;
    const texte = e.lignes.map((l) => `${l.titre}: ${l.texte}`).join(" | ");
    expect(texte).toContain("En tête: « Poro » : 50, soit 25 % du total.");
    expect(texte).toContain("« Bagoue » : 10");
    expect(texte).toContain("5 fois plus");
    expect(texte).toContain("1 catégorie sans valeur numérique");
    expect(texte).not.toContain("« Autres");
    expect(texte).not.toContain("Tonkpi");
  });
  it("ne parle ni de total ni de part pour une moyenne", () => {
    const e = expliquerGraphique({ titre: "Moyenne — Prix selon Ville", type: "Barres", labels: ["A", "B", "C"], datasets: [{ label: "Moyenne — Prix", data: [10, 20, 60] }] })!;
    const texte = e.lignes.map((l) => l.texte).join(" ");
    expect(texte).not.toContain("du total");
    expect(texte).toContain("La moitié des 3 catégories est au-dessus de 20");
  });
  it("décrit une série dans le temps comme une évolution", () => {
    const e = expliquerGraphique({ titre: "Somme — Ventes selon Date", type: "Aires", labels: ["janv. 2024", "févr. 2024", "mars 2024", "avr. 2024"], datasets: [{ label: "Somme — Ventes", data: [100, 180, null, 150] }] })!;
    expect(e.lignes[0]).toEqual({ titre: "Évolution", texte: "De 100 (« janv. 2024 ») à 150 (« avr. 2024 ») : hausse de 50 (+50 %)." });
    expect(e.lignes[1].texte).toBe("Maximum en « févr. 2024 » (180), minimum en « janv. 2024 » (100).");
    expect(e.lignes[2].texte).toContain("1 période sans donnée");
  });
  it("compare plusieurs séries sans supposer que ce sont des fichiers", () => {
    const e = expliquerGraphique({
      titre: "Hommes, Femmes par Departement",
      type: "Barres",
      labels: ["Bouake", "Beoumi", "Botro"],
      datasets: [{ label: "Hommes", data: [100, 40, null] }, { label: "Femmes", data: [90, 45, 20] }],
    })!;
    expect(e.multiSeries).toBe(true);
    expect(e.lignes[0].texte).toBe("« Femmes » : 155 au total (52,5 % de l'ensemble des séries), devant « Hommes » (140).");
    expect(e.lignes[1].texte).toBe("En tête : « Hommes » sur 1, « Femmes » sur 1 (sur 2 catégories comparables).");
    expect(e.lignes[2].texte).toBe("Sur « Bouake » : « Hommes » (100) contre « Femmes » (90), soit 10 d'écart.");
    expect(expliquerGraphique({ labels: [], datasets: [] })).toBeNull();
  });
});

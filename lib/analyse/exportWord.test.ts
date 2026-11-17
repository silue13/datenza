import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { Packer } from "docx";
import { analyserColonnes } from "./analyse";
import { genererRapport } from "./rapport";
import { construireRapportWord } from "./exportWord";

/** Texte brut du document Word (balises retirées). */
async function texteDocx(doc: ReturnType<typeof construireRapportWord>) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file("word/document.xml")!.async("string");
  return { texte: xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), fichiers: Object.keys(zip.files) };
}

function ventes() {
  const regions = ["Abidjan", "Bouaké", "Korhogo"];
  const corps: (string | number)[][] = [];
  for (let c = 0; c < 30; c++) {
    for (let k = 0; k <= c % 4; k++) {
      const mois = String(1 + ((c + 3 * k) % 6)).padStart(2, "0");
      corps.push([`C${c}`, `2025-${mois}-1${k}`, regions[c % 3], 1000 * (1 + (c % 3)) + 37 * k]);
    }
  }
  return { entetes: ["Client", "Date", "Region", "Montant"], corps };
}

describe("rapport Word", () => {
  it("contient les sections attendues, numérotées sans trou", async () => {
    const { entetes, corps } = ventes();
    const analyse = analyserColonnes(entetes, corps, entetes);
    const doc = construireRapportWord({
      nomProjet: "ventes.csv",
      entetes,
      corps,
      analyse,
      rapport: genererRapport(analyse),
      date: new Date(2025, 10, 17),
      images: [{ titre: "Montant par région", png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), largeur: 1000, hauteur: 560, commentaire: "Abidjan en tête." }],
    });
    const { texte, fichiers } = await texteDocx(doc);
    expect(texte).toContain("RAPPORT D'ANALYSE");
    expect(texte).toContain("17 novembre 2025 · généré avec DATENZA");
    const titres = [...texte.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]);
    expect(titres.map(([n]) => n)).toEqual(titres.map((_, i) => i + 1));
    expect(titres.map(([, t]) => t)).toEqual(expect.arrayContaining(["Périmètre et qualité des données", "Indicateurs chiffrés", "Analyses métier", "Tests statistiques", "Graphiques"]));
    expect(texte).toMatch(/des « Client » \(\d+ sur 30\) font 80 % de « Montant »/);
    expect(texte).toMatch(/« Montant » en (hausse|baisse) de [\d,]+ % par rapport à mai 2025, surtout du fait de « (Abidjan|Bouaké|Korhogo) »/);
    expect(texte).toContain("Segments clients (RFM)");
    expect(texte).toContain("Montant selon Region");
    expect(texte).toContain("Abidjan en tête.");
    expect(texte).toContain("Note de méthode");
    expect(fichiers.some((f) => f.startsWith("word/media/"))).toBe(true);
  });

  it("reste valide sur un fichier sans date ni catégorie", async () => {
    const corps = Array.from({ length: 12 }, (_, i) => [i, i * 2]);
    const analyse = analyserColonnes(["A", "B"], corps, ["A", "B"]);
    const { texte } = await texteDocx(construireRapportWord({ nomProjet: "mesures", entetes: ["A", "B"], corps, analyse, rapport: [] }));
    expect(texte).toContain("1. Périmètre et qualité des données");
    expect(texte).not.toContain("Analyses métier");
    expect(texte).not.toContain("Tests statistiques");
  });
});

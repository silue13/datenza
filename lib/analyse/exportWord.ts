/**
 * Rapport d'analyse au format Word (.docx), modifiable : synthèse, indicateurs, analyses métier,
 * tests statistiques, corrélations, graphiques et note de méthode.
 * La construction du document est séparée du téléchargement pour pouvoir être testée hors navigateur.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { analyserColonnes } from "./analyse";
import type { Cellule } from "./utils";
import { formaterP } from "./inference";
import {
  AVERTISSEMENT_TESTS,
  interpreterTest,
  libelleEffet,
  LIBELLES_VERDICT,
  nomMethode,
  questionTest,
  trierTests,
  verdictTest,
} from "./testsStatistiques";
import {
  analyserCohortes,
  analyserEvolution,
  analyserPareto,
  analyserRFM,
  CONSEILS_RFM,
  detecterColonnesMetier,
  phraseCohortes,
  phraseEvolution,
  phrasePareto,
} from "./metier";

type ResultatAnalyse = ReturnType<typeof analyserColonnes>;

export interface ImageRapport {
  titre: string;
  png: Uint8Array;
  largeur: number;
  hauteur: number;
  commentaire?: string;
}

export interface DonneesRapportWord {
  nomProjet: string;
  entetes: string[];
  corps: Cellule[][];
  analyse: ResultatAnalyse;
  rapport: { type: string; texte: string }[];
  images?: ImageRapport[];
  /** Date affichée sur la couverture (par défaut : aujourd'hui). */
  date?: Date;
}

const BLEU = "1D4ED8";
const GRIS = "64748B";
const FOND_ENTETE = "0F172A";
const FOND_ZEBRE = "F1F5F9";
const COULEURS_VERDICT = { demontre: "059669", faible: "D97706", nonDemontre: GRIS, redondant: GRIS } as const;

// Largeur utile d'une page (format Letter par défaut, marges de 2,54 cm), en vingtièmes de point
const LARGEUR_UTILE = 9360;

const nf = (x: number | null | undefined, dec = 2) =>
  x === null || x === undefined || !isFinite(x) ? "—" : x.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : dec });
const pct = (x: number) => `${x.toLocaleString("fr-FR", { maximumFractionDigits: x < 10 ? 1 : 0 })} %`;

// ---------------------------------------------------------------------------
// Briques de mise en page
// ---------------------------------------------------------------------------

const titre1 = (texte: string) => new Paragraph({ text: texte, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 } });
const titre2 = (texte: string) => new Paragraph({ text: texte, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
const texte = (t: string, options: { italique?: boolean; couleur?: string; gras?: boolean } = {}) =>
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, italics: options.italique, color: options.couleur, bold: options.gras })] });
const puce = (t: string) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 80 } });

function tableau(entetes: string[], lignes: (string | { texte: string; couleur?: string; gras?: boolean })[][], largeurs?: number[]): Table {
  const cellule = (contenu: string | { texte: string; couleur?: string; gras?: boolean }, i: number, enTete: boolean, zebre: boolean) => {
    const c = typeof contenu === "string" ? { texte: contenu } : contenu;
    return new TableCell({
      width: { size: Math.round(((largeurs?.[i] ?? 100 / entetes.length) / 100) * LARGEUR_UTILE), type: WidthType.DXA },
      shading: enTete ? { type: ShadingType.CLEAR, color: "auto", fill: FOND_ENTETE } : zebre ? { type: ShadingType.CLEAR, color: "auto", fill: FOND_ZEBRE } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: c.texte, bold: enTete || c.gras, color: enTete ? "FFFFFF" : c.couleur, size: 18 })] })],
    });
  };
  const bord = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" };
  // Largeurs absolues : les pourcentages seuls sont ignorés par certains traitements de texte
  const parts = largeurs ?? entetes.map(() => 100 / entetes.length);
  const colonnes = parts.map((p) => Math.round((p / 100) * LARGEUR_UTILE));
  return new Table({
    width: { size: LARGEUR_UTILE, type: WidthType.DXA },
    columnWidths: colonnes,
    layout: TableLayoutType.FIXED,
    borders: { top: bord, bottom: bord, left: bord, right: bord, insideHorizontal: bord, insideVertical: bord },
    rows: [
      new TableRow({ tableHeader: true, children: entetes.map((e, i) => cellule(e, i, true, false)) }),
      ...lignes.map((l, k) => new TableRow({ children: l.map((c, i) => cellule(c, i, false, k % 2 === 1)) })),
    ],
  });
}

const espace = () => new Paragraph({ text: "", spacing: { after: 120 } });

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function sectionPerimetre(d: DonneesRapportWord, T: (t: string) => Paragraph) {
  const st = d.analyse.statistiques;
  const noms = Object.keys(st).filter((n) => n !== "Fichier Source");
  const cellules = d.analyse.nbLignes * noms.length;
  const manquants = noms.reduce((s, n) => s + st[n].nbVides, 0);
  const completude = cellules ? (100 * (cellules - manquants)) / cellules : 100;
  return [
    T("Périmètre et qualité des données"),
    texte(`${d.analyse.nbLignes.toLocaleString("fr-FR")} lignes et ${noms.length} colonnes analysées. Complétude : ${pct(completude)}${manquants ? ` (${manquants.toLocaleString("fr-FR")} valeur(s) manquante(s))` : " (aucune valeur manquante)"}.`),
  ];
}

function sectionSynthese(d: DonneesRapportWord, T: (t: string) => Paragraph) {
  const blocs = d.rapport.filter((b) => b.type !== "intro" && b.type !== "qualite" && !b.texte.includes("Fichier Source"));
  if (!blocs.length) return [];
  return [T("Synthèse"), ...blocs.map((b) => puce(b.texte))];
}

function sectionIndicateurs(d: DonneesRapportWord, T: (t: string) => Paragraph) {
  const st = d.analyse.statistiques;
  const num = Object.keys(st).filter((n) => st[n].type === "numerique" && n !== "Fichier Source").slice(0, 15);
  if (!num.length) return [];
  type S = { n: number; moyenne: number | null; mediane: number | null; ecartType: number | null; min: number | null; max: number | null };
  return [
    T("Indicateurs chiffrés"),
    tableau(
      ["Colonne", "Valeurs", "Moyenne", "Médiane", "Écart-type", "Minimum", "Maximum"],
      num.map((n) => {
        const s = st[n].stats as S;
        return [{ texte: n, gras: true }, s.n.toLocaleString("fr-FR"), nf(s.moyenne), nf(s.mediane), nf(s.ecartType), nf(s.min), nf(s.max)];
      }),
      [26, 11, 13, 13, 13, 12, 12]
    ),
  ];
}

function sectionMetier(d: DonneesRapportWord, T: (t: string) => Paragraph) {
  const det = detecterColonnesMetier(d.analyse.statistiques, (d.analyse.mesures ?? []).map((m) => m.colonne));
  const blocs: (Paragraph | Table)[] = [];
  const { entetes, corps } = d;

  if (det.dimensions[0] && det.mesure) {
    const r = analyserPareto(entetes, corps, det.dimensions[0], det.mesure);
    if (r.ok) {
      blocs.push(titre2(`Concentration (Pareto / ABC) : ${det.mesure} par ${det.dimensions[0]}`), texte(phrasePareto(r.valeur, det.dimensions[0], det.mesure)));
      blocs.push(
        tableau(
          ["Classe", "Éléments", "Part du total", "Lecture"],
          (["A", "B", "C"] as const).map((c) => [
            { texte: `Classe ${c}`, gras: true },
            String(r.valeur.classes[c].nb),
            pct(r.valeur.classes[c].part),
            c === "A" ? "L'essentiel du total : à suivre de près" : c === "B" ? "Contribution intermédiaire" : "Longue traîne : à simplifier",
          ]),
          [16, 14, 18, 52]
        )
      );
    }
  }
  if (det.date && det.mesure) {
    const r = analyserEvolution(entetes, corps, det.date, det.mesure, det.explicative ?? undefined);
    const phrase = r.ok ? phraseEvolution(r.valeur, det.mesure) : null;
    if (r.ok && phrase) {
      blocs.push(titre2(`Évolution : ${det.mesure}`), texte(phrase));
      if (r.valeur.incomplete) blocs.push(texte(`${r.valeur.periode} semble inachevé : la comparaison sous-estime probablement cette période.`, { italique: true, couleur: "B45309" }));
    }
  }
  if (det.client && det.date && det.mesure) {
    const r = analyserRFM(entetes, corps, det.client, det.date, det.mesure);
    if (r.ok) {
      blocs.push(
        titre2("Segments clients (RFM)"),
        texte(`${r.valeur.clients.length} clients notés sur la récence, la fréquence et le montant de leurs achats, par rapport au dernier achat du fichier (${r.valeur.dateReference}).`),
        tableau(
          ["Segment", "Clients", "Part du montant", "Action conseillée"],
          r.valeur.segments.map((s) => [{ texte: s.segment, gras: true }, `${s.nb} (${pct(s.partClients)})`, pct(s.partMontant), CONSEILS_RFM[s.segment]]),
          [16, 14, 14, 56]
        )
      );
    }
    const c = analyserCohortes(entetes, corps, det.client, det.date);
    const pc = c.ok ? phraseCohortes(c.valeur) : null;
    if (pc) blocs.push(titre2("Fidélité des clients (cohortes)"), texte(pc));
  }
  return blocs.length ? [T("Analyses métier"), ...blocs] : [];
}

function sectionTests(d: DonneesRapportWord, T: (t: string) => Paragraph) {
  const tests = trierTests(d.analyse.tests ?? []);
  if (!tests.length) return [];
  const demontres = tests.filter((t) => verdictTest(t) === "demontre");
  return [
    T("Tests statistiques"),
    texte("Ces tests indiquent si un écart ou un lien observé dépasse ce que le hasard produit."),
    tableau(
      ["Question testée", "Verdict", "Preuve"],
      tests.slice(0, 15).map((t) => {
        const v = verdictTest(t);
        return [{ texte: questionTest(t), gras: true }, { texte: LIBELLES_VERDICT[v], couleur: COULEURS_VERDICT[v], gras: true }, `${nomMethode(t)} · ${formaterP(t.pAjustee)} · ${libelleEffet(t)}`];
      }),
      [34, 16, 50]
    ),
    espace(),
    ...(demontres.length ? [titre2("Ce qui est démontré"), ...demontres.slice(0, 5).map((t) => puce(interpreterTest(t)))] : [texte("Aucun écart ni lien n'est démontré : les différences visibles peuvent venir du hasard.")]),
    texte(AVERTISSEMENT_TESTS.fr, { italique: true, couleur: GRIS }),
  ];
}

function sectionCorrelations(d: DonneesRapportWord, T: (t: string) => Paragraph) {
  const corr = [...(d.analyse.correlations ?? [])]
    .filter((c) => c.colonneA !== "Fichier Source" && c.colonneB !== "Fichier Source" && Math.abs(c.coefficient) >= 0.3)
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
    .slice(0, 10);
  if (!corr.length) return [];
  return [
    T("Corrélations"),
    tableau(
      ["Variables", "r", "p-valeur", "Lecture"],
      corr.map((c) => [
        { texte: `${c.colonneA} ↔ ${c.colonneB}`, gras: true },
        nf(c.coefficient),
        typeof c.pValeur === "number" ? formaterP(c.pValeur) : "—",
        `${c.interpretation}${c.significative === false ? " (non significative)" : ""}`,
      ]),
      [38, 10, 18, 34]
    ),
    texte("Une corrélation mesure un lien linéaire entre deux colonnes ; elle ne prouve pas que l'une cause l'autre.", { italique: true, couleur: GRIS }),
  ];
}

function sectionGraphiques(images: ImageRapport[], T: (t: string) => Paragraph) {
  if (!images.length) return [];
  const LARGEUR_MAX = 600;
  return [
    T("Graphiques"),
    ...images.flatMap((img) => {
      const ratio = img.hauteur / img.largeur;
      return [
        titre2(img.titre),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ type: "png", data: img.png, transformation: { width: LARGEUR_MAX, height: Math.round(LARGEUR_MAX * ratio) } })],
        }),
        ...(img.commentaire ? [texte(img.commentaire, { couleur: "334155" })] : []),
      ];
    }),
  ];
}

function sectionMethode() {
  return [
    titre1("Note de méthode"),
    puce("Moyennes, sommes et répartitions calculées sur l'ensemble des lignes importées, après filtres éventuels."),
    puce("Comparaison de deux groupes : test t de Welch ; trois groupes ou plus : ANOVA de Welch ; lien entre deux catégories : test du khi-deux. Les p-valeurs sont corrigées par la méthode de Holm, plusieurs tests étant menés en même temps ; un résultat est dit démontré si la p-valeur corrigée est inférieure à 0,05."),
    puce("Taille d'effet : d de Cohen (deux groupes), η² ou part de la variation expliquée (plusieurs groupes), V de Cramér (catégories)."),
    puce("Pareto / ABC : classe A jusqu'à 80 % du total cumulé, B jusqu'à 95 %, C au-delà."),
    puce("RFM : chaque client reçoit une note de 1 à 5 par quintile sur la récence de son dernier achat, le nombre d'achats et le montant total."),
  ];
}

// ---------------------------------------------------------------------------

export function construireRapportWord(d: DonneesRapportWord): Document {
  const date = (d.date ?? new Date()).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const nom = d.nomProjet.replace(/\.[^.]+$/, "");
  // Sections numérotées dans l'ordre où elles apparaissent : une section absente ne laisse pas de trou
  let numero = 0;
  const T = (t: string) => titre1(`${++numero}. ${t}`);
  return new Document({
    creator: "DATENZA",
    title: `Rapport d'analyse — ${nom}`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 30, bold: true, color: "0F172A" } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: 24, bold: true, color: BLEU } },
      ],
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${nom} · DATENZA · page `, color: GRIS, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: GRIS, size: 16 })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ spacing: { before: 2400, after: 120 }, children: [new TextRun({ text: "RAPPORT D'ANALYSE", bold: true, color: BLEU, size: 22 })] }),
          new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: nom, bold: true, size: 52, color: "0F172A" })] }),
          new Paragraph({ children: [new TextRun({ text: `${date} · généré avec DATENZA`, color: GRIS })] }),
          new Paragraph({ text: "", pageBreakBefore: true }),
          ...sectionPerimetre(d, T),
          ...sectionSynthese(d, T),
          ...sectionIndicateurs(d, T),
          ...sectionMetier(d, T),
          ...sectionTests(d, T),
          ...sectionCorrelations(d, T),
          ...sectionGraphiques(d.images ?? [], T),
          ...sectionMethode(),
        ],
      },
    ],
  });
}

/** Construit le rapport et le télécharge (navigateur). */
export async function telechargerRapportWord(d: DonneesRapportWord): Promise<void> {
  const blob = await Packer.toBlob(construireRapportWord(d));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = d.nomProjet.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  a.href = url;
  a.download = `DATENZA_Rapport_${base || "analyse"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

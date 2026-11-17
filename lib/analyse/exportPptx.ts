import pptxgen from "pptxgenjs";
import { trierChronologiquement } from "./dates";
import { expliquerGraphique } from "./graphique";
import { parseNombre } from "./utils";

// =========================================================================
// INTERFACES & TYPES EXPORTÉS
// =========================================================================
export interface ElementPptxExport {
  id: string | number;
  typeVisuel?: "graphique" | "tdc" | "carte" | "prevision";
  titre: string;
  sousTitre?: string;
  image?: string; // Capture Base64 haute résolution (Carte, Recharts, TCD)
  chartType?: "bar" | "line" | "pie" | "doughnut";
  labels?: string[];
  datasets?: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
  }[];
  donneesTableau?: {
    entetes: string[];
    lignes: (string | number)[][];
  };
  interpretation?: string;
}

export interface GraphiqueExport {
  id: number | string;
  titre: string;
  type: string;
  image?: string; // Capture Base64
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
  }[];
  interpretation?: string;
  /** Champs des graphiques avancés (voir GraphiqueEpingle) : nuage, titres d'axes, constats et indicateurs calculés. */
  nuage?: { series: { nom: string; points: { x: number; y: number }[] }[] };
  axes?: { x?: string; y?: string; y2?: string };
  constats?: { titre: string; texte: string }[];
  indicateurs?: { titre: string; valeur: string; detail: string }[];
}

export interface BlocRapportExport {
  type: string;
  texte: string;
}

export interface DonneesExportPptx {
  nomProjet: string;
  entetes: string[];
  corps: (string | number | boolean | null | undefined)[][];
  analyse?: {
    statistiques?: Record<string, any>;
    correlations?: { colonneA: string; colonneB: string; coefficient: number; interpretation?: string }[];
    lignesInitiales?: number;
    colonnesInitiales?: number;
    doublonsPures?: number;
    tauxRemplissage?: number;
  } | null;
  rapport?: BlocRapportExport[];
  graphiquesEpingles?: GraphiqueExport[];
  elementsSelectionnes?: ElementPptxExport[];
  syntheseCorrelationsIA?: string;
  tdcManuel?: {
    entetes: string[];
    lignes: (string | number)[][];
    titre?: string;
    sousTitre?: string;
  };
}

// Charte Cobalt Executive (Norme Rapport de Direction)
const COULEURS = {
  fondSombre: "0F172A",       // Slate 900
  fondCartouche: "1E293B",    // Slate 800
  fondClair: "F8FAFC",        // Slate 50
  fondCarte: "FFFFFF",        // Blanc pur
  fondSubtil: "F1F5F9",       // Slate 100
  textePrincipal: "0F172A",   // Slate 900
  texteSecondaire: "475569",  // Slate 600
  texteDiscret: "64748B",     // Slate 500
  texteBlanc: "FFFFFF",
  bleuCobalt: "1D4ED8",       // Cobalt Institutionnel
  bleuAccent: "2563EB",       // Cobalt lumineux
  bleuLeger: "EFF6FF",        // Tint bleu clair
  cyan: "0284C7",             // Cyan profond
  vert: "059669",             // Émeraude corporate
  vertLeger: "ECFDF5",
  ambre: "D97706",            // Ambre corporate
  ambreLeger: "FFFBEB",
  rose: "DC2626",             // Rouge alerte
  roseLeger: "FEF2F2",
  bordure: "E2E8F0",          // Ligne séparatrice
  bordureForte: "CBD5E1",
};

const PALETTE_CHARTS = [
  COULEURS.bleuCobalt,
  COULEURS.cyan,
  "4F46E5",
  COULEURS.ambre,
  COULEURS.vert,
  "DB2777",
  COULEURS.fondCartouche,
  "0D9488",
];

function parserNombreLocal(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  return parseNombre(val);
}

/** Nettoie en profondeur les noms de variables, fichiers et colonnes */
export function nettoyerNomMetier(nom?: string): string {
  if (!nom) return "";
  let s = String(nom).trim();

  // Supprimer les extensions de fichiers et préfixes techniques
  s = s.replace(/\.(xlsx|xls|csv|json)/gi, "");
  s = s.replace(/^(datenza\s*audit|datenza_audit)[\s_]*/gi, "");
  s = s.replace(/RGPH\d{4}_region_/gi, "").replace(/rgph\d{4}_/gi, "");
  
  if (/^comparatif\s*\(/i.test(s)) {
    s = s.replace(/^comparatif\s*\(/i, "").replace(/\)\s*$/, "");
  }

  s = s.replace(/_sous_prefectures/gi, " (Sous-préf.)");
  s = s.replace(/_/g, " ");

  // Décoller les mots attachés (CamelCase ou PascalCase)
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Dictionnaire de correspondances soignées
  const mapping: Record<string, string> = {
    "taillemoyennemenage": "Taille moyenne du ménage",
    "taille moyenne menage": "Taille moyenne du ménage",
    "rapportmasculinite": "Rapport de masculinité",
    "rapport masculinite": "Rapport de masculinité",
    "populationtotale": "Population totale",
    "population totale": "Population totale",
    "sousprefecture": "Sous-préfecture",
    "sous prefecture": "Sous-préfecture",
    "departement": "Département",
    "fichier source": "Fichier source",
    "fichiersource": "Fichier source",
    "poro": "Région du Poro",
    "gbeke": "Région de Gbêkê",
    "gbeke (sous-préf.)": "Région de Gbêkê (Sous-préf.)",
    "poro (sous-préf.)": "Région du Poro (Sous-préf.)",
  };

  const cle = s.toLowerCase().replace(/\s+/g, " ").trim();
  if (mapping[cle]) return mapping[cle];

  return s.charAt(0).toUpperCase() + s.slice(1).trim();
}

/** Nettoie tout résidu de syntaxe Markdown ou format brut pour document institutionnel */
function nettoyerTexteProfessionnel(texte?: string): string {
  if (!texte) return "";
  let t = texte
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_{1,2}(.*?)_{1,2}/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/✨|🤖|💡|🎯|🔥|⚠/g, "")
    .replace(/\.xlsx|\.csv/gi, "")
    .replace(/RGPH2021region([a-zA-Z]+)sousprefectures/gi, "$1")
    .replace(/Taillemoyennemenage/gi, "Taille moyenne du ménage")
    .replace(/Rapport_masculinite/gi, "Rapport de masculinité")
    .replace(/Population_totale/gi, "Population totale")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return t;
}

/** Ajoute un en-tête de diapositive normé et rigoureux */
function ajouterEnteteSlide(slide: any, surtitre: string, titre: string, pptx: pptxgen) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: COULEURS.bleuCobalt }, line: { color: COULEURS.bleuCobalt },
  });

  slide.addText(surtitre.toUpperCase(), {
    x: 0.8, y: 0.42, w: 11.5, h: 0.22, fontFace: "Calibri", fontSize: 9, bold: true, color: COULEURS.bleuCobalt, charSpacing: 1.5,
  });

  slide.addText(titre, {
    x: 0.8, y: 0.68, w: 11.5, h: 0.45, fontFace: "Calibri", fontSize: 19, bold: true, color: COULEURS.textePrincipal,
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0.8, y: 1.22, w: 11.73, h: 0, line: { color: COULEURS.bordure, width: 1 },
  });
}

/** MOTEUR D'AUTO-AJUSTEMENT DU TABLEAU CROISÉ DYNAMIQUE (TDC) */
function genererTdcAutoAjuste(entetes: string[], corps: any[][]) {
  const metaColonnes = entetes
    .map((nom, idx) => {
      const nomBas = nom.toLowerCase();
      if (nomBas === "fichier source" || /id|code|dossier|numero|numéro|index/i.test(nomBas)) {
        return null;
      }
      const vals = corps
        .map((l) => l[idx])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "" && String(v) !== "nan");
      const nums = vals.map(parserNombreLocal).filter((n): n is number => n !== null);
      const estNum = vals.length > 0 && nums.length / vals.length >= 0.75;
      const estTemps = /mois|date|periode|période|annee|année/i.test(nomBas);
      const distincts = Array.from(new Set(vals.map((v) => String(v).trim())));

      return { idx, nom, estNum, estTemps, nbDistincts: distincts.length, distincts };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const colonnesNum = metaColonnes.filter((c) => c.estNum);
  const colonnesCat = metaColonnes.filter((c) => !c.estNum && !c.estTemps);
  const colonnesTemps = metaColonnes.filter((c) => c.estTemps);

  const scorerMetrique = (c: typeof colonnesNum[0]) => {
    const n = c.nom.toLowerCase();
    if (/population|habitant|total/i.test(n)) return 12;
    if (/homme|femme/i.test(n)) return 11;
    if (/chiffre|ca|vente/i.test(n)) return 10;
    if (/quantit|volume/i.test(n)) return 9;
    if (/superficie|surface|montant/i.test(n)) return 8;
    return 5;
  };
  const metrique = [...colonnesNum].sort((a, b) => scorerMetrique(b) - scorerMetrique(a))[0] || null;

  const scorerLigne = (c: typeof colonnesCat[0]) => {
    const n = c.nom.toLowerCase();
    if (/departement|sous_prefecture/i.test(n)) return 15;
    if (/region|région/i.test(n)) return 12;
    if (/cat|activit/i.test(n)) return 10;
    return 5;
  };
  const catPourLigne = colonnesCat.filter((c) => c.nbDistincts >= 2 && c.nbDistincts <= 12);
  const dimLigne = [...catPourLigne].sort((a, b) => scorerLigne(b) - scorerLigne(a))[0] || colonnesCat.find((c) => c.nbDistincts >= 2) || colonnesCat[0] || null;

  let dimCol = colonnesTemps.find((c) => c.nbDistincts >= 2 && c.nbDistincts <= 8) || null;
  if (!dimCol) {
    dimCol = colonnesCat.find((c) => c.nom !== dimLigne?.nom && c.nbDistincts >= 2 && c.nbDistincts <= 6) || null;
  }

  if (!dimLigne || !dimCol) return null;

  const entetesColonnes = dimCol.distincts.slice(0, 8).sort();
  const entetesLignes = dimLigne.distincts.slice(0, 10).sort();

  const matrice: Record<string, Record<string, number>> = {};
  entetesLignes.forEach((l) => {
    matrice[l] = {};
    entetesColonnes.forEach((c) => (matrice[l][c] = 0));
  });

  corps.forEach((ligne) => {
    const valL = String(ligne[dimLigne.idx] ?? "").trim();
    const valC = String(ligne[dimCol.idx] ?? "").trim();
    const valM = metrique ? parserNombreLocal(ligne[metrique.idx]) ?? 0 : 1;
    if (matrice[valL] && matrice[valL][valC] !== undefined) {
      matrice[valL][valC] += valM;
    }
  });

  const totauxColonnes = new Array(entetesColonnes.length).fill(0);
  let totalGeneral = 0;

  const tableauLignes: (string | number)[][] = [];

  entetesLignes.forEach((l) => {
    let sommeLigne = 0;
    const rowValues: (string | number)[] = [nettoyerNomMetier(l)];

    entetesColonnes.forEach((c, idxC) => {
      const val = matrice[l][c];
      sommeLigne += val;
      totauxColonnes[idxC] += val;
      rowValues.push(Math.round(val));
    });

    totalGeneral += sommeLigne;
    rowValues.push(Math.round(sommeLigne));
    tableauLignes.push(rowValues);
  });

  const ligneTotaux: (string | number)[] = [
    "Total Général",
    ...totauxColonnes.map((v) => Math.round(v)),
    Math.round(totalGeneral),
  ];
  tableauLignes.push(ligneTotaux);

  const entetesFinales = [
    `${nettoyerNomMetier(dimLigne.nom)} \\ ${nettoyerNomMetier(dimCol.nom)}`,
    ...entetesColonnes.map(nettoyerNomMetier),
    "Total Général",
  ];

  const totalColonnesNb = entetesFinales.length;
  const col0Width = Math.min(Math.max(dimLigne.nom.length * 0.18, 2.5), 3.4);
  const remainingWidth = 11.6 - col0Width;
  const dataColWidth = Math.min(remainingWidth / (totalColonnesNb - 1), 1.8);
  const tableWidthTotal = col0Width + dataColWidth * (totalColonnesNb - 1);
  const colWidths = [col0Width, ...new Array(totalColonnesNb - 1).fill(dataColWidth)];

  return {
    titre: "TABLEAU CROISÉ DYNAMIQUE DE SYNTHÈSE",
    sousTitre: `Croisement décisionnel : ${nettoyerNomMetier(dimLigne.nom)} × ${nettoyerNomMetier(dimCol.nom)} (${metrique ? "Mesure : " + nettoyerNomMetier(metrique.nom) : "Comptage"})`,
    entetes: entetesFinales,
    lignes: tableauLignes,
    colWidths,
    tableWidthTotal,
    posX: Math.max((13.33 - tableWidthTotal) / 2, 0.8),
  };
}

// Moteur de graphiques de repli avec sélection intelligente de la diversité catégorielle
function autoGenererGraphiques(donnees: DonneesExportPptx): GraphiqueExport[] {
  const { entetes, corps } = donnees;
  const graphiques: GraphiqueExport[] = [];
  if (!entetes.length || !corps.length) return graphiques;

  const colonnesNum: string[] = [];
  const colonnesCat: { nom: string; nbDistincts: number }[] = [];
  let colTemps: string | null = null;

  entetes.forEach((col, idx) => {
    if (col === "Fichier Source" || /id|code|dossier/i.test(col)) return;
    const nomBas = col.toLowerCase();
    const estTemps = /mois|date|periode|période/i.test(nomBas);
    const valeurs = corps.map((l) => l[idx]).filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
    const nums = valeurs.map(parserNombreLocal).filter((n): n is number => n !== null);

    if (estTemps && !colTemps) {
      colTemps = col;
    } else if (valeurs.length > 0 && nums.length / valeurs.length >= 0.8) {
      colonnesNum.push(col);
    } else {
      const distincts = new Set(valeurs.map((v) => String(v).trim()));
      colonnesCat.push({ nom: col, nbDistincts: distincts.size });
    }
  });

  // Prioriser les métriques d'envergure
  colonnesNum.sort((a, b) => {
    const score = (nom: string) => {
      const n = nom.toLowerCase();
      if (/population|habitant|total/i.test(n)) return 10;
      if (/chiffre|ca|vente|montant|volume/i.test(n)) return 9;
      if (/homme|femme/i.test(n)) return 8;
      return 5;
    };
    return score(b) - score(a);
  });

  // 1. Évolution chronologique si dimension temporelle
  if (colTemps && colonnesNum.length > 0) {
    const idxTemps = entetes.indexOf(colTemps);
    const colMesure = colonnesNum[0];
    const idxMesure = entetes.indexOf(colMesure);

    const mapTemps: Record<string, number[]> = {};
    corps.forEach((ligne) => {
      const cle = String(ligne[idxTemps] ?? "").slice(0, 10).trim();
      const num = parserNombreLocal(ligne[idxMesure]);
      if (cle && num !== null) {
        if (!mapTemps[cle]) mapTemps[cle] = [];
        mapTemps[cle].push(num);
      }
    });

    const labelsTries = Object.keys(mapTemps).sort().slice(0, 10);
    const valeurs = labelsTries.map((k) => {
      const arr = mapTemps[k];
      return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    });

    if (labelsTries.length >= 2) {
      graphiques.push({
        id: 1,
        titre: `Évolution : ${nettoyerNomMetier(colMesure)} par ${nettoyerNomMetier(colTemps)}`,
        type: "line",
        labels: labelsTries,
        datasets: [{ label: `${nettoyerNomMetier(colMesure)} (Moyenne)`, data: valeurs }],
      });
    }
  }

  // 2. Barres catégorielles avec exclusion formelle des colonnes à modalité unique
  if (colonnesCat.length > 0 && colonnesNum.length > 0) {
    // Sélectionne en priorité une colonne ayant du relief (2 à 15 valeurs distinctes, ex: Département)
    const meilleureCat =
      colonnesCat.find((c) => c.nbDistincts >= 2 && c.nbDistincts <= 15) ||
      colonnesCat.find((c) => c.nbDistincts >= 2) ||
      colonnesCat[0];

    const colSeg = meilleureCat.nom;
    const colMesure = colonnesNum[0];
    const idxSeg = entetes.indexOf(colSeg);
    const idxMesure = entetes.indexOf(colMesure);

    const agregat: Record<string, number> = {};
    corps.forEach((ligne) => {
      const cat = String(ligne[idxSeg] ?? "Autre").trim();
      const val = parserNombreLocal(ligne[idxMesure]);
      if (cat && val !== null) {
        agregat[cat] = (agregat[cat] || 0) + val;
      }
    });

    const classes = Object.entries(agregat).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (classes.length > 0) {
      graphiques.push({
        id: graphiques.length + 1,
        titre: `Volumes consolidés : ${nettoyerNomMetier(colMesure)} par ${nettoyerNomMetier(colSeg)}`,
        type: "bar",
        labels: classes.map((c) => nettoyerNomMetier(c[0])),
        datasets: [{ label: nettoyerNomMetier(colMesure), data: classes.map((c) => Math.round(c[1])) }],
      });
    }

    // Deuxième graphique de comparaison si une autre métrique existe (ex: Femmes ou Hommes)
    if (colonnesNum.length > 1) {
      const colMesure2 = colonnesNum[1];
      const idxMesure2 = entetes.indexOf(colMesure2);
      const agregat2: Record<string, number> = {};

      corps.forEach((ligne) => {
        const cat = String(ligne[idxSeg] ?? "Autre").trim();
        const val = parserNombreLocal(ligne[idxMesure2]);
        if (cat && val !== null) {
          agregat2[cat] = (agregat2[cat] || 0) + val;
        }
      });

      const classes2 = Object.entries(agregat2).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (classes2.length > 0) {
        graphiques.push({
          id: graphiques.length + 1,
          titre: `Volumes consolidés : ${nettoyerNomMetier(colMesure2)} par ${nettoyerNomMetier(colSeg)}`,
          type: "bar",
          labels: classes2.map((c) => nettoyerNomMetier(c[0])),
          datasets: [{ label: nettoyerNomMetier(colMesure2), data: classes2.map((c) => Math.round(c[1])) }],
        });
      }
    }
  }

  return graphiques;
}

export async function exporterRapportPowerPoint(donnees: DonneesExportPptx): Promise<void> {
  const pptx = new pptxgen();

  // Toute la mise en page est dessinée pour 13,33 × 7,5 pouces. Avec LAYOUT_16x9 (10 × 5,63 pouces),
  // un tiers de chaque diapositive débordait à droite et en bas.
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "DATENZA Executive";
  pptx.company = "DATENZA Business Intelligence";
  pptx.title = `Rapport Stratégique - ${nettoyerNomMetier(donnees.nomProjet) || "Audit"}`;

  const dateAujourdhui = new Date().toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ==========================================
  // SLIDE 1 : COUVERTURE EXECUTIVE
  // ==========================================
  const slideGarde = pptx.addSlide();
  slideGarde.background = { color: COULEURS.fondSombre };

  slideGarde.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: COULEURS.bleuCobalt }, line: { color: COULEURS.bleuCobalt },
  });

  slideGarde.addText("DATENZA · AUDIT & BUSINESS INTELLIGENCE", {
    x: 1.0, y: 1.5, w: 8.0, h: 0.35, fontFace: "Calibri", fontSize: 10.5, bold: true, color: COULEURS.cyan, charSpacing: 2,
  });

  slideGarde.addText("Rapport Décisionnel &\nAnalyse Stratégique", {
    x: 1.0, y: 2.0, w: 10.0, h: 1.8, fontFace: "Calibri", fontSize: 38, bold: true, color: COULEURS.texteBlanc, lineSpacingMultiple: 1.1,
  });

  const nomProjetPropre = nettoyerNomMetier(donnees.nomProjet || "Jeu de données consolidé");
  slideGarde.addText(`Périmètre audité : ${nomProjetPropre}`, {
    x: 1.0, y: 4.1, w: 9.5, h: 0.5, fontFace: "Calibri", fontSize: 15, color: "CBD5E1",
  });

  slideGarde.addShape(pptx.ShapeType.line, {
    x: 1.0, y: 4.8, w: 11.33, h: 0, line: { color: COULEURS.fondCartouche, width: 1 },
  });

  slideGarde.addText(`Édition du ${dateAujourdhui} | Confidentiel Direction`, {
    x: 1.0, y: 5.0, w: 6.0, h: 0.3, fontFace: "Calibri", fontSize: 11, color: COULEURS.texteDiscret,
  });

  slideGarde.addText("EXECUTIVE DELIVERABLE", {
    x: 9.33, y: 5.0, w: 3.0, h: 0.3, fontFace: "Calibri", fontSize: 10.5, bold: true, align: "right", color: COULEURS.cyan, charSpacing: 1.5,
  });

  // ==========================================
  // SLIDE 2 : VOLUMÉTRIE & QUALITÉ DES DONNÉES
  // ==========================================
  const slideKpis = pptx.addSlide();
  slideKpis.background = { color: COULEURS.fondClair };
  ajouterEnteteSlide(slideKpis, "VOLUMÉTRIE & QUALITÉ DES DONNÉES", "Cadrage du périmètre et intégrité du classeur", pptx);

  const totalLignes = donnees.corps.length;
  const totalColonnes = donnees.entetes.length;
  const doublons = donnees.analyse?.doublonsPures ?? 0;
  const completude = donnees.analyse?.tauxRemplissage ? `${donnees.analyse.tauxRemplissage} %` : "100 %";

  const cartesMetrics = [
    { titre: "LIGNES EXPLOITABLES", valeur: totalLignes.toLocaleString("fr-FR"), sub: "Enregistrements complets", color: COULEURS.bleuCobalt },
    { titre: "VARIABLES AUDITÉES", valeur: totalColonnes.toString(), sub: "Champs dimensionnels", color: COULEURS.cyan },
    { titre: "TAUX DE COMPLÉTUDE", valeur: completude, sub: "Données intègres", color: COULEURS.vert },
    { titre: "DOUBLONS PURGÉS", valeur: doublons.toString(), sub: doublons === 0 ? "Aucune redondance" : "Lignes doublons", color: doublons > 0 ? COULEURS.rose : COULEURS.texteDiscret },
  ];

  cartesMetrics.forEach((m, idx) => {
    const posX = 0.8 + idx * 2.95;
    slideKpis.addShape(pptx.ShapeType.roundRect, {
      x: posX, y: 1.45, w: 2.8, h: 1.65, rectRadius: 0.08, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
    });
    slideKpis.addText(m.titre, { x: posX + 0.2, y: 1.65, w: 2.4, h: 0.22, fontFace: "Calibri", fontSize: 8.5, bold: true, color: COULEURS.texteDiscret, charSpacing: 0.5 });
    slideKpis.addText(m.valeur, { x: posX + 0.2, y: 1.95, w: 2.4, h: 0.55, fontFace: "Calibri", fontSize: 26, bold: true, color: m.color });
    slideKpis.addText(m.sub, { x: posX + 0.2, y: 2.65, w: 2.4, h: 0.25, fontFace: "Calibri", fontSize: 9.5, color: COULEURS.texteSecondaire });
  });

  // Panneau bas : Répertoire des dimensions structurées
  slideKpis.addShape(pptx.ShapeType.roundRect, {
    x: 0.8, y: 3.35, w: 11.65, h: 3.5, rectRadius: 0.08, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
  });

  slideKpis.addShape(pptx.ShapeType.rect, {
    x: 0.8, y: 3.35, w: 11.65, h: 0.45, fill: { color: COULEURS.fondSubtil }, line: { color: COULEURS.bordure, width: 1 },
  });
  slideKpis.addText("RÉPERTOIRE QUALIFIÉ DES CHAMPS D'ANALYSE", {
    x: 1.1, y: 3.45, w: 11.0, h: 0.25, fontFace: "Calibri", fontSize: 9.5, bold: true, color: COULEURS.textePrincipal, charSpacing: 1,
  });

  const colonnesNettoyees = donnees.entetes
    .filter((col) => col.toLowerCase() !== "fichier source")
    .slice(0, 18)
    .map((col) => `• ${nettoyerNomMetier(col)}`)
    .join("        ");

  slideKpis.addText(colonnesNettoyees || "Variables disponibles intégrées.", {
    x: 1.1, y: 4.15, w: 11.0, h: 2.4, fontFace: "Calibri", fontSize: 11, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.5,
  });

  // ==========================================
  // SLIDE 3 : DIAGNOSTIC EXÉCUTIF
  // ==========================================
  if (donnees.rapport && donnees.rapport.length > 0) {
    const slideDiag = pptx.addSlide();
    slideDiag.background = { color: COULEURS.fondClair };
    ajouterEnteteSlide(slideDiag, "POINTS DE VIGILANCE & DIAGNOSTIC", "Synthèse managériale extraite des données", pptx);

    const libellesTypes: Record<string, { titre: string; couleur: string }> = {
      intro: { titre: "CADRAGE DU PÉRIMÈTRE", couleur: COULEURS.bleuCobalt },
      qualite: { titre: "INTÉGRITÉ & CONTRÔLE QUALITÉ", couleur: COULEURS.vert },
      mesure: { titre: "INDICATEUR CLÉ DE PERFORMANCE", couleur: COULEURS.cyan },
      numerique: { titre: "DISTRIBUTION CHIFFRÉE", couleur: COULEURS.bleuCobalt },
      categorie: { titre: "SEGMENTATION STRATÉGIQUE", couleur: COULEURS.ambre },
      anomalie: { titre: "POINT DE VIGILANCE CRITIQUE", couleur: COULEURS.rose },
    };

    donnees.rapport.slice(0, 4).forEach((bloc, idx) => {
      const posY = 1.45 + idx * 1.32;
      slideDiag.addShape(pptx.ShapeType.roundRect, {
        x: 0.8, y: posY, w: 11.65, h: 1.15, rectRadius: 0.08, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
      });

      const meta = libellesTypes[bloc.type.toLowerCase()] || { titre: "CONSTAT ANALYTIQUE", couleur: COULEURS.bleuCobalt };

      slideDiag.addShape(pptx.ShapeType.rect, {
        x: 0.8, y: posY, w: 0.1, h: 1.15, fill: { color: meta.couleur }, line: { color: meta.couleur },
      });
      slideDiag.addText(meta.titre, {
        x: 1.1, y: posY + 0.15, w: 6.0, h: 0.22, fontFace: "Calibri", fontSize: 8.5, bold: true, color: meta.couleur, charSpacing: 1,
      });
      slideDiag.addText(nettoyerTexteProfessionnel(bloc.texte), {
        x: 1.1, y: posY + 0.42, w: 11.1, h: 0.62, fontFace: "Calibri", fontSize: 10.5, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.25,
      });
    });
  }

  // ==========================================
  // SLIDE 4 : CORRÉLATIONS & MATRICE STRATÉGIQUE
  // ==========================================
  const correlations = (donnees.analyse?.correlations || [])
    .filter((c: any) => c.colonneA !== "Fichier Source" && c.colonneB !== "Fichier Source")
    .slice(0, 6);

  if (correlations.length > 0 || donnees.syntheseCorrelationsIA) {
    const slideCorr = pptx.addSlide();
    slideCorr.background = { color: COULEURS.fondClair };
    ajouterEnteteSlide(slideCorr, "ANALYSE D'INTERACTIONS & CORRÉLATIONS", "Liens de dépendance statistique et dynamique croisée", pptx);

    const lignesCorr = [
      [
        { text: "Variables Associées", options: { bold: true, fill: { color: COULEURS.fondSombre }, color: COULEURS.texteBlanc, fontSize: 10 } },
        { text: "Coefficient (r)", options: { bold: true, fill: { color: COULEURS.fondSombre }, color: COULEURS.texteBlanc, align: "center" as const, fontSize: 10 } },
        { text: "Interprétation Statistique", options: { bold: true, fill: { color: COULEURS.fondSombre }, color: COULEURS.texteBlanc, fontSize: 10 } },
      ],
      ...correlations.map((c: any, i: number) => {
        const estForte = Math.abs(c.coefficient) >= 0.7;
        const estInverse = c.coefficient <= -0.5;
        const colorR = estForte ? COULEURS.vert : estInverse ? COULEURS.rose : COULEURS.bleuCobalt;

        let interpretationText = c.interpretation;
        if (!interpretationText) {
          if (Math.abs(c.coefficient) < 0.2) interpretationText = "Indépendance quasi-totale";
          else if (estForte) interpretationText = "Forte relation directe";
          else if (estInverse) interpretationText = "Corrélation inverse marquée";
          else interpretationText = "Liaison modérée";
        }

        return [
          { text: `${nettoyerNomMetier(c.colonneA)} ↔ ${nettoyerNomMetier(c.colonneB)}`, options: { bold: true, fill: { color: i % 2 === 0 ? COULEURS.fondCarte : COULEURS.fondClair }, fontSize: 9.5 } },
          { text: `r = ${c.coefficient}`, options: { bold: true, align: "center" as const, fill: { color: i % 2 === 0 ? COULEURS.fondCarte : COULEURS.fondClair }, color: colorR, fontSize: 9.5 } },
          { text: interpretationText, options: { fill: { color: i % 2 === 0 ? COULEURS.fondCarte : COULEURS.fondClair }, fontSize: 9 } },
        ];
      }),
    ];

    slideCorr.addTable(lignesCorr as any, {
      x: 0.8, y: 1.45, w: 7.2, h: Math.min(correlations.length * 0.65 + 0.6, 5.2),
      fontSize: 9.5, fontFace: "Calibri", border: { pt: 0.75, color: COULEURS.bordure },
    });

    slideCorr.addShape(pptx.ShapeType.roundRect, {
      x: 8.3, y: 1.45, w: 4.15, h: 5.2, rectRadius: 0.08, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
    });

    slideCorr.addShape(pptx.ShapeType.rect, {
      x: 8.3, y: 1.45, w: 4.15, h: 0.45, fill: { color: COULEURS.fondCartouche }, line: { color: COULEURS.fondCartouche },
    });
    slideCorr.addText("GRILLE D'ARBITRAGE STATISTIQUE", {
      x: 8.55, y: 1.55, w: 3.65, h: 0.25, fontFace: "Calibri", fontSize: 9, bold: true, color: COULEURS.texteBlanc, charSpacing: 1,
    });

    if (donnees.syntheseCorrelationsIA) {
      slideCorr.addText(nettoyerTexteProfessionnel(donnees.syntheseCorrelationsIA), {
        x: 8.55, y: 2.1, w: 3.65, h: 4.3, fontFace: "Calibri", fontSize: 10, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.3,
      });
    } else {
      const relationForte = correlations.find((c: any) => c.coefficient >= 0.7);
      const relationInverse = correlations.find((c: any) => c.coefficient <= -0.5);
      const coefMax = Math.max(...correlations.map((c: any) => Math.abs(c.coefficient)), 0);

      let texteSynthese = "";

      if (coefMax < 0.40) {
        texteSynthese = [
          "• INDÉPENDANCE DES VARIABLES (r < 0.40) :",
          "Les variables analysées n'affichent pas de dépendance statistique directe significative sur ce périmètre.",
          "",
          "• CONSTAT MÉTIER :",
          "Les indicateurs étudiés évoluent selon des dynamiques territoriales ou structurelles distinctes sans effet de causalité immédiat.",
          "",
          "• RECOMMANDATION MANAGÉRIALE :",
          "Piloter chaque indicateur de façon autonome sans anticiper d'impact automatique de l'un sur l'autre.",
        ].join("\n");
      } else {
        texteSynthese = "• LECTURE DES SYNERGIES :\nLes coefficients élevés (r ≥ 0.70) traduisent des effets d'entraînement réels : agir sur l'une des variables influence directement la seconde.\n\n";
        if (relationForte) {
          texteSynthese += `• LEVIER MAJEUR :\nLa relation « ${nettoyerNomMetier(relationForte.colonneA)} ↔ ${nettoyerNomMetier(relationForte.colonneB)} » (r = ${relationForte.coefficient}) s'impose comme l'axe d'interaction le plus robuste.\n\n`;
        }
        if (relationInverse) {
          texteSynthese += `• ARBITRAGE NÉCESSAIRE :\nLa relation « ${nettoyerNomMetier(relationInverse.colonneA)} ↔ ${nettoyerNomMetier(relationInverse.colonneB)} » (r = ${relationInverse.coefficient}) indique un antagonisme à surveiller.\n\n`;
        }
        texteSynthese += "• RECOMMANDATION :\nCalibrer les plans d'action sur les leviers à forte corrélation positive.";
      }

      slideCorr.addText(texteSynthese, {
        x: 8.55, y: 2.1, w: 3.65, h: 4.3, fontFace: "Calibri", fontSize: 10, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.25,
      });
    }
  }

  // ==========================================
  // SLIDE 5 : TABLEAU CROISÉ DYNAMIQUE (TDC)
  // ==========================================
  const tdcData = donnees.tdcManuel || genererTdcAutoAjuste(donnees.entetes, donnees.corps);

  if (tdcData && tdcData.lignes.length > 0) {
    const slideTdc = pptx.addSlide();
    slideTdc.background = { color: COULEURS.fondClair };

    ajouterEnteteSlide(
      slideTdc,
      tdcData.titre || "TABLEAU CROISÉ DYNAMIQUE",
      tdcData.sousTitre || "Croisement décisionnel",
      pptx
    );

    const rowsFormatted = [
      tdcData.entetes.map((h, cIdx) => ({
        text: nettoyerNomMetier(h),
        options: {
          fill: { color: COULEURS.fondSombre },
          color: COULEURS.texteBlanc,
          bold: true,
          align: cIdx === 0 ? "left" : "center",
          fontSize: 10,
        },
      })),
      ...tdcData.lignes.map((row, rIdx) => {
        const estDerniereLigne = rIdx === tdcData.lignes.length - 1;

        return row.map((val, cIdx) => {
          const estPremiereColonne = cIdx === 0;
          const estDerniereColonne = cIdx === row.length - 1;
          const estTotal = estDerniereLigne || estDerniereColonne;

          return {
            text: typeof val === "number" ? val.toLocaleString("fr-FR") : String(val ?? "—"),
            options: {
              fill: { color: estTotal ? COULEURS.bleuLeger : rIdx % 2 === 0 ? "FFFFFF" : "F8FAFC" },
              color: estTotal ? COULEURS.bleuCobalt : estPremiereColonne ? COULEURS.textePrincipal : "334155",
              bold: estPremiereColonne || estTotal,
              align: estPremiereColonne ? "left" : "right",
              fontSize: 9.5,
            },
          };
        });
      }),
    ];

    slideTdc.addTable(rowsFormatted as any, {
      x: (tdcData as any).posX ?? 0.8,
      y: 1.55,
      w: (tdcData as any).tableWidthTotal ?? 11.65,
      colW: (tdcData as any).colWidths,
      border: { type: "solid", color: COULEURS.bordure, pt: 0.75 },
      autoPage: false,
    });
  }

  // ==========================================
  // SLIDES 6+ : ANALYSES VISUELLES & FICHES STRATÉGIQUES
  // ==========================================
  let listeGraphiques: any[] = [
    ...(donnees.elementsSelectionnes || []),
    ...(donnees.graphiquesEpingles || []),
  ];
  if (listeGraphiques.length === 0) {
    listeGraphiques = autoGenererGraphiques(donnees);
  }

  // Une diapositive n'a de sens que s'il y a quelque chose à montrer (une carte épinglée sans image n'a pas de données)
  listeGraphiques = listeGraphiques.filter(
    (g) => g?.image || g?.donneesTableau?.entetes?.length || g?.nuage?.series?.length || ((g?.labels || []).length > 0 && (g?.datasets || []).length > 0)
  );

  if (listeGraphiques.length > 0) {
    listeGraphiques.forEach((graphique, idx) => {
      const slideGraph = pptx.addSlide();
      slideGraph.background = { color: COULEURS.fondClair };

      ajouterEnteteSlide(
        slideGraph,
        `ANALYSE VISUELLE ${idx + 1} / ${listeGraphiques.length}`,
        nettoyerNomMetier(graphique.titre || "Visualisation analytique"),
        pptx
      );

      // Tableau croisé ajouté depuis l'écran TDC : rendu en vrai tableau (il n'était pas dessiné jusqu'ici)
      if (!graphique.image && graphique.donneesTableau?.entetes?.length) {
        const t = graphique.donneesTableau as { entetes: string[]; lignes: (string | number)[][] };
        const MAX_COLS = 9;
        const MAX_LIGNES = 14;
        const nbCols = t.entetes.length;
        // On garde toujours la première colonne (libellés) et la dernière (total)
        const cols = nbCols > MAX_COLS ? [...Array.from({ length: MAX_COLS - 1 }, (_, i) => i), nbCols - 1] : t.entetes.map((_, i) => i);
        const lignesT = t.lignes.length > MAX_LIGNES ? [...t.lignes.slice(0, MAX_LIGNES - 1), t.lignes[t.lignes.length - 1]] : t.lignes;
        const texteCellule = (v: string | number | undefined) =>
          typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : nettoyerNomMetier(String(v ?? ""));
        const rows = [
          cols.map((j) => ({
            text: nettoyerNomMetier(String(t.entetes[j] ?? "")),
            options: { bold: true, color: COULEURS.texteBlanc, fill: { color: COULEURS.fondSombre }, align: "center", fontSize: 9.5, fontFace: "Calibri" },
          })),
          ...lignesT.map((l, i) =>
            cols.map((j, k) => ({
              text: texteCellule(l[j]),
              options: {
                bold: k === 0 || i === lignesT.length - 1,
                color: COULEURS.textePrincipal,
                fill: { color: i % 2 ? COULEURS.fondSubtil : COULEURS.texteBlanc },
                align: k === 0 ? "left" : "right",
                fontSize: 9.5,
                fontFace: "Calibri",
              },
            }))
          ),
        ];
        slideGraph.addTable(rows as any, {
          x: 0.8,
          y: 1.55,
          w: 11.73,
          border: { type: "solid", color: COULEURS.bordure, pt: 0.75 },
          autoPage: false,
        });
        const notes = [graphique.sousTitre ? nettoyerNomMetier(graphique.sousTitre) : ""];
        if (nbCols > MAX_COLS || t.lignes.length > MAX_LIGNES) {
          notes.push(`Extrait : ${Math.min(t.lignes.length, MAX_LIGNES)} lignes sur ${t.lignes.length}, ${cols.length} colonnes sur ${nbCols}.`);
        }
        slideGraph.addText(notes.filter(Boolean).join("  —  "), {
          x: 0.8, y: 6.95, w: 11.73, h: 0.3, fontFace: "Calibri", fontSize: 9, color: COULEURS.texteDiscret,
        });
        return;
      }

      const typeStr = String(graphique.chartType || graphique.type || "").toLowerCase();
      const estAire = typeStr.includes("aire") || typeStr === "area";
      const estLigne = typeStr.includes("courbe") || typeStr === "line" || estAire;
      const estCirculaire = typeStr.includes("camembert") || typeStr === "pie" || typeStr.includes("anneau") || typeStr === "doughnut";
      const multiSeries = (graphique.datasets || []).length > 1;
      const estNuage = typeStr === "nuage" && !!graphique.nuage;
      const estCombine = typeStr === "combine" && (graphique.datasets || []).length === 2;
      const estHistogramme = typeStr === "histogramme";

      const tousLabels: string[] = (graphique.labels || []).map((l: unknown) => nettoyerNomMetier(String(l ?? "")));
      // Une série dans le temps garde ses périodes les plus récentes ; un classement garde ses premiers
      const maxPoints = estLigne ? 36 : estCirculaire ? 8 : estHistogramme || estCombine ? 24 : 15;
      const debut = estLigne ? Math.max(0, tousLabels.length - maxPoints) : 0;
      const chartLabels = tousLabels.slice(debut, debut + maxPoints);
      // PowerPoint dessine les barres horizontales de bas en haut : on inverse l'ordre pour garder le premier en haut
      const inverser = Boolean(graphique.horizontal) && !estLigne && !estCirculaire;
      const ordonner = <T,>(liste: T[]) => (inverser ? [...liste].reverse() : liste);
      const etiquettes = ordonner(chartLabels);
      const chartData = (graphique.datasets || []).map((ds: any) => ({
        name: nettoyerNomMetier(ds.label || "Valeur"),
        labels: etiquettes,
        values: ordonner((ds.data || []).slice(debut, debut + maxPoints).map((v: any) => Number(v) || 0)),
      }));
      // Libellés longs sous des barres verticales : inclinés pour ne pas se chevaucher
      const libellesLongs = chartLabels.length > 5 && chartLabels.reduce((t, l) => t + l.length, 0) / chartLabels.length > 9;

      // Valeurs complètes (non tronquées) pour les indicateurs : total par libellé si plusieurs séries s'additionnent
      const nonAdditif = /(moyenne|m[ée]diane|minimum|maximum|average|median)/i.test(
        `${graphique.titre ?? ""} ${graphique.datasets?.[0]?.label ?? ""}`
      );
      const nombreOuNull = (v: unknown): number | null =>
        v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
      const serieIndicateurs: { nom: string; v: number }[] = tousLabels
        .map((nom, i) => {
          const vals = (graphique.datasets || []).map((ds: any) => nombreOuNull(ds.data?.[i]));
          const v = multiSeries && !nonAdditif
            ? (vals.some((x: number | null) => x !== null) ? vals.reduce((a: number, x: number | null) => a + (x ?? 0), 0) : null)
            : vals[0] ?? null;
          return { nom, v };
        })
        .filter((x): x is { nom: string; v: number } => x.v !== null);
      const estTemporel = estLigne || (tousLabels.length >= 2 && trierChronologiquement(tousLabels, (x) => x) !== null);

      // 1. Zone visuelle à gauche (7.7 pouces)
      if (graphique.image) {
        slideGraph.addImage({
          data: graphique.image,
          x: 0.8,
          y: 1.45,
          w: 7.7,
          h: 5.3,
          sizing: { type: "contain", w: 7.7, h: 5.3 },
        });
      } else if (estNuage) {
        // Nuage de points : un échantillon régulier de 400 points au plus, pour un fichier PowerPoint léger
        const tous = graphique.nuage.series.flatMap((s: any) => s.points) as { x: number; y: number }[];
        const pasNuage = Math.max(1, Math.ceil(tous.length / 400));
        const pts = tous.filter((_, i) => i % pasNuage === 0);
        slideGraph.addChart(
          pptx.ChartType.scatter,
          [
            { name: nettoyerNomMetier(graphique.axes?.x || "X"), values: pts.map((pt) => pt.x) },
            { name: nettoyerNomMetier(graphique.axes?.y || "Y"), values: pts.map((pt) => pt.y) },
          ],
          {
            x: 0.8, y: 1.45, w: 7.7, h: 5.3,
            showLegend: false,
            showTitle: false,
            chartColors: [PALETTE_CHARTS[0]],
            lineSize: 0,
            lineDataSymbolSize: 5,
            showCatAxisTitle: true,
            catAxisTitle: nettoyerNomMetier(graphique.axes?.x || "X"),
            catAxisTitleFontSize: 10,
            showValAxisTitle: true,
            valAxisTitle: nettoyerNomMetier(graphique.axes?.y || "Y"),
            valAxisTitleFontSize: 10,
            catAxisLabelFontSize: 10,
            valAxisLabelFontSize: 10,
          } as any
        );
      } else if (estCombine && chartLabels.length > 0) {
        // Barres + courbe ; la courbe prend l'axe de droite quand elle a sa propre échelle à l'écran
        const deuxAxes = graphique.datasets[1]?.yAxisID === "y1";
        slideGraph.addChart(
          [
            { type: pptx.ChartType.bar, data: [chartData[0]], options: { chartColors: [PALETTE_CHARTS[0]], barDir: "col" } },
            {
              type: pptx.ChartType.line,
              data: [chartData[1]],
              options: { chartColors: ["D97706"], lineSize: 2.5, lineDataSymbolSize: 6, ...(deuxAxes ? { secondaryValAxis: true, secondaryCatAxis: true } : {}) },
            },
          ] as any,
          {
            x: 0.8, y: 1.45, w: 7.7, h: 5.3,
            showLegend: true,
            legendPos: "b",
            legendFontSize: 10,
            showTitle: false,
            catAxisLabelFontSize: chartLabels.length > 15 ? 8 : 10,
            valAxisLabelFontSize: 10,
            ...(libellesLongs || chartLabels.length > 12 ? { catAxisLabelRotate: 45 } : {}),
            ...(deuxAxes
              ? {
                  valAxes: [
                    { showValAxisTitle: true, valAxisTitle: chartData[0].name, valAxisTitleFontSize: 9, valAxisLabelFontSize: 10 },
                    { showValAxisTitle: true, valAxisTitle: chartData[1].name, valAxisTitleFontSize: 9, valAxisLabelFontSize: 10, valGridLine: { style: "none" } },
                  ],
                  catAxes: [{ catAxisLabelFontSize: chartLabels.length > 15 ? 8 : 10 }, { catAxisHidden: true }],
                }
              : {}),
          } as any
        );
      } else if (chartData.length > 0 && chartLabels.length > 0) {
        let typePptx = pptx.ChartType.bar;
        if (estLigne) typePptx = estAire ? pptx.ChartType.area : pptx.ChartType.line;
        if (typeStr.includes("camembert") || typeStr === "pie") typePptx = pptx.ChartType.pie;
        if (typeStr.includes("anneau") || typeStr === "doughnut") typePptx = pptx.ChartType.doughnut;

        const toutesValeurs = chartData.flatMap((d: { values: number[] }) => d.values);
        const maxAbs = toutesValeurs.reduce((m: number, v: number) => Math.max(m, Math.abs(v)), 0);
        const aDecimales = toutesValeurs.some((v: number) => !Number.isInteger(v));
        const nbEtiquettes = chartLabels.length * chartData.length;

        slideGraph.addChart(typePptx, chartData, {
          x: 0.8,
          y: 1.45,
          w: 7.7,
          h: 5.3,
          showLegend: multiSeries || estCirculaire,
          legendPos: "b",
          showTitle: false,
          chartColors: PALETTE_CHARTS,
          // Étiquettes seulement si elles restent lisibles ; les décimales sont gardées pour les petites valeurs
          showValue: !estCirculaire && nbEtiquettes <= 15,
          showPercent: estCirculaire,
          dataLabelFormatCode: estCirculaire ? "0.0%" : aDecimales && maxAbs < 1000 ? "#,##0.0#" : "#,##0",
          valAxisLabelFormatCode: aDecimales && maxAbs < 10 ? "#,##0.0#" : "#,##0",
          catAxisLabelFontSize: chartLabels.length > 15 ? 8 : 10,
          valAxisLabelFontSize: 10,
          legendFontSize: 10,
          dataLabelFontSize: 9,
          ...(typePptx === pptx.ChartType.bar && !graphique.horizontal && libellesLongs ? { catAxisLabelRotate: 45 } : {}),
          ...(estLigne && chartLabels.length > 12 ? { catAxisLabelRotate: 45, lineDataSymbolSize: 4 } : {}),
          ...(typePptx === pptx.ChartType.bar
            ? {
                barDir: graphique.horizontal ? "bar" : "col",
                barGrouping: graphique.empile && multiSeries ? "stacked" : "clustered",
              }
            : {}),
          // Histogramme : barres presque jointives et axes nommés
          ...(estHistogramme
            ? {
                barGapWidthPct: 8,
                showCatAxisTitle: true,
                catAxisTitle: nettoyerNomMetier(graphique.axes?.x || ""),
                catAxisTitleFontSize: 10,
                showValAxisTitle: true,
                valAxisTitle: "Nombre de lignes",
                valAxisTitleFontSize: 10,
                catAxisLabelRotate: chartLabels.length > 8 ? 45 : 0,
              }
            : {}),
        } as any);
      }

      // 2. Fiche Décisionnelle à droite (3.78 pouces de large)
      const cardX = 8.75;
      const cardW = 3.78;
      const cardY = 1.45;
      const cardH = 5.3;

      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: cardX, y: cardY, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
      });

      slideGraph.addShape(pptx.ShapeType.rect, {
        x: cardX, y: cardY, w: cardW, h: 0.52, fill: { color: COULEURS.fondSombre }, line: { color: COULEURS.fondSombre },
      });
      slideGraph.addText("SYNTHÈSE MANAGÉRIALE", {
        x: cardX + 0.2, y: cardY + 0.14, w: cardW - 0.4, h: 0.25, fontFace: "Calibri", fontSize: 10, bold: true, color: COULEURS.texteBlanc, charSpacing: 1.2,
      });

      // Calcul des indicateurs (sur toutes les valeurs, pas seulement celles affichées)
      const datasetPremier = serieIndicateurs.map((x) => x.v);
      const totalVolume = datasetPremier.reduce((a: number, b: number) => a + b, 0);
      const moyenneVolume = datasetPremier.length > 0 ? Math.round((totalVolume / datasetPremier.length) * 10) / 10 : 0;
      const maxVolume = datasetPremier.length > 0 ? Math.max(...datasetPremier) : 0;
      const minVolume = datasetPremier.length > 0 ? Math.min(...datasetPremier) : 0;
      const nomLeader = serieIndicateurs[datasetPremier.indexOf(maxVolume)]?.nom || "—";
      const nomMin = serieIndicateurs[datasetPremier.indexOf(minVolume)]?.nom || "—";
      // Une part du total n'a de sens que pour des valeurs positives qui s'additionnent
      const partsValides = !nonAdditif && minVolume >= 0 && totalVolume > 0;
      const partLeader = partsValides ? Math.round((maxVolume / totalVolume) * 100) : 0;
      const fr = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });

      // Indicateurs propres au graphique (nuage, histogramme, combiné), sinon premier rang et total
      const ind: { titre: string; valeur: string; detail: string }[] | null =
        Array.isArray(graphique.indicateurs) && graphique.indicateurs.length >= 2 ? graphique.indicateurs : null;

      // Micro-KPIs
      const kpiW = (cardW - 0.4 - 0.15) / 2;
      const kpi1X = cardX + 0.2;
      const kpi2X = kpi1X + kpiW + 0.15;

      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: kpi1X, y: cardY + 0.68, w: kpiW, h: 0.95, rectRadius: 0.06, fill: { color: COULEURS.fondSubtil }, line: { color: COULEURS.bordure, width: 1 },
      });
      slideGraph.addText(ind ? ind[0].titre : estTemporel ? "POINT HAUT" : "PREMIER RANG", {
        x: kpi1X + 0.1, y: cardY + 0.76, w: kpiW - 0.2, h: 0.18, fontFace: "Calibri", fontSize: 7.5, bold: true, color: COULEURS.texteDiscret, charSpacing: 0.5,
      });
      slideGraph.addText(ind ? ind[0].valeur : String(nomLeader), {
        x: kpi1X + 0.1, y: cardY + 0.94, w: kpiW - 0.2, h: 0.32, fontFace: "Calibri", fontSize: 11.5, bold: true, color: COULEURS.bleuCobalt,
      });
      slideGraph.addText(ind ? nettoyerNomMetier(ind[0].detail) : partsValides && !estTemporel ? `${fr(maxVolume)} (${partLeader} % du total)` : fr(maxVolume), {
        x: kpi1X + 0.1, y: cardY + 1.28, w: kpiW - 0.2, h: 0.25, fontFace: "Calibri", fontSize: 8.5, color: COULEURS.texteSecondaire,
      });

      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: kpi2X, y: cardY + 0.68, w: kpiW, h: 0.95, rectRadius: 0.06, fill: { color: COULEURS.fondSubtil }, line: { color: COULEURS.bordure, width: 1 },
      });
      slideGraph.addText(ind ? ind[1].titre : nonAdditif ? "NIVEAU MOYEN" : "TOTAL", {
        x: kpi2X + 0.1, y: cardY + 0.76, w: kpiW - 0.2, h: 0.18, fontFace: "Calibri", fontSize: 7.5, bold: true, color: COULEURS.texteDiscret, charSpacing: 0.5,
      });
      slideGraph.addText(ind ? ind[1].valeur : fr(nonAdditif ? moyenneVolume : totalVolume), {
        x: kpi2X + 0.1, y: cardY + 0.94, w: kpiW - 0.2, h: 0.32, fontFace: "Calibri", fontSize: 11.5, bold: true, color: COULEURS.textePrincipal,
      });
      slideGraph.addText(ind ? nettoyerNomMetier(ind[1].detail) : nonAdditif ? `${datasetPremier.length} valeurs comparées` : `Moyenne : ${fr(moyenneVolume)}`, {
        x: kpi2X + 0.1, y: cardY + 1.28, w: kpiW - 0.2, h: 0.25, fontFace: "Calibri", fontSize: 8.5, color: COULEURS.texteSecondaire,
      });

      slideGraph.addShape(pptx.ShapeType.line, {
        x: cardX + 0.2, y: cardY + 1.78, w: cardW - 0.4, h: 0, line: { color: COULEURS.bordure, width: 1 },
      });

      // Synthèse textuelle managériale et adaptée
      const explicationEcran = graphique.image
        ? null
        : expliquerGraphique({ titre: graphique.titre, type: typeStr, labels: graphique.labels, datasets: graphique.datasets, constats: graphique.constats });
      let texteFinal = "";
      if (graphique.interpretation && graphique.interpretation.length > 50) {
        texteFinal = nettoyerTexteProfessionnel(graphique.interpretation);
      } else if (explicationEcran && explicationEcran.lignes.length) {
        // Même lecture que sous le graphique à l'écran
        texteFinal = explicationEcran.lignes.map((l) => `• ${l.titre.toUpperCase()} :\n${l.texte}`).join("\n\n");
      } else if (datasetPremier.length <= 1 || minVolume === maxVolume) {
        texteFinal = [
          `• PÉRIMÈTRE :\n${datasetPremier.length <= 1 ? `Une seule valeur est représentée (« ${nomLeader} », ${fr(maxVolume)}).` : `Toutes les valeurs sont identiques (${fr(maxVolume)}).`}`,
          `• LECTURE :\nAucun écart n'apparaît à ce niveau de détail.`,
          `• PISTE :\nVentiler selon une autre colonne ou un niveau plus fin pour faire apparaître des différences.`,
        ].join("\n\n");
      } else if (estTemporel) {
        // Série dans le temps : on décrit une évolution, pas un classement
        const premier = serieIndicateurs[0];
        const dernier = serieIndicateurs[serieIndicateurs.length - 1];
        const variation = premier.v !== 0 ? Math.round(((dernier.v - premier.v) / Math.abs(premier.v)) * 1000) / 10 : null;
        const sens = dernier.v > premier.v ? "progresse" : dernier.v < premier.v ? "recule" : "reste stable";
        texteFinal = [
          `• ÉVOLUTION :\nDe « ${premier.nom} » à « ${dernier.nom} », l'indicateur ${sens} de ${fr(premier.v)} à ${fr(dernier.v)}${variation !== null ? ` (${variation > 0 ? "+" : ""}${fr(variation)} %)` : ""}.`,
          `• POINTS HAUT ET BAS :\nMaximum en « ${nomLeader} » (${fr(maxVolume)}), minimum en « ${nomMin} » (${fr(minVolume)}).`,
          `• REPÈRE :\nMoyenne par période : ${fr(moyenneVolume)}. La dernière période se situe ${dernier.v >= moyenneVolume ? "au-dessus" : "en dessous"} de cette moyenne.`,
        ].join("\n\n");
      } else {
        const ecartMaxMin = Math.round((maxVolume - minVolume) * 10) / 10;
        const ratio = minVolume > 0 ? Math.round((maxVolume / minVolume) * 10) / 10 : null;
        const tries = [...datasetPremier].sort((a, b) => b - a);
        const partTop3 = partsValides && tries.length > 3 ? Math.round((tries.slice(0, 3).reduce((a, b) => a + b, 0) / totalVolume) * 100) : null;

        texteFinal = [
          `• CLASSEMENT :\n« ${nomLeader} » arrive en tête avec ${fr(maxVolume)}${partsValides ? ` (${partLeader} % du total)` : ""}.`,
          `• ÉCART :\nUn différentiel de ${fr(ecartMaxMin)}${ratio ? ` (facteur de ${fr(ratio)}×)` : ""} sépare le premier du dernier (« ${nomMin} », ${fr(minVolume)}).`,
          partTop3 !== null
            ? `• CONCENTRATION :\nLes trois premiers représentent ${partTop3} % du total sur ${datasetPremier.length} valeurs comparées.`
            : `• REPÈRE :\nValeur moyenne des ${datasetPremier.length} éléments comparés : ${fr(moyenneVolume)}.`,
        ].join("\n\n");
      }

      slideGraph.addText(texteFinal, {
        x: cardX + 0.2, y: cardY + 1.95, w: cardW - 0.4, h: 3.2, fontFace: "Calibri", fontSize: 9.5, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.25, valign: "top", fit: "shrink",
      });
    });
  }

  // ==========================================
  // SLIDE FINALE : SIGNATURE EXECUTIVE DATENZA
  // ==========================================
  const slideFin = pptx.addSlide();
  slideFin.background = { color: COULEURS.fondSombre };

  slideFin.addText("DATENZA", {
    x: 1.0, y: 2.2, w: 11.33, h: 0.8, fontFace: "Calibri", fontSize: 42, bold: true, color: COULEURS.texteBlanc, align: "center",
  });

  slideFin.addText("Plateforme d'Aide à la Décision & Business Intelligence", {
    x: 1.0, y: 3.1, w: 11.33, h: 0.4, fontFace: "Calibri", fontSize: 15, color: COULEURS.cyan, align: "center",
  });

  slideFin.addShape(pptx.ShapeType.line, {
    x: 4.5, y: 3.9, w: 4.33, h: 0, line: { color: COULEURS.fondCartouche, width: 1 },
  });

  slideFin.addText("Rapport stratégique confidentiel généré à des fins d'arbitrage de direction.", {
    x: 1.0, y: 4.2, w: 11.33, h: 0.4, fontFace: "Calibri", fontSize: 10.5, color: COULEURS.texteDiscret, align: "center",
  });

  const nomFichierNettoye = (donnees.nomProjet || "datenza_rapport").toLowerCase().replace(/[^a-z0-9]/gi, "_");
  await pptx.writeFile({ fileName: `${nomFichierNettoye}_executive.pptx` });
}
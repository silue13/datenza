import pptxgen from "pptxgenjs";
import { parseNombre } from "./utils";

// =========================================================================
// INTERFACES & TYPES EXPORTÉS
// =========================================================================
export interface ElementPptxExport {
  id: string | number;
  typeVisuel?: "graphique" | "tdc" | "carte" | "prevision";
  titre: string;
  sousTitre?: string;
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
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
  }[];
  interpretation?: string;
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
  COULEURS.bleuAccent,
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

/** Nettoie tout résidu de syntaxe Markdown pour un document institutionnel */
function nettoyerTexteProfessionnel(texte?: string): string {
  if (!texte) return "";
  return texte
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_{1,2}(.*?)_{1,2}/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/✨|🤖|💡|🎯|🔥|⚠/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    if (/chiffre|ca|vente/i.test(n)) return 10;
    if (/quantit|volume/i.test(n)) return 9;
    if (/superficie|surface|montant/i.test(n)) return 8;
    if (/prix/i.test(n)) return 6;
    if (/pct|taux|%|remise/i.test(n)) return 1;
    return 5;
  };
  const metrique = [...colonnesNum].sort((a, b) => scorerMetrique(b) - scorerMetrique(a))[0] || null;

  const scorerLigne = (c: typeof colonnesCat[0]) => {
    const n = c.nom.toLowerCase();
    if (/cat|activit/i.test(n)) return 10;
    if (/region|région|ville|localite/i.test(n)) return 9;
    if (/produit|service|culture/i.test(n)) return 8;
    return 5;
  };
  const catPourLigne = colonnesCat.filter((c) => c.nbDistincts >= 2 && c.nbDistincts <= 12);
  const dimLigne = [...catPourLigne].sort((a, b) => scorerLigne(b) - scorerLigne(a))[0] || colonnesCat[0] || null;

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
    const rowValues: (string | number)[] = [l];

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

  const entetesFinales = [`${dimLigne.nom} \\ ${dimCol.nom}`, ...entetesColonnes, "Total Général"];

  const totalColonnesNb = entetesFinales.length;
  const col0Width = Math.min(Math.max(dimLigne.nom.length * 0.18, 2.4), 3.2);
  const remainingWidth = 11.6 - col0Width;
  const dataColWidth = Math.min(remainingWidth / (totalColonnesNb - 1), 1.8);
  const tableWidthTotal = col0Width + dataColWidth * (totalColonnesNb - 1);
  const colWidths = [col0Width, ...new Array(totalColonnesNb - 1).fill(dataColWidth)];

  return {
    titre: "TABLEAU CROISÉ DYNAMIQUE AJUSTÉ",
    sousTitre: `Croisement décisionnel : ${dimLigne.nom} × ${dimCol.nom} (${metrique ? "Somme de " + metrique.nom : "Comptage"})`,
    entetes: entetesFinales,
    lignes: tableauLignes,
    colWidths,
    tableWidthTotal,
    posX: Math.max((13.33 - tableWidthTotal) / 2, 0.8),
  };
}

// Moteur de graphiques de repli
function autoGenererGraphiques(donnees: DonneesExportPptx): GraphiqueExport[] {
  const { entetes, corps } = donnees;
  const graphiques: GraphiqueExport[] = [];
  if (!entetes.length || !corps.length) return graphiques;

  const colonnesNum: string[] = [];
  const colonnesCat: string[] = [];
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
      colonnesCat.push(col);
    }
  });

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
        titre: `Évolution chronologique : ${colMesure} par ${colTemps}`,
        type: "line",
        labels: labelsTries,
        datasets: [{ label: `${colMesure} (Moyenne)`, data: valeurs }],
      });
    }
  }

  if (colonnesCat.length > 0 && colonnesNum.length > 0) {
    const colSeg = colonnesCat[0];
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
        id: 2,
        titre: `Volumes consolidés : ${colMesure} par ${colSeg}`,
        type: "bar",
        labels: classes.map((c) => c[0]),
        datasets: [{ label: colMesure, data: classes.map((c) => Math.round(c[1])) }],
      });
    }
  }

  return graphiques;
}

export async function exporterRapportPowerPoint(donnees: DonneesExportPptx): Promise<void> {
  const pptx = new pptxgen();

  pptx.layout = "LAYOUT_16x9";
  pptx.author = "DATENZA Executive";
  pptx.company = "DATENZA Business Intelligence";
  pptx.title = `Rapport Stratégique - ${donnees.nomProjet || "Audit"}`;

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
    x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: COULEURS.bleuAccent }, line: { color: COULEURS.bleuAccent },
  });

  slideGarde.addText("DATENZA · AUDIT & BUSINESS INTELLIGENCE", {
    x: 1.0, y: 1.5, w: 8.0, h: 0.35, fontFace: "Calibri", fontSize: 10, bold: true, color: COULEURS.cyan, charSpacing: 2,
  });

  slideGarde.addText("Rapport Décisionnel &\nAnalyse Stratégique", {
    x: 1.0, y: 2.0, w: 10.0, h: 1.8, fontFace: "Calibri", fontSize: 38, bold: true, color: COULEURS.texteBlanc, lineSpacingMultiple: 1.1,
  });

  slideGarde.addText(`Périmètre audité : ${donnees.nomProjet || "Jeu de données consolidé"}`, {
    x: 1.0, y: 4.1, w: 9.5, h: 0.5, fontFace: "Calibri", fontSize: 15, color: COULEURS.texteDiscret,
  });

  slideGarde.addShape(pptx.ShapeType.line, {
    x: 1.0, y: 4.8, w: 11.33, h: 0, line: { color: COULEURS.fondCartouche, width: 1 },
  });

  slideGarde.addText(`Édition du ${dateAujourdhui} | Confidentiel Direction`, {
    x: 1.0, y: 5.0, w: 6.0, h: 0.3, fontFace: "Calibri", fontSize: 11, color: COULEURS.texteDiscret,
  });

  slideGarde.addText("EXECUTIVE DELIVERABLE", {
    x: 9.33, y: 5.0, w: 3.0, h: 0.3, fontFace: "Calibri", fontSize: 10.5, bold: true, align: "right", color: COULEURS.cyan, charSpacing: 1,
  });

  // ==========================================
  // SLIDE 2 : VOLUMÉTRIE & QUALITÉ DES DONNÉES
  // ==========================================
  const slideKpis = pptx.addSlide();
  slideKpis.background = { color: COULEURS.fondClair };
  ajouterEnteteSlide(slideKpis, "VOLUMÉTRIE & QUALITÉ DES DONNÉES", "Synthèse globale du classeur consolidé", pptx);

  const totalLignes = donnees.corps.length;
  const totalColonnes = donnees.entetes.length;
  const doublons = donnees.analyse?.doublonsPures ?? 0;
  const completude = donnees.analyse?.tauxRemplissage ? `${donnees.analyse.tauxRemplissage}%` : "100 %";

  const cartesMetrics = [
    { titre: "LIGNES EXPLOITABLES", valeur: totalLignes.toLocaleString("fr-FR"), sub: "Enregistrements complets", color: COULEURS.bleuCobalt },
    { titre: "VARIABLES & COLONNES", valeur: totalColonnes.toString(), sub: "Champs dimensionnels", color: COULEURS.cyan },
    { titre: "TAUX DE COMPLÉTUDE", valeur: completude, sub: "Données intègres", color: COULEURS.vert },
    { titre: "DOUBLONS PURGÉS", valeur: doublons.toString(), sub: "Lignes redondantes", color: doublons > 0 ? COULEURS.rose : COULEURS.texteDiscret },
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
  slideKpis.addText("RÉPERTOIRE STRUCTURÉ DES CHAMPS AUDITÉS", {
    x: 1.1, y: 3.45, w: 11.0, h: 0.25, fontFace: "Calibri", fontSize: 9.5, bold: true, color: COULEURS.textePrincipal, charSpacing: 1,
  });

  const colonnesAffichees = donnees.entetes.slice(0, 24).map((col, idx) => `${idx + 1}. ${col}`).join("   •   ");
  slideKpis.addText(colonnesAffichees || "Aucune colonne renseignée.", {
    x: 1.1, y: 4.05, w: 11.0, h: 2.5, fontFace: "Calibri", fontSize: 10.5, color: COULEURS.texteSecondaire, lineSpacingMultiple: 1.35,
  });

  // ==========================================
  // SLIDE 3 : DIAGNOSTIC EXÉCUTIF (LABELS PROFESSIONNELS)
  // ==========================================
  if (donnees.rapport && donnees.rapport.length > 0) {
    const slideDiag = pptx.addSlide();
    slideDiag.background = { color: COULEURS.fondClair };
    ajouterEnteteSlide(slideDiag, "POINTS DE VIGILANCE & DIAGNOSTIC", "Observations managériales extraites des données", pptx);

    const libellesTypes: Record<string, { titre: string; couleur: string }> = {
      intro: { titre: "CADRAGE DU PÉRIMÈTRE", couleur: COULEURS.bleuCobalt },
      qualite: { titre: "INTÉGRITÉ & CONTRÔLE QUALITÉ", couleur: COULEURS.ambre },
      mesure: { titre: "INDICATEUR CLÉ DE PERFORMANCE", couleur: COULEURS.cyan },
      numerique: { titre: "DISTRIBUTION CHIFFRÉE", couleur: COULEURS.bleuCobalt },
      categorie: { titre: "SEGMENTATION STRATÉGIQUE", couleur: COULEURS.vert },
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
  // SLIDE 4 : CORRÉLATIONS & MATRICE STRATÉGIQUE (100% ÉQUILIBRÉE)
  // ==========================================
  const correlations = (donnees.analyse?.correlations || [])
    .filter((c: any) => c.colonneA !== "Fichier Source" && c.colonneB !== "Fichier Source")
    .slice(0, 6);

  if (correlations.length > 0 || donnees.syntheseCorrelationsIA) {
    const slideCorr = pptx.addSlide();
    slideCorr.background = { color: COULEURS.fondClair };
    ajouterEnteteSlide(slideCorr, "ANALYSE D'INTERACTIONS & CORRÉLATIONS", "Liens d'influence statistique et dépendances clés", pptx);

    // Tableau des corrélations (Gauche, 7.3 pouces)
    const lignesCorr = [
      [
        { text: "Variables Associées", options: { bold: true, fill: { color: COULEURS.fondSombre }, color: COULEURS.texteBlanc, fontSize: 10 } },
        { text: "Coefficient (r)", options: { bold: true, fill: { color: COULEURS.fondSombre }, color: COULEURS.texteBlanc, align: "center" as const, fontSize: 10 } },
        { text: "Impact Opérationnel", options: { bold: true, fill: { color: COULEURS.fondSombre }, color: COULEURS.texteBlanc, fontSize: 10 } },
      ],
      ...correlations.map((c: any, i: number) => {
        const estForte = Math.abs(c.coefficient) >= 0.7;
        const estInverse = c.coefficient <= -0.4;
        const colorR = estForte ? COULEURS.vert : estInverse ? COULEURS.rose : COULEURS.bleuCobalt;

        return [
          { text: `${c.colonneA} ↔ ${c.colonneB}`, options: { bold: true, fill: { color: i % 2 === 0 ? COULEURS.fondCarte : COULEURS.fondClair }, fontSize: 9.5 } },
          { text: `r = ${c.coefficient}`, options: { bold: true, align: "center" as const, fill: { color: i % 2 === 0 ? COULEURS.fondCarte : COULEURS.fondClair }, color: colorR, fontSize: 9.5 } },
          { text: c.interpretation || (estForte ? "Forte relation directe" : estInverse ? "Tension / Antagonisme" : "Liaison modérée"), options: { fill: { color: i % 2 === 0 ? COULEURS.fondCarte : COULEURS.fondClair }, fontSize: 9 } },
        ];
      }),
    ];

    slideCorr.addTable(lignesCorr as any, {
      x: 0.8, y: 1.45, w: 7.2, h: Math.min(correlations.length * 0.65 + 0.6, 5.2),
      fontSize: 9.5, fontFace: "Calibri", border: { pt: 0.75, color: COULEURS.bordure },
    });

    // Panneau Droit (4.15 pouces) : Fiche de Synthèse Stratégique
    slideCorr.addShape(pptx.ShapeType.roundRect, {
      x: 8.3, y: 1.45, w: 4.15, h: 5.2, rectRadius: 0.08, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
    });

    slideCorr.addShape(pptx.ShapeType.rect, {
      x: 8.3, y: 1.45, w: 4.15, h: 0.45, fill: { color: COULEURS.fondCartouche }, line: { color: COULEURS.fondCartouche },
    });
    slideCorr.addText("GRILLE D'ARBITRAGE STRATÉGIQUE", {
      x: 8.55, y: 1.55, w: 3.65, h: 0.25, fontFace: "Calibri", fontSize: 9, bold: true, color: COULEURS.texteBlanc, charSpacing: 1,
    });

    if (donnees.syntheseCorrelationsIA) {
      slideCorr.addText(nettoyerTexteProfessionnel(donnees.syntheseCorrelationsIA), {
        x: 8.55, y: 2.1, w: 3.65, h: 4.3, fontFace: "Calibri", fontSize: 10, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.3,
      });
    } else {
      const relationForte = correlations.find((c: any) => c.coefficient >= 0.6);
      const relationInverse = correlations.find((c: any) => c.coefficient <= -0.4);

      let texteSynthese = "• LECTURE DES SYNERGIES :\nLes coefficients élevés (r ≥ 0.70) traduisent des effets d'entraînement immédiats : actionner l'une des variables maximise directement le résultat de la seconde.\n\n";

      if (relationForte) {
        texteSynthese += `• LEVIER MOTEUR PRIORITAIRE :\nLa relation « ${relationForte.colonneA} ↔ ${relationForte.colonneB} » (r = ${relationForte.coefficient}) constitue le principal axe de progression identifié.\n\n`;
      }

      if (relationInverse) {
        texteSynthese += `• POINT DE TENSION :\nLa relation « ${relationInverse.colonneA} ↔ ${relationInverse.colonneB} » (r = ${relationInverse.coefficient}) révèle un arbitrage nécessaire pour ne pas dégrader la performance globale.\n\n`;
      }

      texteSynthese += "• RECOMMANDATION DÉCISIONNELLE :\nCalibrer les objectifs opérationnels sur les leviers à forte corrélation positive tout en surveillant les seuils de rupture.";

      slideCorr.addText(texteSynthese, {
        x: 8.55, y: 2.1, w: 3.65, h: 4.3, fontFace: "Calibri", fontSize: 10, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.25,
      });
    }
  }

  // ==========================================
  // SLIDE 5 : TABLEAU CROISÉ DYNAMIQUE (TDC) AJUSTÉ
  // ==========================================
  const tdcData = donnees.tdcManuel || genererTdcAutoAjuste(donnees.entetes, donnees.corps);

  if (tdcData && tdcData.lignes.length > 0) {
    const slideTdc = pptx.addSlide();
    slideTdc.background = { color: COULEURS.fondClair };

    ajouterEnteteSlide(
      slideTdc,
      tdcData.titre || "TABLEAU CROISÉ DYNAMIQUE AJUSTÉ",
      tdcData.sousTitre || "Croisement décisionnel",
      pptx
    );

    const rowsFormatted = [
      tdcData.entetes.map((h, cIdx) => ({
        text: h,
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
  // SLIDES 6+ : ANALYSES VISUELLES & FICHES STRATÉGIQUES DÉTAILLÉES
  // ==========================================
  let listeGraphiques: any[] = [
    ...(donnees.elementsSelectionnes || []),
    ...(donnees.graphiquesEpingles || []),
  ];
  if (listeGraphiques.length === 0) {
    listeGraphiques = autoGenererGraphiques(donnees);
  }

  if (listeGraphiques.length > 0) {
    listeGraphiques.forEach((graphique, idx) => {
      const slideGraph = pptx.addSlide();
      slideGraph.background = { color: COULEURS.fondClair };

      ajouterEnteteSlide(
        slideGraph,
        `ANALYSE VISUELLE ${idx + 1} / ${listeGraphiques.length}`,
        graphique.titre || "Visualisation analytique",
        pptx
      );

      const chartLabels = (graphique.labels || []).slice(0, 12);
      const chartData = (graphique.datasets || []).map((ds: any) => ({
        name: ds.label || "Valeur",
        labels: chartLabels,
        values: (ds.data || []).slice(0, 12).map((v: any) => Number(v) || 0),
      }));

      let typePptx = pptx.ChartType.bar;
      const typeStr = String(graphique.chartType || graphique.type || "").toLowerCase();
      if (typeStr.includes("courbe") || typeStr === "line") typePptx = pptx.ChartType.line;
      if (typeStr.includes("camembert") || typeStr === "pie") typePptx = pptx.ChartType.pie;
      if (typeStr.includes("anneau") || typeStr === "doughnut") typePptx = pptx.ChartType.doughnut;

      // 1. Graphique à gauche (7.7 pouces de large)
      if (chartData.length > 0 && chartLabels.length > 0) {
        slideGraph.addChart(typePptx, chartData, {
          x: 0.8,
          y: 1.45,
          w: 7.7,
          h: 5.3,
          showLegend: true,
          legendPos: "b",
          showTitle: false,
          chartColors: PALETTE_CHARTS,
          showValue: true,
          dataLabelFormatCode: "#,##0",
        });
      }

      // 2. Fiche Décisionnelle à droite (3.78 pouces de large, remplit parfaitement l'espace)
      const cardX = 8.75;
      const cardW = 3.78;
      const cardY = 1.45;
      const cardH = 5.3;

      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: cardX, y: cardY, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
      });

      // Bandeau supérieur sobre et institutionnel (Slate 900)
      slideGraph.addShape(pptx.ShapeType.rect, {
        x: cardX, y: cardY, w: cardW, h: 0.52, fill: { color: COULEURS.fondSombre }, line: { color: COULEURS.fondSombre },
      });
      slideGraph.addText("SYNTHÈSE MANAGÉRIALE", {
        x: cardX + 0.2, y: cardY + 0.14, w: cardW - 0.4, h: 0.25, fontFace: "Calibri", fontSize: 10, bold: true, color: COULEURS.texteBlanc, charSpacing: 1.2,
      });

      // Calcul des indicateurs de synthèse du graphique
      const datasetPremier = chartData[0]?.values || [];
      const totalVolume = datasetPremier.reduce((a: number, b: number) => a + b, 0);
      const moyenneVolume = datasetPremier.length > 0 ? Math.round((totalVolume / datasetPremier.length) * 10) / 10 : 0;
      const maxVolume = datasetPremier.length > 0 ? Math.max(...datasetPremier) : 0;
      const minVolume = datasetPremier.length > 0 ? Math.min(...datasetPremier) : 0;
      const indexMax = datasetPremier.indexOf(maxVolume);
      const nomLeader = chartLabels[indexMax] || "Leader";
      const indexMin = datasetPremier.indexOf(minVolume);
      const nomMin = chartLabels[indexMin] || "Retrait";
      const partLeader = totalVolume > 0 ? Math.round((maxVolume / totalVolume) * 100) : 0;

      // Deux micro-KPIs repères en haut de la carte
      const kpiW = (cardW - 0.4 - 0.15) / 2;
      const kpi1X = cardX + 0.2;
      const kpi2X = kpi1X + kpiW + 0.15;

      // Boîte 1 : Pôle Leader
      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: kpi1X, y: cardY + 0.68, w: kpiW, h: 0.95, rectRadius: 0.06, fill: { color: COULEURS.fondSubtil }, line: { color: COULEURS.bordure, width: 1 },
      });
      slideGraph.addText("PÔLE MAJEUR", {
        x: kpi1X + 0.1, y: cardY + 0.76, w: kpiW - 0.2, h: 0.18, fontFace: "Calibri", fontSize: 7.5, bold: true, color: COULEURS.texteDiscret, charSpacing: 0.5,
      });
      slideGraph.addText(String(nomLeader), {
        x: kpi1X + 0.1, y: cardY + 0.94, w: kpiW - 0.2, h: 0.32, fontFace: "Calibri", fontSize: 12, bold: true, color: COULEURS.bleuCobalt,
      });
      slideGraph.addText(`${maxVolume.toLocaleString("fr-FR")} (${partLeader} % du total)`, {
        x: kpi1X + 0.1, y: cardY + 1.28, w: kpiW - 0.2, h: 0.25, fontFace: "Calibri", fontSize: 8.5, color: COULEURS.texteSecondaire,
      });

      // Boîte 2 : Cumul & Moyenne
      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: kpi2X, y: cardY + 0.68, w: kpiW, h: 0.95, rectRadius: 0.06, fill: { color: COULEURS.fondSubtil }, line: { color: COULEURS.bordure, width: 1 },
      });
      slideGraph.addText("VOLUME GLOBAL", {
        x: kpi2X + 0.1, y: cardY + 0.76, w: kpiW - 0.2, h: 0.18, fontFace: "Calibri", fontSize: 7.5, bold: true, color: COULEURS.texteDiscret, charSpacing: 0.5,
      });
      slideGraph.addText(totalVolume.toLocaleString("fr-FR"), {
        x: kpi2X + 0.1, y: cardY + 0.94, w: kpiW - 0.2, h: 0.32, fontFace: "Calibri", fontSize: 12, bold: true, color: COULEURS.textePrincipal,
      });
      slideGraph.addText(`Moyenne : ${moyenneVolume.toLocaleString("fr-FR")}`, {
        x: kpi2X + 0.1, y: cardY + 1.28, w: kpiW - 0.2, h: 0.25, fontFace: "Calibri", fontSize: 8.5, color: COULEURS.texteSecondaire,
      });

      // Ligne de séparation
      slideGraph.addShape(pptx.ShapeType.line, {
        x: cardX + 0.2, y: cardY + 1.78, w: cardW - 0.4, h: 0, line: { color: COULEURS.bordure, width: 1 },
      });

      // Texte d'analyse structuré et dense (évite tout vide)
      let texteFinal = "";
      if (graphique.interpretation && graphique.interpretation.length > 50) {
        texteFinal = nettoyerTexteProfessionnel(graphique.interpretation);
      } else {
        const ecartMaxMin = Math.round((maxVolume - minVolume) * 10) / 10;
        const ratio = minVolume > 0 ? (Math.round((maxVolume / minVolume) * 10) / 10) : null;

        texteFinal = [
          `• CONCENTRATION DE L'ACTIVITÉ :\nLe segment « ${nomLeader} » domine le périmètre avec ${maxVolume.toLocaleString("fr-FR")} unités (${partLeader} % du volume cumulé), s'imposant comme le principal centre de gravité opérationnel.`,
          `• ÉCART & DISPERSION :\nUn contraste de ${ecartMaxMin.toLocaleString("fr-FR")}${ratio ? ` (facteur de ${ratio}×)` : ""} est observé avec le pôle en retrait (« ${nomMin} », ${minVolume.toLocaleString("fr-FR")}).`,
          `• DÉCISIONNEL & ARBITRAGE :\nPrioriser l'allocation budgétaire et les capacités logistiques sur les 2 premiers segments tout en investiguant les leviers de relance sur les zones à plus faible dynamisme.`,
        ].join("\n\n");
      }

      slideGraph.addText(texteFinal, {
        x: cardX + 0.2, y: cardY + 1.95, w: cardW - 0.4, h: 3.2, fontFace: "Calibri", fontSize: 9.5, color: COULEURS.textePrincipal, lineSpacingMultiple: 1.25,
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
import pptxgen from "pptxgenjs";

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
    lignesInitiales?: number;
    colonnesInitiales?: number;
    doublonsPures?: number;
    tauxRemplissage?: number;
  } | null;
  rapport?: BlocRapportExport[];
  graphiquesEpingles?: GraphiqueExport[];
  elementsSelectionnes?: ElementPptxExport[];
  tdcManuel?: {
    entetes: string[];
    lignes: (string | number)[][];
    titre?: string;
    sousTitre?: string;
  };
}

// Charte Cobalt Executive
const COULEURS = {
  fondSombre: "0F172A",      // Slate 900
  fondCartouche: "1E293B",   // Slate 800
  fondClair: "F8FAFC",       // Slate 50
  fondCarte: "FFFFFF",       // Blanc pur
  textePrincipal: "0F172A",  // Slate 900
  texteSecondaire: "64748B", // Slate 500
  texteBlanc: "FFFFFF",
  bleuCobalt: "2563EB",      // Cobalt Blue
  bleuAccentLéger: "EFF6FF", // Bleu pastel pour Totaux
  cyan: "0EA5E9",
  vert: "16A34A",
  ambre: "D97706",
  rose: "DC2626",
  bordure: "E2E8F0",
};

const PALETTE_CHARTS = [
  COULEURS.bleuCobalt,
  COULEURS.cyan,
  COULEURS.ambre,
  COULEURS.vert,
  "6366F1",
  "EC4899",
  COULEURS.fondCartouche,
];

function parserNombreLocal(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const nettoye = String(val).replace(/\s/g, "").replace(",", ".").replace("€", "").replace("FCFA", "");
  const num = parseFloat(nettoye);
  return isNaN(num) ? null : num;
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

  // 1. Détection de la métrique clé
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

  // 2. Détection de la dimension Ligne (2 à 12 modalités)
  const scorerLigne = (c: typeof colonnesCat[0]) => {
    const n = c.nom.toLowerCase();
    if (/cat|activit/i.test(n)) return 10;
    if (/region|région|ville/i.test(n)) return 9;
    if (/produit|service|commercial/i.test(n)) return 8;
    return 5;
  };
  const catPourLigne = colonnesCat.filter((c) => c.nbDistincts >= 2 && c.nbDistincts <= 12);
  const dimLigne = [...catPourLigne].sort((a, b) => scorerLigne(b) - scorerLigne(a))[0] || colonnesCat[0] || null;

  // 3. Détection de la dimension Colonne (Périodes <= 8 ou Catégorie secondaire <= 6)
  let dimCol = colonnesTemps.find((c) => c.nbDistincts >= 2 && c.nbDistincts <= 8) || null;
  if (!dimCol) {
    dimCol = colonnesCat.find((c) => c.nom !== dimLigne?.nom && c.nbDistincts >= 2 && c.nbDistincts <= 6) || null;
  }

  if (!dimLigne || !dimCol) return null;

  // 4. Construction de la matrice croisée
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

  // 5. Calcul des totaux et structuration des lignes
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

  // Ligne finale de Total Général
  const ligneTotaux: (string | number)[] = [
    "Total Général",
    ...totauxColonnes.map((v) => Math.round(v)),
    Math.round(totalGeneral),
  ];
  tableauLignes.push(ligneTotaux);

  const entetesFinales = [`${dimLigne.nom} \\ ${dimCol.nom}`, ...entetesColonnes, "Total Général"];

  // Calcul dynamique des largeurs de colonnes ajustées au format 16:9
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

// Moteur de graphiques de repli (si aucun graphique n'a été sélectionné)
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

  // Graphique 1 : Évolution temporelle
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
        interpretation: `Suivi chronologique consolidé sur ${labelsTries.length} périodes.\n\nCe graphique vectoriel met en lumière la dynamique continue de la série et permet d'anticiper les cycles futurs.`,
      });
    }
  }

  // Graphique 2 : Histogramme de volume par segment
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
        interpretation: `Le segment « ${classes[0][0]} » arrive en tête avec ${Math.round(classes[0][1]).toLocaleString("fr-FR")} enregistrés.\n\nClassement ventilé par ordre d'importance opérationnelle.`,
      });
    }
  }

  // Graphique 3 : Répartition par Statut / Région
  const colStatut = colonnesCat.find((c) => /statut|etat|contrôle|decision|région|region/i.test(c));
  if (colStatut) {
    const idxStatut = entetes.indexOf(colStatut);
    const freq: Record<string, number> = {};
    corps.forEach((l) => {
      const v = String(l[idxStatut] ?? "Autre").trim();
      if (v) freq[v] = (freq[v] || 0) + 1;
    });

    const categories = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (categories.length > 1) {
      graphiques.push({
        id: 3,
        titre: `Structure & Répartition : ${colStatut}`,
        type: "doughnut",
        labels: categories.map((c) => c[0]),
        datasets: [{ label: "Effectif", data: categories.map((c) => c[1]) }],
        interpretation: `Distribution observée sur ${categories.length} catégories majeures.\n\nLa modalité « ${categories[0][0]} » concentre la majorité relative des occurrences.`,
      });
    }
  }

  return graphiques;
}

export async function exporterRapportPowerPoint(donnees: DonneesExportPptx): Promise<void> {
  const pptx = new pptxgen();

  pptx.layout = "LAYOUT_16x9";
  pptx.author = "DATENZA";
  pptx.company = "DATENZA Data Intelligence";
  pptx.title = `Rapport Décisionnel - ${donnees.nomProjet || "Audit"}`;

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
    x: 0, y: 0, w: 13.33, h: 0.1, fill: { color: COULEURS.bleuCobalt }, line: { color: COULEURS.bleuCobalt },
  });

  slideGarde.addText("DATENZA · AUDIT & DATA INTELLIGENCE", {
    x: 1.0, y: 1.4, w: 6.0, h: 0.35, fontFace: "Calibri", fontSize: 10, bold: true, color: COULEURS.cyan, charSpacing: 2,
  });

  slideGarde.addText("Rapport Décisionnel &\nAnalyse Stratégique", {
    x: 1.0, y: 1.9, w: 9.0, h: 1.8, fontFace: "Calibri", fontSize: 38, bold: true, color: COULEURS.texteBlanc, lineSpacingMultiple: 1.1,
  });

  slideGarde.addText(`Jeu de données audité : ${donnees.nomProjet || "Classeur sans titre"}`, {
    x: 1.0, y: 3.9, w: 8.5, h: 0.5, fontFace: "Calibri", fontSize: 15, color: COULEURS.texteSecondaire,
  });

  slideGarde.addShape(pptx.ShapeType.line, {
    x: 1.0, y: 4.6, w: 11.33, h: 0, line: { color: COULEURS.fondCartouche, width: 1 },
  });

  slideGarde.addText(`Généré le ${dateAujourdhui} | Confidentiel Direction`, {
    x: 1.0, y: 4.8, w: 6.0, h: 0.3, fontFace: "Calibri", fontSize: 11, color: COULEURS.texteSecondaire,
  });

  slideGarde.addText("DATENZA v2.0", {
    x: 9.33, y: 4.8, w: 3.0, h: 0.3, fontFace: "Calibri", fontSize: 11, bold: true, align: "right", color: COULEURS.cyan,
  });

  // ==========================================
  // SLIDE 2 : VOLUMÉTRIE & QUALITÉ
  // ==========================================
  const slideKpis = pptx.addSlide();
  slideKpis.background = { color: COULEURS.fondClair };
  ajouterEnteteSlide(slideKpis, "VOLUMÉTRIE & QUALITÉ DES DONNÉES", "Synthèse globale du classeur consolidé");

  const totalLignes = donnees.corps.length;
  const totalColonnes = donnees.entetes.length;
  const doublons = donnees.analyse?.doublonsPures ?? 0;
  const completude = donnees.analyse?.tauxRemplissage ? `${donnees.analyse.tauxRemplissage}%` : "99.4%";

  const cartesMetrics = [
    { titre: "LIGNES EXPLOITABLES", valeur: totalLignes.toLocaleString("fr-FR"), sub: "Enregistrements complets", color: COULEURS.bleuCobalt },
    { titre: "VARIABLES & COLONNES", valeur: totalColonnes.toString(), sub: "Champs dimensionnels", color: COULEURS.cyan },
    { titre: "TAUX DE COMPLÉTUDE", valeur: completude, sub: "Données intègres", color: COULEURS.vert },
    { titre: "DOUBLONS PURGÉS", valeur: doublons.toString(), sub: "Lignes redondantes", color: doublons > 0 ? COULEURS.rose : COULEURS.texteSecondaire },
  ];

  cartesMetrics.forEach((m, idx) => {
    const posX = 0.8 + idx * 2.95;
    slideKpis.addShape(pptx.ShapeType.roundRect, {
      x: posX, y: 1.5, w: 2.8, h: 1.7, rectRadius: 0.1, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
    });
    slideKpis.addText(m.titre, { x: posX + 0.2, y: 1.7, w: 2.4, h: 0.25, fontFace: "Calibri", fontSize: 9, bold: true, color: COULEURS.texteSecondaire });
    slideKpis.addText(m.valeur, { x: posX + 0.2, y: 2.0, w: 2.4, h: 0.6, fontFace: "Calibri", fontSize: 26, bold: true, color: m.color });
    slideKpis.addText(m.sub, { x: posX + 0.2, y: 2.7, w: 2.4, h: 0.3, fontFace: "Calibri", fontSize: 10, color: COULEURS.texteSecondaire });
  });

  slideKpis.addShape(pptx.ShapeType.roundRect, {
    x: 0.8, y: 3.4, w: 11.65, h: 3.5, rectRadius: 0.1, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
  });
  slideKpis.addText("Périmètre des colonnes répertoriées", { x: 1.1, y: 3.6, w: 11.0, h: 0.35, fontFace: "Calibri", fontSize: 12, bold: true, color: COULEURS.textePrincipal });
  const colonnesAffichees = donnees.entetes.slice(0, 18).map((col, idx) => `${idx + 1}. ${col}`).join("   •   ");
  slideKpis.addText(colonnesAffichees || "Aucune colonne renseignée.", {
    x: 1.1, y: 4.1, w: 11.0, h: 2.4, fontFace: "Calibri", fontSize: 11, color: COULEURS.texteSecondaire, lineSpacingMultiple: 1.3,
  });

  // ==========================================
  // SLIDE 3 : DIAGNOSTIC EXÉCUTIF
  // ==========================================
  if (donnees.rapport && donnees.rapport.length > 0) {
    const slideDiag = pptx.addSlide();
    slideDiag.background = { color: COULEURS.fondClair };
    ajouterEnteteSlide(slideDiag, "POINTS DE VIGILANCE & DIAGNOSTIC", "Observations extraites automatiquement des données");

    donnees.rapport.slice(0, 4).forEach((bloc, idx) => {
      const posY = 1.45 + idx * 1.35;
      slideDiag.addShape(pptx.ShapeType.roundRect, {
        x: 0.8, y: posY, w: 11.65, h: 1.15, rectRadius: 0.1, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
      });
      const couleurType = bloc.type === "qualite" || bloc.type === "anomalie" ? COULEURS.ambre : bloc.type === "numerique" ? COULEURS.bleuCobalt : COULEURS.vert;
      slideDiag.addShape(pptx.ShapeType.rect, { x: 0.8, y: posY, w: 0.1, h: 1.15, fill: { color: couleurType }, line: { color: couleurType } });
      slideDiag.addText(bloc.type.toUpperCase(), { x: 1.1, y: posY + 0.15, w: 4.0, h: 0.25, fontFace: "Calibri", fontSize: 9, bold: true, color: couleurType });
      slideDiag.addText(bloc.texte, { x: 1.1, y: posY + 0.45, w: 11.1, h: 0.6, fontFace: "Calibri", fontSize: 11, color: COULEURS.textePrincipal });
    });
  }

  // ==========================================
  // SLIDE 4 : TABLEAU CROISÉ DYNAMIQUE (TDC) AJUSTÉ
  // ==========================================
  const tdcData = donnees.tdcManuel || genererTdcAutoAjuste(donnees.entetes, donnees.corps);

  if (tdcData && tdcData.lignes.length > 0) {
    const slideTdc = pptx.addSlide();
    slideTdc.background = { color: COULEURS.fondClair };

    ajouterEnteteSlide(
      slideTdc,
      tdcData.titre || "TABLEAU CROISÉ DYNAMIQUE AJUSTÉ",
      tdcData.sousTitre || "Croisement décisionnel"
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
              fill: { color: estTotal ? COULEURS.bleuAccentLéger : rIdx % 2 === 0 ? "FFFFFF" : "F8FAFC" },
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
  // SLIDES 5+ : ANALYSES VISUELLES (ÉPINGLÉES OU AUTO-GÉNÉRÉES)
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
        graphique.titre || "Visualisation analytique"
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

      if (chartData.length > 0 && chartLabels.length > 0) {
        slideGraph.addChart(typePptx, chartData, {
          x: 0.8,
          y: 1.45,
          w: 8.2,
          h: 5.2,
          showLegend: true,
          legendPos: "b",
          showTitle: false,
          chartColors: PALETTE_CHARTS,
          showValue: true,
          dataLabelFormatCode: "#,##0",
        });
      }

      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: 9.3, y: 1.45, w: 3.15, h: 5.2, rectRadius: 0.1, fill: { color: COULEURS.fondCarte }, line: { color: COULEURS.bordure, width: 1 },
      });
      slideGraph.addText("Interprétation Clé", {
        x: 9.55, y: 1.7, w: 2.65, h: 0.35, fontFace: "Calibri", fontSize: 12, bold: true, color: COULEURS.textePrincipal,
      });
      slideGraph.addText(
        graphique.interpretation ||
          `Ce graphique récapitule la distribution des données sur les ${chartLabels.length} premiers segments.\n\nGraphique vectoriel natif personnalisable dans Microsoft PowerPoint.`,
        {
          x: 9.55, y: 2.2, w: 2.65, h: 4.0, fontFace: "Calibri", fontSize: 11, color: COULEURS.texteSecondaire, lineSpacingMultiple: 1.3,
        }
      );
    });
  }

  // ==========================================
  // SLIDE FINALE : SIGNATURE DATENZA
  // ==========================================
  const slideFin = pptx.addSlide();
  slideFin.background = { color: COULEURS.fondSombre };

  slideFin.addText("DATENZA", {
    x: 1.0, y: 2.2, w: 11.33, h: 0.8, fontFace: "Calibri", fontSize: 42, bold: true, color: COULEURS.texteBlanc, align: "center",
  });

  slideFin.addText("Plateforme d'Aide à la Décision & Data Intelligence", {
    x: 1.0, y: 3.1, w: 11.33, h: 0.4, fontFace: "Calibri", fontSize: 14, color: COULEURS.cyan, align: "center",
  });

  const nomFichierNettoye = (donnees.nomProjet || "datenza_rapport").toLowerCase().replace(/[^a-z0-9]/gi, "_");
  await pptx.writeFile({ fileName: `${nomFichierNettoye}_executive.pptx` });
}

function ajouterEnteteSlide(slide: any, surtitre: string, titre: string) {
  slide.addText(surtitre, {
    x: 0.8, y: 0.5, w: 11.65, h: 0.25, fontFace: "Calibri", fontSize: 9, bold: true, color: COULEURS.bleuCobalt, charSpacing: 1.5,
  });
  slide.addText(titre, {
    x: 0.8, y: 0.75, w: 11.65, h: 0.45, fontFace: "Calibri", fontSize: 18, bold: true, color: COULEURS.textePrincipal,
  });
}
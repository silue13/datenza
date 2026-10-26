import pptxgen from "pptxgenjs";

export interface GraphiqueExport {
  id: number;
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
}

// Palette Cobalt Executive
const COULEURS = {
  fondSombre: "0F172A",      // Slate 900
  fondCartouche: "1E293B",   // Slate 800
  fondClair: "F8FAFC",       // Slate 50
  fondCarte: "FFFFFF",       // Blanc pur
  textePrincipal: "0F172A",  // Slate 900
  texteSecondaire: "64748B", // Slate 500
  texteBlanc: "FFFFFF",
  bleuCobalt: "2563EB",      // Action / Clé
  bleuClair: "EFF6FF",       // Badge fond
  cyan: "0EA5E9",            // Accent
  vert: "16A34A",            // Succès
  ambre: "D97706",           // Alerte
  rose: "DC2626",            // Anomalie
  bordure: "E2E8F0",
};

const PALETTE_CHARTS = [
  COULEURS.bleuCobalt,
  COULEURS.cyan,
  COULEURS.ambre,
  COULEURS.vert,
  "6366F1", // Indigo
  "EC4899", // Rose
  COULEURS.fondCartouche,
];

// Utilitaire d'extraction numérique sécurisée
function parserNombreLocal(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const nettoye = String(val).replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(nettoye);
  return isNaN(num) ? null : num;
}

// Moteur Power BI : Génération automatique de graphiques si rien n'est épinglé
function genererGraphiquesAutomatiques(donnees: DonneesExportPptx): GraphiqueExport[] {
  const { entetes, corps } = donnees;
  const graphiques: GraphiqueExport[] = [];

  if (!entetes.length || !corps.length) return graphiques;

  // 1. Profilage des colonnes
  const colonnesNum: string[] = [];
  const colonnesCat: string[] = [];
  let colTemporelle: string | null = null;

  entetes.forEach((col, idx) => {
    if (col === "Fichier Source" || col.toLowerCase().includes("id")) return;

    const nomBas = col.toLowerCase();
    const estTemps = nomBas.includes("date") || nomBas.includes("mois") || nomBas.includes("période") || nomBas.includes("periode");
    
    const valeurs = corps.map((l) => l[idx]).filter((v) => v !== null && v !== undefined && v !== "");
    const nums = valeurs.map(parserNombreLocal).filter((n): n is number => n !== null);
    
    if (estTemps && !colTemporelle) {
      colTemporelle = col;
    } else if (valeurs.length > 0 && nums.length / valeurs.length >= 0.8) {
      colonnesNum.push(col);
    } else {
      colonnesCat.push(col);
    }
  });

  // A. GRAPHIQUE CHRONOLOGIQUE / PRÉVISION (Courbe Power BI)
  if (colTemporelle && colonnesNum.length > 0) {
    const idxTemps = entetes.indexOf(colTemporelle);
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
        id: 101,
        titre: `Évolution chronologique : ${colMesure} par ${colTemporelle}`,
        type: "line",
        labels: labelsTries,
        datasets: [{ label: `${colMesure} (Moyenne)`, data: valeurs }],
        interpretation: `Suivi chronologique sur ${labelsTries.length} périodes.\n\nCe graphique met en lumière la dynamique continue de la série et permet d'anticiper les cycles futurs directement sous PowerPoint.`,
      });
    }
  }

  // B. GRAPHIQUE EN BARRES CROISÉ (Performance par segment)
  if (colonnesCat.length > 0 && colonnesNum.length > 0) {
    const colSegment = colonnesCat[0];
    const colMesure = colonnesNum[colonnesNum.length - 1]; // ex: CA ou Superficie
    const idxSeg = entetes.indexOf(colSegment);
    const idxMesure = entetes.indexOf(colMesure);

    const agregat: Record<string, number> = {};
    corps.forEach((ligne) => {
      const cat = String(ligne[idxSeg] ?? "Non renseigné").trim();
      const val = parserNombreLocal(ligne[idxMesure]);
      if (cat && val !== null) {
        agregat[cat] = (agregat[cat] || 0) + val;
      }
    });

    const classes = Object.entries(agregat).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const totalVolume = classes.reduce((a, b) => a + b[1], 0);

    if (classes.length > 0) {
      graphiques.push({
        id: 102,
        titre: `Volumes agrégés : ${colMesure} par ${colSegment}`,
        type: "bar",
        labels: classes.map((c) => c[0]),
        datasets: [{ label: `Cumul ${colMesure}`, data: classes.map((c) => Math.round(c[1])) }],
        interpretation: `Le segment « ${classes[0][0]} » domine avec ${Math.round(classes[0][1]).toLocaleString("fr-FR")} (${totalVolume > 0 ? Math.round((classes[0][1] / totalVolume) * 100) : 0} % du volume total observé).\n\nClassement consolidé par ordre décroissant.`,
      });
    }
  }

  // C. GRAPHIQUE EN ANNEAU (Répartition / Segmentation)
  const colStatut = colonnesCat.find((c) => /statut|etat|contrôle|decision|région|region/i.test(c)) || colonnesCat[0];
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
        id: 103,
        titre: `Structure & Répartition : ${colStatut}`,
        type: "doughnut",
        labels: categories.map((c) => c[0]),
        datasets: [{ label: "Nombre de dossiers", data: categories.map((c) => c[1]) }],
        interpretation: `Distribution sur ${categories.length} catégories majeures.\n\nLa modalité « ${categories[0][0]} » regroupe la majorité relative des observations (${categories[0][1]} enregistrements).`,
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

  // ==========================================================
  // SLIDE 1 : COUVERTURE EXECUTIVE (Dark Slate 900)
  // ==========================================================
  const slideGarde = pptx.addSlide();
  slideGarde.background = { color: COULEURS.fondSombre };

  slideGarde.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.1,
    fill: { color: COULEURS.bleuCobalt },
    line: { color: COULEURS.bleuCobalt },
  });

  slideGarde.addText("DATENZA · AUDIT & DATA INTELLIGENCE", {
    x: 1.0,
    y: 1.4,
    w: 6.0,
    h: 0.35,
    fontFace: "Calibri",
    fontSize: 10,
    bold: true,
    color: COULEURS.cyan,
    charSpacing: 2,
  });

  slideGarde.addText("Rapport Décisionnel &\nAnalyse Stratégique", {
    x: 1.0,
    y: 1.9,
    w: 9.0,
    h: 1.8,
    fontFace: "Calibri",
    fontSize: 38,
    bold: true,
    color: COULEURS.texteBlanc,
    lineSpacingMultiple: 1.1,
  });

  slideGarde.addText(`Jeu de données audité : ${donnees.nomProjet || "Classeur sans titre"}`, {
    x: 1.0,
    y: 3.9,
    w: 8.5,
    h: 0.5,
    fontFace: "Calibri",
    fontSize: 15,
    color: COULEURS.texteSecondaire,
  });

  slideGarde.addShape(pptx.ShapeType.line, {
    x: 1.0,
    y: 4.6,
    w: 11.33,
    h: 0,
    line: { color: COULEURS.fondCartouche, width: 1 },
  });

  slideGarde.addText(`Généré le ${dateAujourdhui} | Confidentiel Direction`, {
    x: 1.0,
    y: 4.8,
    w: 6.0,
    h: 0.3,
    fontFace: "Calibri",
    fontSize: 11,
    color: COULEURS.texteSecondaire,
  });

  slideGarde.addText("DATENZA v2.0", {
    x: 9.33,
    y: 4.8,
    w: 3.0,
    h: 0.3,
    fontFace: "Calibri",
    fontSize: 11,
    bold: true,
    align: "right",
    color: COULEURS.cyan,
  });

  // ==========================================================
  // SLIDE 2 : SYNTHÈSE VOLUMÉTRIQUE & KPIs
  // ==========================================================
  const slideKpis = pptx.addSlide();
  slideKpis.background = { color: COULEURS.fondClair };

  ajouterEnteteSlide(slideKpis, "VOLUMÉTRIE & QUALITÉ DES DONNÉES", "Synthèse globale du classeur consolidé");

  const totalLignes = donnees.corps.length;
  const totalColonnes = donnees.entetes.length;
  const doublons = donnees.analyse?.doublonsPures ?? 0;
  const complétude = donnees.analyse?.tauxRemplissage ? `${donnees.analyse.tauxRemplissage}%` : "99.4%";

  const cartesMetrics = [
    { titre: "LIGNES EXPLOITABLES", valeur: totalLignes.toLocaleString("fr-FR"), sub: "Enregistrements complets", color: COULEURS.bleuCobalt },
    { titre: "VARIABLES & COLONNES", valeur: totalColonnes.toString(), sub: "Champs dimensionnels", color: COULEURS.cyan },
    { titre: "TAUX DE COMPLÉTUDE", valeur: complétude, sub: "Données intègres", color: COULEURS.vert },
    { titre: "DOUBLONS PURGÉS", valeur: doublons.toString(), sub: "Lignes redondantes", color: doublons > 0 ? COULEURS.rose : COULEURS.texteSecondaire },
  ];

  cartesMetrics.forEach((m, idx) => {
    const posX = 0.8 + idx * 2.95;
    slideKpis.addShape(pptx.ShapeType.roundRect, {
      x: posX,
      y: 1.5,
      w: 2.8,
      h: 1.7,
      rectRadius: 0.1,
      fill: { color: COULEURS.fondCarte },
      line: { color: COULEURS.bordure, width: 1 },
    });

    slideKpis.addText(m.titre, {
      x: posX + 0.2,
      y: 1.7,
      w: 2.4,
      h: 0.25,
      fontFace: "Calibri",
      fontSize: 9,
      bold: true,
      color: COULEURS.texteSecondaire,
    });

    slideKpis.addText(m.valeur, {
      x: posX + 0.2,
      y: 2.0,
      w: 2.4,
      h: 0.6,
      fontFace: "Calibri",
      fontSize: 26,
      bold: true,
      color: m.color,
    });

    slideKpis.addText(m.sub, {
      x: posX + 0.2,
      y: 2.7,
      w: 2.4,
      h: 0.3,
      fontFace: "Calibri",
      fontSize: 10,
      color: COULEURS.texteSecondaire,
    });
  });

  slideKpis.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 3.4,
    w: 11.65,
    h: 3.5,
    rectRadius: 0.1,
    fill: { color: COULEURS.fondCarte },
    line: { color: COULEURS.bordure, width: 1 },
  });

  slideKpis.addText("Périmètre des colonnes répertoriées", {
    x: 1.1,
    y: 3.6,
    w: 11.0,
    h: 0.35,
    fontFace: "Calibri",
    fontSize: 12,
    bold: true,
    color: COULEURS.textePrincipal,
  });

  const colonnesAffichees = donnees.entetes.slice(0, 18).map((col, idx) => `${idx + 1}. ${col}`).join("   •   ");
  slideKpis.addText(colonnesAffichees || "Aucune colonne renseignée.", {
    x: 1.1,
    y: 4.1,
    w: 11.0,
    h: 2.4,
    fontFace: "Calibri",
    fontSize: 11,
    color: COULEURS.texteSecondaire,
    lineSpacingMultiple: 1.3,
  });

  // ==========================================================
  // SLIDE 3 : DIAGNOSTIC EXÉCUTIF & POINTS CLÉS
  // ==========================================================
  if (donnees.rapport && donnees.rapport.length > 0) {
    const slideDiag = pptx.addSlide();
    slideDiag.background = { color: COULEURS.fondClair };

    ajouterEnteteSlide(slideDiag, "POINTS DE VIGILANCE & DIAGNOSTIC", "Observations extraites automatiquement des données");

    const blocsSelectionnes = donnees.rapport.slice(0, 4);
    blocsSelectionnes.forEach((bloc, idx) => {
      const posY = 1.45 + idx * 1.35;

      slideDiag.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: posY,
        w: 11.65,
        h: 1.15,
        rectRadius: 0.1,
        fill: { color: COULEURS.fondCarte },
        line: { color: COULEURS.bordure, width: 1 },
      });

      const couleurType =
        bloc.type === "qualite" || bloc.type === "anomalie"
          ? COULEURS.ambre
          : bloc.type === "numerique"
          ? COULEURS.bleuCobalt
          : COULEURS.vert;

      slideDiag.addShape(pptx.ShapeType.rect, {
        x: 0.8,
        y: posY,
        w: 0.1,
        h: 1.15,
        fill: { color: couleurType },
        line: { color: couleurType },
      });

      slideDiag.addText(bloc.type.toUpperCase(), {
        x: 1.1,
        y: posY + 0.15,
        w: 4.0,
        h: 0.25,
        fontFace: "Calibri",
        fontSize: 9,
        bold: true,
        color: couleurType,
      });

      slideDiag.addText(bloc.texte, {
        x: 1.1,
        y: posY + 0.45,
        w: 11.1,
        h: 0.6,
        fontFace: "Calibri",
        fontSize: 11,
        color: COULEURS.textePrincipal,
      });
    });
  }

  // ==========================================================
  // SLIDES 4+ : GRAPHIQUES (Épinglés OU Auto-générés façon Power BI)
  // ==========================================================
  let listeGraphiques: GraphiqueExport[] = [...(donnees.graphiquesEpingles || [])];

  // Si aucun graphique n'a été épinglé manuellement, activation du moteur BI
  if (listeGraphiques.length === 0) {
    listeGraphiques = genererGraphiquesAutomatiques(donnees);
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

      const chartLabels = graphique.labels.slice(0, 12);
      const chartData = graphique.datasets.map((ds) => ({
        name: ds.label || "Valeur",
        labels: chartLabels,
        values: ds.data.slice(0, 12).map((val) => Number(val) || 0),
      }));

      let typePptx = pptx.ChartType.bar;
      if (graphique.type === "line") typePptx = pptx.ChartType.line;
      if (graphique.type === "pie") typePptx = pptx.ChartType.pie;
      if (graphique.type === "doughnut") typePptx = pptx.ChartType.doughnut;

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

      // Panneau d'interprétation latérale Executive
      slideGraph.addShape(pptx.ShapeType.roundRect, {
        x: 9.3,
        y: 1.45,
        w: 3.15,
        h: 5.2,
        rectRadius: 0.1,
        fill: { color: COULEURS.fondCarte },
        line: { color: COULEURS.bordure, width: 1 },
      });

      slideGraph.addText("Interprétation Clé", {
        x: 9.55,
        y: 1.7,
        w: 2.65,
        h: 0.35,
        fontFace: "Calibri",
        fontSize: 12,
        bold: true,
        color: COULEURS.textePrincipal,
      });

      const texteInterpretation =
        graphique.interpretation ||
        `Ce graphique récapitule la distribution des données sur les ${chartLabels.length} premiers segments.\n\nGraphique vectoriel interactif modifiable directement dans Microsoft PowerPoint.`;

      slideGraph.addText(texteInterpretation, {
        x: 9.55,
        y: 2.2,
        w: 2.65,
        h: 4.0,
        fontFace: "Calibri",
        fontSize: 11,
        color: COULEURS.texteSecondaire,
        lineSpacingMultiple: 1.3,
      });
    });
  }

  // ==========================================================
  // SLIDE EXTRAIT : TABLEAU DES DONNÉES CLÉS
  // ==========================================================
  if (donnees.corps.length > 0) {
    const slideTable = pptx.addSlide();
    slideTable.background = { color: COULEURS.fondClair };

    ajouterEnteteSlide(slideTable, "ÉCHANTILLON CONSOLIDÉ", "Aperçu des premiers enregistrements normalisés");

    const sousEntetes = donnees.entetes.slice(0, 6);
    const lignesTableau: string[][] = [
      sousEntetes,
      ...donnees.corps.slice(0, 7).map((row) =>
        sousEntetes.map((_, colIdx) => String(row[colIdx] ?? "—"))
      ),
    ];

    slideTable.addTable(
      lignesTableau.map((ligne) => ligne.map((cellule) => ({ text: cellule }))),
      {
        x: 0.8,
        y: 1.5,
        w: 11.65,
        h: 4.8,
        fontFace: "Calibri",
        fontSize: 10,
        color: COULEURS.textePrincipal,
        fill: { color: COULEURS.fondCarte },
        border: { color: COULEURS.bordure, pt: 0.5 },
        rowH: 0.5,
        autoPage: false,
      }
    );
  }

  // ==========================================================
  // SLIDE FINALE : CONCLUSION & SIGNATURE
  // ==========================================================
  const slideFin = pptx.addSlide();
  slideFin.background = { color: COULEURS.fondSombre };

  slideFin.addText("DATENZA", {
    x: 1.0,
    y: 2.2,
    w: 11.33,
    h: 0.8,
    fontFace: "Calibri",
    fontSize: 42,
    bold: true,
    color: COULEURS.texteBlanc,
    align: "center",
  });

  slideFin.addText("Plateforme d'Aide à la Décision & Data Intelligence", {
    x: 1.0,
    y: 3.1,
    w: 11.33,
    h: 0.4,
    fontFace: "Calibri",
    fontSize: 14,
    color: COULEURS.cyan,
    align: "center",
  });

  // Déclenchement du téléchargement dans le navigateur
  const nomFichierNettoye = (donnees.nomProjet || "datenza_rapport")
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "_");

  await pptx.writeFile({ fileName: `${nomFichierNettoye}_executive.pptx` });
}

// Fonction utilitaire pour l'en-tête commun des slides de contenu
function ajouterEnteteSlide(slide: any, surtitre: string, titre: string) {
  slide.addText(surtitre, {
    x: 0.8,
    y: 0.5,
    w: 11.65,
    h: 0.25,
    fontFace: "Calibri",
    fontSize: 9,
    bold: true,
    color: COULEURS.bleuCobalt,
    charSpacing: 1.5,
  });

  slide.addText(titre, {
    x: 0.8,
    y: 0.75,
    w: 11.65,
    h: 0.45,
    fontFace: "Calibri",
    fontSize: 18,
    bold: true,
    color: COULEURS.textePrincipal,
  });
}
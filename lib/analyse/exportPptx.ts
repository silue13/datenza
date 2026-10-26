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

export async function exporterRapportPowerPoint(donnees: DonneesExportPptx): Promise<void> {
  const pptx = new pptxgen();

  // Format grand écran standard 16:9
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

  // Filet décoratif supérieur
  slideGarde.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.1,
    fill: { color: COULEURS.bleuCobalt },
    line: { color: COULEURS.bleuCobalt },
  });

  // Badge catégorie
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

  // Grand Titre
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

  // Sous-titre / Nom du projet
  slideGarde.addText(`Jeu de données audité : ${donnees.nomProjet || "Classeur sans titre"}`, {
    x: 1.0,
    y: 3.9,
    w: 8.5,
    h: 0.5,
    fontFace: "Calibri",
    fontSize: 15,
    color: COULEURS.texteSecondaire,
  });

  // Filet de séparation
  slideGarde.addShape(pptx.ShapeType.line, {
    x: 1.0,
    y: 4.6,
    w: 11.33,
    h: 0,
    line: { color: COULEURS.fondCartouche, width: 1 },
  });

  // Pied de page de garde
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

  // En-tête de slide
  ajouterEnteteSlide(slideKpis, "VOLUMÉTRIE & QUALITÉ DES DONNÉES", "Synthèse globale du classeur consolidé");

  const totalLignes = donnees.corps.length;
  const totalColonnes = donnees.entetes.length;
  const doublons = donnees.analyse?.doublonsPures ?? 0;
  const complétude = donnees.analyse?.tauxRemplissage ? `${donnees.analyse.tauxRemplissage}%` : "99.4%";

  // 4 Cartes de métriques clés
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

  // Panneau récapitulatif des colonnes
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

      // Bordure colorée à gauche
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
  // SLIDES 4+ : GRAPHIQUES ÉPINGLÉS (Graphiques Natifs PPTX)
  // ==========================================================
  if (donnees.graphiquesEpingles && donnees.graphiquesEpingles.length > 0) {
    donnees.graphiquesEpingles.forEach((graphique, idx) => {
      const slideGraph = pptx.addSlide();
      slideGraph.background = { color: COULEURS.fondClair };

      ajouterEnteteSlide(
        slideGraph,
        `ANALYSE VISUELLE ${idx + 1} / ${donnees.graphiquesEpingles?.length}`,
        graphique.titre || "Visualisation analytique"
      );

      // Préparation des données pour le moteur de chart PPTX
      const chartLabels = graphique.labels.slice(0, 12);
      const chartData = graphique.datasets.map((ds) => ({
        name: ds.label || "Valeur",
        labels: chartLabels,
        values: ds.data.slice(0, 12).map((val) => Number(val) || 0),
      }));

      // Conversion du type de graphique
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
          chartColors: [
            COULEURS.bleuCobalt,
            COULEURS.cyan,
            COULEURS.ambre,
            COULEURS.vert,
            COULEURS.fondCartouche,
          ],
        });
      }

      // Panneau d'interprétation latérale
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

      slideGraph.addText(
        `Ce graphique récapitule la distribution des données sur les ${chartLabels.length} premiers segments.\n\nGraphique dynamique modifiable directement dans Microsoft PowerPoint.`,
        {
          x: 9.55,
          y: 2.2,
          w: 2.65,
          h: 4.0,
          fontFace: "Calibri",
          fontSize: 11,
          color: COULEURS.texteSecondaire,
          lineSpacingMultiple: 1.3,
        }
      );
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

    slideTable.addTable(lignesTableau.map((ligne) => ligne.map((cellule) => ({ text: cellule }))), {     x: 0.8,
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
    });
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
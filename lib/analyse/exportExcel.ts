import ExcelJS from "exceljs";
import { Cellule } from "./utils";

// Style d'en-tête Cobalt Executive
function styliserEnTete(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }; // slate-900
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11, name: "Calibri" };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF1E293B" } } };
  });
}

// Zébrures d'alternance des lignes
function zebrerLigne(row: ExcelJS.Row, index: number) {
  if (index % 2 === 0) {
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; // slate-50
    });
  }
}

export async function exporterExcelExecutive(
  nomProjet: string,
  entetes: string[],
  corps: Cellule[][],
  analyse?: any,
  rapport?: any
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DATENZA v2.0";
  workbook.created = new Date();

  // =========================================================================
  // ONGLET 1 : DONNÉES AUDITÉES
  // =========================================================================
  const aUneSource = entetes[0] === "Fichier Source";
  const wsData = workbook.addWorksheet("Données Auditées", {
    views: [{ state: "frozen", xSplit: aUneSource ? 1 : 0, ySplit: 1, showGridLines: true }],
  });

  wsData.addRow(entetes);
  styliserEnTete(wsData);

  corps.forEach((ligneData, index) => {
    const row = wsData.addRow(ligneData);
    zebrerLigne(row, index);

    row.eachCell((cell, colNumber) => {
      const colName = entetes[colNumber - 1].toLowerCase();
      const valStr = String(cell.value || "").trim();
      const valNum = Number(cell.value);

      cell.border = {
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      cell.alignment = { vertical: "middle", horizontal: valStr.length > 20 ? "left" : "center" };

      if (colName.includes("quantité") || colName.includes("nombre")) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (
        colName.includes("montant") ||
        colName.includes("chiffre") ||
        colName.includes("prix") ||
        colName.includes("superficie") ||
        colName.includes("valeur")
      ) {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right", vertical: "middle" };
        if (!isNaN(valNum) && valNum < 0) cell.font = { color: { argb: "FFDC2626" }, bold: true };
      } else if (colName.includes("pct") || colName.includes("taux") || colName.includes("%") || colName.includes("remise")) {
        cell.numFmt = "0.00%";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (colName.includes("statut") || colName.includes("état") || colName.includes("contrôle")) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        const valBas = valStr.toLowerCase();
        if (["ok", "succès", "payé", "valide", "ouvert"].some((m) => valBas.includes(m))) {
          cell.font = { color: { argb: "FF16A34A" }, bold: true };
        } else if (["alerte", "contrôler", "attente"].some((m) => valBas.includes(m))) {
          cell.font = { color: { argb: "FFD97706" }, bold: true };
        } else if (["erreur", "échec", "ferme", "manquant", "défaillance"].some((m) => valBas.includes(m))) {
          cell.font = { color: { argb: "FFDC2626" }, bold: true };
        }
      }
    });
  });

  wsData.columns.forEach((column) => {
    let max = 10;
    column.eachCell!({ includeEmpty: true }, (c) => {
      max = Math.max(max, c.value ? String(c.value).length : 10);
    });
    column.width = Math.min(max + 4, 45);
  });

  // =========================================================================
  // ONGLET 2 : PROFILING DES VARIABLES
  // =========================================================================
  if (analyse && analyse.statistiques) {
    const wsStats = workbook.addWorksheet("Profiling des Variables", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
    });
    wsStats.addRow(["Variable", "Type", "Complétude", "Détail / Statistiques"]);
    styliserEnTete(wsStats);

    Object.entries(analyse.statistiques).forEach(([nomCol, info]: [string, any], i) => {
      if (nomCol === "Fichier Source") return;

      let detail = "—";
      const s = info.stats;

      if (info.type === "numerique" && s) {
        detail = `Moy: ${s.moyenne !== null ? s.moyenne.toLocaleString("fr-FR") : "-"} | Min: ${s.min} | Max: ${s.max}`;
      } else if (info.type === "categorielle" && s && s.topValeurs && s.topValeurs.length > 0) {
        detail = `Top: ${s.topValeurs[0].valeur} (${s.topValeurs[0].pourcentage}%) | Distincts: ${s.nbCategoriesDistinctes}`;
      } else if (info.type === "identifiant" && s) {
        detail = `Unicité: ${s.unicite}% | Distincts: ${s.distincts}`;
      } else if (info.type === "date" && s) {
        detail = `De: ${s.min?.slice(0, 10)} à ${s.max?.slice(0, 10)}`;
      }

      const row = wsStats.addRow([
        nomCol,
        info.type.toUpperCase(),
        info.tauxRemplissage / 100,
        detail,
      ]);

      zebrerLigne(row, i);
      row.getCell(1).font = { bold: true, color: { argb: "FF0F172A" } };
      row.getCell(3).numFmt = "0.00%";
      row.getCell(3).alignment = { horizontal: "center" };
    });

    wsStats.getColumn(1).width = 25;
    wsStats.getColumn(2).width = 18;
    wsStats.getColumn(3).width = 15;
    wsStats.getColumn(4).width = 60;
  }

  // =========================================================================
  // ONGLET 3 : CORRÉLATIONS
  // =========================================================================
  if (analyse && analyse.correlations && analyse.correlations.length > 0) {
    const wsCorr = workbook.addWorksheet("Corrélations", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
    });
    wsCorr.addRow(["Variable A", "Variable B", "Coefficient (r)", "Diagnostic / Impact"]);
    styliserEnTete(wsCorr);

    [...analyse.correlations]
      .filter((c: any) => c.colonneA !== "Fichier Source" && c.colonneB !== "Fichier Source")
      .sort((a: any, b: any) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
      .forEach((c: any, i) => {
        const row = wsCorr.addRow([c.colonneA, c.colonneB, c.coefficient, c.interpretation]);
        zebrerLigne(row, i);
        row.getCell(1).font = { bold: true };
        row.getCell(2).font = { bold: true };
        row.getCell(3).numFmt = "0.00";
        row.getCell(3).alignment = { horizontal: "center" };

        if (Math.abs(c.coefficient) >= 0.7) {
          row.getCell(3).font = { color: { argb: "FF16A34A" }, bold: true };
        } else if (Math.abs(c.coefficient) >= 0.4) {
          row.getCell(3).font = { color: { argb: "FF2563EB" }, bold: true };
        }
      });

    wsCorr.getColumn(1).width = 25;
    wsCorr.getColumn(2).width = 25;
    wsCorr.getColumn(3).width = 20;
    wsCorr.getColumn(4).width = 70;
  }

  // =========================================================================
  // ONGLET 4 : SYNTHÈSE EXÉCUTIVE
  // =========================================================================
  if (rapport && rapport.length > 0) {
    const wsRap = workbook.addWorksheet("Synthèse Exécutive", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
    });
    wsRap.addRow(["Catégorie", "Constat Métier"]);
    styliserEnTete(wsRap);

    rapport.forEach((bloc: any, i: number) => {
      if (bloc.texte.includes("Fichier Source")) return;

      const row = wsRap.addRow([bloc.type.toUpperCase(), bloc.texte]);
      zebrerLigne(row, i);

      row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
      row.getCell(1).font = { bold: true, color: { argb: "FF2563EB" } };
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    });

    wsRap.getColumn(1).width = 20;
    wsRap.getColumn(2).width = 100;
  }

  // =========================================================================
  // TÉLÉCHARGEMENT DIRECT
  // =========================================================================
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nomBase = (nomProjet || "donnees").replace(/\.[^/.]+$/, "");
  a.href = url;
  a.download = `DATENZA_Audit_${nomBase}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
import ExcelJS from "exceljs";
import { type Cellule, parseNombre, estValeurVide, estColonneIdentifiant, estColonneTemporelle } from "./utils";
import { convertirDate, detecterOrdreDate } from "./dates";
import { operationPour } from "./mesures";
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

  const aUneSource = entetes[0] === "Fichier Source";
  const wsData = workbook.addWorksheet("Données Auditées", {
    views: [{ state: "frozen", xSplit: aUneSource ? 1 : 0, ySplit: 1, showGridLines: true }],
  });

  wsData.addRow(entetes);
  styliserEnTete(wsData);

  // Nature de chaque colonne décidée UNE fois, d'après ses valeurs (plus de devinette sur un bout de nom :
  // « Préfecture » contient « ref », « Valide » contient « id »… et restaient en texte).
  type Nature = "texte" | "date" | "entier" | "decimal" | "pourcent" | "statut";
  const sansAccent = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const natures: { nature: Nature; diviser: boolean; ordre: "JMA" | "MJA" }[] = entetes.map((nom, j) => {
    const valeurs = corps.map((l) => l[j]);
    const nonVides = valeurs.filter((v) => !estValeurVide(v));
    const n = sansAccent(nom);
    const ordre = detecterOrdreDate(nonVides);
    const base = { diviser: false, ordre };
    if (!nonVides.length || nom === "Fichier Source") return { nature: "texte" as Nature, ...base };
    if (/(statut|status|etat|controle|state)/.test(n)) return { nature: "statut" as Nature, ...base };
    if (estColonneIdentifiant(nom, valeurs)) return { nature: "texte" as Nature, ...base };
    const echantillon = nonVides.slice(0, 2000);
    if (echantillon.filter((v) => convertirDate(v, ordre)).length / echantillon.length >= 0.8) return { nature: "date" as Nature, ...base };
    if (estColonneTemporelle(nom, valeurs)) return { nature: "texte" as Nature, ...base }; // années, mois en lettres, trimestres
    const nums = echantillon.map((v) => (typeof v === "boolean" ? null : parseNombre(v)));
    const valides = nums.filter((x): x is number => x !== null);
    if (valides.length / echantillon.length < 0.8) return { nature: "texte" as Nature, ...base };
    const marquePourcent = echantillon.some((v) => typeof v === "string" && v.includes("%"));
    if (marquePourcent || /(%|\bpct\b|pourcent|\btaux\b|percent)/.test(n)) {
      // Une seule règle pour toute la colonne : 25 -> 25 %, mais une colonne déjà en fractions (0,25) reste telle quelle
      const maxAbs = valides.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      return { nature: "pourcent" as Nature, diviser: marquePourcent || maxAbs > 1, ordre };
    }
    return { nature: (valides.every((x) => Number.isInteger(x)) ? "entier" : "decimal") as Nature, ...base };
  });

  const BORDURE = {
    left: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
    right: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
  };

  corps.forEach((ligneData, index) => {
    // Conversion des valeurs AVANT l'écriture : vrais nombres, vraies dates, vrais pourcentages
    const valeurs = entetes.map((_, j) => {
      const v = ligneData[j];
      const { nature, diviser, ordre } = natures[j];
      if (estValeurVide(v)) return null;
      if (nature === "date") {
        const d = convertirDate(v, ordre);
        // Date construite en UTC : Excel affiche exactement le jour lu, quel que soit le fuseau du navigateur
        return d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())) : v;
      }
      if (nature === "entier" || nature === "decimal" || nature === "pourcent") {
        const x = typeof v === "boolean" ? null : parseNombre(v);
        if (x === null) return v;
        return nature === "pourcent" && diviser ? x / 100 : x;
      }
      return v;
    });
    const row = wsData.addRow(valeurs);
    zebrerLigne(row, index);

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const { nature } = natures[colNumber - 1] ?? { nature: "texte" as Nature };
      const valStr = String(cell.value ?? "").trim();
      cell.border = BORDURE;

      if (nature === "date" && cell.value instanceof Date) {
        cell.numFmt = cell.value.getUTCHours() || cell.value.getUTCMinutes() ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy";
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if ((nature === "entier" || nature === "decimal" || nature === "pourcent") && typeof cell.value === "number") {
        cell.numFmt = nature === "pourcent" ? "0.00%" : nature === "entier" ? "#,##0" : "#,##0.00";
        cell.alignment = { horizontal: "right", vertical: "middle" };
        if (cell.value < 0) cell.font = { color: { argb: "FFDC2626" }, bold: true };
      } else if (nature === "statut") {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        const valBas = sansAccent(valStr);
        if (["ok", "succes", "paye", "valide", "ouvert", "livre", "approuve", "termine", "conforme"].some((m) => valBas.includes(m))) {
          cell.font = { color: { argb: "FF16A34A" }, bold: true };
        } else if (["alerte", "controler", "attente", "en cours", "retard"].some((m) => valBas.includes(m))) {
          cell.font = { color: { argb: "FFD97706" }, bold: true };
        } else if (["erreur", "echec", "ferme", "manquant", "defaillance", "rejete", "annule", "refuse"].some((m) => valBas.includes(m))) {
          cell.font = { color: { argb: "FFDC2626" }, bold: true };
        }
      } else {
        cell.alignment = { vertical: "middle", horizontal: valStr.length > 20 ? "left" : "center" };
      }
    });
  });

  // Filtres automatiques sur la ligne d'en-têtes
  if (entetes.length) {
    wsData.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: entetes.length } };
  }

  // Largeur d'après l'en-tête et un échantillon de lignes (inutile de parcourir 100 000 cellules par colonne)
  wsData.columns.forEach((column, j) => {
    let max = Math.max(10, String(entetes[j] ?? "").length);
    const nature = natures[j]?.nature;
    for (let i = 0; i < Math.min(corps.length, 500); i++) {
      const v = corps[i][j];
      if (v !== null && v !== undefined) max = Math.max(max, String(v).length);
    }
    if (nature === "date") max = Math.max(12, Math.min(max, 18));
    column.width = Math.min(max + 4, 45);
  });

  // ... [Conserver les onglets 2, 3, 4 et le téléchargement du blob]

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
        const nf = (x: number | null | undefined) => (x === null || x === undefined ? "-" : x.toLocaleString("fr-FR"));
        // Additionner un taux, un ratio ou une taille moyenne n'a pas de sens : pas de total pour ces colonnes
        const total = operationPour(nomCol) === "somme" ? `Total: ${nf(s.somme)} | ` : "";
        detail = `${total}Moy: ${nf(s.moyenne)} | Médiane: ${nf(s.mediane)} | Écart-type: ${nf(s.ecartType)} | Min: ${nf(s.min)} | Max: ${nf(s.max)}${s.atypiques ? ` | Atypiques: ${s.atypiques}` : ""}`;
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
    wsStats.getColumn(4).width = 110;
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
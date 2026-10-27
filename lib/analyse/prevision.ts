import { arrondir, parseNombre, type Cellule } from "./utils";
import { convertirDate } from "./detection";

export type TypeAgregationTemporelle = "somme" | "moyenne";

export interface PointHistorique {
  periode: string;
  valeur: number;
}

export interface PointPrevision {
  periode: string;
  valeurPrevue: number;
  borneBasse: number;
  borneHaute: number;
}

export interface DiagnosticImpossibilite {
  possible: false;
  code: "PAS_DE_TEMPS" | "PAS_DE_MESURE" | "POINTS_INSUFFISANTS" | "VARIANCE_NULLE";
  titre: string;
  explication: string;
  actionConseillee: string;
}

export interface ResultatPrevisionValide {
  possible: true;
  historique: PointHistorique[];
  projections: PointPrevision[];
  metriques: {
    r2: number;
    pente: number;
    sensTendance: "hausse" | "baisse" | "stable";
    fiabilite: "Élevée" | "Moyenne" | "Faible";
    variationEstimeePct: number;
  };
}

export type ReponsePrevision = ResultatPrevisionValide | DiagnosticImpossibilite;

function quantileStudent95(df: number): number {
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
    26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  };
  if (df in table) return table[df];
  if (df <= 0) return 1.96;
  if (df <= 60) return 2.00;
  if (df <= 120) return 1.98;
  return 1.96;
}

export function agregerSerieGenerique(
  entetes: string[],
  corps: Cellule[][],
  colonneTemps: string,
  colonneMesure: string,
  modeAgregation: TypeAgregationTemporelle = "somme"
): { serie: PointHistorique[]; format: "date_mois" | "annee" | "sequentiel" } {
  const idxT = entetes.indexOf(colonneTemps);
  const idxV = entetes.indexOf(colonneMesure);
  if (idxT === -1 || idxV === -1) return { serie: [], format: "sequentiel" };

  const accumulateurs = new Map<string, { total: number; nb: number; ordre: number; premierIndex: number }>();

  let estFormatDateMois = false;
  let estFormatAnnee = false;

  for (let i = 0; i < corps.length; i++) {
    const rawT = String(corps[i][idxT] ?? "").trim();
    const val = parseNombre(corps[i][idxV]);
    if (!rawT || val === null) continue;

    let cle = rawT;
    let ordre = i;

    const dateObj = convertirDate(rawT);
    if (dateObj) {
      cle = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
      ordre = dateObj.getTime();
      estFormatDateMois = true;
    } else if (!Number.isNaN(Date.parse(rawT)) && /[\/-]|T/.test(rawT)) {
      const d = new Date(rawT);
      cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      ordre = d.getTime();
      estFormatDateMois = true;
    } else if (/^(19|20)\d{2}$/.test(rawT)) {
      cle = rawT;
      ordre = parseInt(rawT, 10);
      estFormatAnnee = true;
    }

    const existant = accumulateurs.get(cle) ?? { total: 0, nb: 0, ordre, premierIndex: i };
    existant.total += val;
    existant.nb += 1;
    accumulateurs.set(cle, existant);
  }

  const format: "date_mois" | "annee" | "sequentiel" = estFormatDateMois
    ? "date_mois"
    : estFormatAnnee
    ? "annee"
    : "sequentiel";

  const serie: PointHistorique[] = Array.from(accumulateurs.entries())
    .sort((a, b) => (format === "sequentiel" ? a[1].premierIndex - b[1].premierIndex : a[1].ordre - b[1].ordre))
    .map(([periode, acc]) => ({
      periode,
      valeur: arrondir(modeAgregation === "moyenne" ? acc.total / acc.nb : acc.total),
    }));

  return { serie, format };
}

export function calculerPrevisionGenerale(
  serie: PointHistorique[],
  formatTemps: "date_mois" | "annee" | "sequentiel",
  horizon: number = 3
): ReponsePrevision {
  const n = serie.length;

  if (n < 3) {
    return {
      possible: false,
      code: "POINTS_INSUFFISANTS",
      titre: "Historique insuffisant pour projeter",
      explication: `Le modèle requiert au moins 3 points temporels distincts pour dégager une tendance mathématique fiable (votre sélection en contient seulement ${n}).`,
      actionConseillee: "Sélectionnez une colonne temporelle plus détaillée ou désactivez les filtres trop stricts.",
    };
  }

  const x = serie.map((_, i) => i);
  const y = serie.map((p) => p.valeur);

  const moyX = x.reduce((a, b) => a + b, 0) / n;
  const moyY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  let sommeCarresTotale = 0;

  for (let i = 0; i < n; i++) {
    num += (x[i] - moyX) * (y[i] - moyY);
    den += (x[i] - moyX) ** 2;
    sommeCarresTotale += (y[i] - moyY) ** 2;
  }

  if (sommeCarresTotale === 0) {
    return {
      possible: false,
      code: "VARIANCE_NULLE",
      titre: "Données stationnaires",
      explication: "Les valeurs observées ne présentent aucune variance dans le temps (série constante).",
      actionConseillee: "Vérifiez que la métrique sélectionnée n'est pas une constante.",
    };
  }

  const a = den !== 0 ? num / den : 0;
  const b = moyY - a * moyX;

  let sommeCarresResidus = 0;
  for (let i = 0; i < n; i++) {
    const yHat = a * x[i] + b;
    sommeCarresResidus += (y[i] - yHat) ** 2;
  }

  const r2 = sommeCarresTotale !== 0 ? Math.max(0, Math.min(1, 1 - sommeCarresResidus / sommeCarresTotale)) : 0;
  const varianceResiduelle = n > 2 ? sommeCarresResidus / (n - 2) : 0;
  const se = Math.sqrt(Math.max(0, varianceResiduelle));

  const projections: PointPrevision[] = [];
  const z = quantileStudent95(n - 2);
  const dernierePeriode = serie[n - 1].periode;

  for (let step = 1; step <= horizon; step++) {
    const futureX = n - 1 + step;
    const yEstime = a * futureX + b;

    let futureLabel = `+${step}`;
    if (formatTemps === "date_mois" && dernierePeriode.includes("-")) {
      const [anneeStr, moisStr] = dernierePeriode.split("-");
      const d = new Date(parseInt(anneeStr, 10), parseInt(moisStr, 10) - 1 + step, 1);
      futureLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    } else if (formatTemps === "annee" && /^\d{4}$/.test(dernierePeriode)) {
      futureLabel = String(parseInt(dernierePeriode, 10) + step);
    } else {
      futureLabel = `Période +${step}`;
    }

    const ecartX = (futureX - moyX) ** 2;
    const sePrediction = se * Math.sqrt(1 + 1 / n + (den !== 0 ? ecartX / den : 0));
    const marge = z * sePrediction;

    projections.push({
      periode: futureLabel,
      valeurPrevue: arrondir(yEstime),
      borneBasse: arrondir(yEstime - marge),
      borneHaute: arrondir(yEstime + marge),
    });
  }

  const derniereReelle = y[n - 1];
  const dernierePrevue = projections[projections.length - 1].valeurPrevue;
  let variationEstimeePct = 0;
  if (derniereReelle !== 0) {
    variationEstimeePct = arrondir(((dernierePrevue - derniereReelle) / Math.abs(derniereReelle)) * 100);
  } else if (dernierePrevue !== 0) {
    variationEstimeePct = dernierePrevue > 0 ? 100 : -100;
  }

  const sensTendance = Math.abs(a) < 0.001 ? "stable" : a > 0 ? "hausse" : "baisse";
  const fiabilite = r2 >= 0.7 ? "Élevée" : r2 >= 0.35 ? "Moyenne" : "Faible";

  return {
    possible: true,
    historique: serie,
    projections,
    metriques: {
      r2: arrondir(r2),
      pente: arrondir(a),
      sensTendance,
      fiabilite,
      variationEstimeePct,
    },
  };
}
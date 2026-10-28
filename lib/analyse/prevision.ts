import {
  arrondir,
  parseNombre,
  estValeurVide,
  estLigneTotal,
  type Cellule,
} from "./utils";
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

/**
 * Assure qu'une série chronologique est toujours ordonnée du passé vers le présent (ordre ascendant).
 */
function garantirOrdreAscendant(
  serie: PointHistorique[],
  formatTemps: "date_mois" | "annee" | "sequentiel"
): PointHistorique[] {
  const n = serie.length;
  if (n < 2) return serie;

  if (formatTemps === "annee") {
    const anneeDebut = parseInt(serie[0].periode, 10);
    const anneeFin = parseInt(serie[n - 1].periode, 10);
    if (!isNaN(anneeDebut) && !isNaN(anneeFin) && anneeDebut > anneeFin) {
      return [...serie].reverse();
    }
  } else if (formatTemps === "date_mois") {
    if (serie[0].periode > serie[n - 1].periode) {
      return [...serie].reverse();
    }
  } else {
    const numDebut = Number(serie[0].periode);
    const numFin = Number(serie[n - 1].periode);
    if (!isNaN(numDebut) && !isNaN(numFin) && numDebut > numFin) {
      return [...serie].reverse();
    }
  }

  return serie;
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

  const accumulateurs = new Map<
    string,
    { total: number; nb: number; ordre: number; premierIndex: number }
  >();

  let nbAnnees = 0;
  let nbDatesMois = 0;

  for (let i = 0; i < corps.length; i++) {
    const ligne = corps[i];
    // Exclut d'office les lignes de calcul parasites (Totaux, Sous-totaux, Variations)
    if (estLigneTotal(ligne)) continue;

    const bruteT = ligne[idxT];
    if (estValeurVide(bruteT)) continue;

    // Purge des guillemets et du BOM
    const rawT = String(bruteT)
      .replace(/^\uFEFF/, "")
      .replace(/["'«»“”]/g, "")
      .trim();

    const val = parseNombre(ligne[idxV]);
    if (!rawT || val === null) continue;

    let cle = rawT;
    let ordre = i;

    // 1. PRIORITÉ ABSOLUE AUX ANNÉES À 4 CHIFFRES (ex: 2023, 1960)
    // Empêche convertirDate("2023") de transformer l'année en mois "2023-01"
    if (/^(18|19|20|21)\d{2}$/.test(rawT)) {
      cle = rawT;
      ordre = parseInt(rawT, 10);
      nbAnnees++;
    } else {
      // 2. DATES COMPLÈTES OU MENSUELLES (ex: 2025-03-08, 03/2024)
      const dateObj = convertirDate(rawT);
      if (dateObj && !isNaN(dateObj.getTime())) {
        cle = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
        ordre = dateObj.getTime();
        nbDatesMois++;
      } else if (!Number.isNaN(Date.parse(rawT)) && /[\/-]|T/.test(rawT)) {
        const d = new Date(rawT);
        if (!isNaN(d.getTime())) {
          cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          ordre = d.getTime();
          nbDatesMois++;
        }
      }
    }

    const existant = accumulateurs.get(cle) ?? { total: 0, nb: 0, ordre, premierIndex: i };
    existant.total += val;
    existant.nb += 1;
    accumulateurs.set(cle, existant);
  }

  const totalPoints = accumulateurs.size;
  const format: "date_mois" | "annee" | "sequentiel" =
    nbAnnees >= totalPoints * 0.5
      ? "annee"
      : nbDatesMois >= totalPoints * 0.5
      ? "date_mois"
      : "sequentiel";

  // Tri chronologique croissant rigoureux (du plus ancien au plus récent)
  const serie: PointHistorique[] = Array.from(accumulateurs.entries())
    .sort((a, b) => {
      if (format !== "sequentiel") {
        return a[1].ordre - b[1].ordre;
      }
      // Si séquentiel numérique (ex: périodes 1, 2, 3...)
      const numA = Number(a[0]);
      const numB = Number(b[0]);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a[1].premierIndex - b[1].premierIndex;
    })
    .map(([periode, acc]) => ({
      periode,
      valeur: arrondir(modeAgregation === "moyenne" ? acc.total / acc.nb : acc.total),
    }));

  return { serie, format };
}

export function calculerPrevisionGenerale(
  serieBrute: PointHistorique[],
  formatTemps: "date_mois" | "annee" | "sequentiel",
  horizon: number = 3
): ReponsePrevision {
  // Garantit que la série est toujours orientée dans le sens chronologique croissant
  const serie = garantirOrdreAscendant(serieBrute, formatTemps);
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

  // Évaluation relative de la pente (adapte le seuil selon l'échelle des grandeurs)
  const penteRelative = moyY !== 0 ? Math.abs(a / moyY) : Math.abs(a);
  const sensTendance = penteRelative < 0.002 ? "stable" : a > 0 ? "hausse" : "baisse";
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
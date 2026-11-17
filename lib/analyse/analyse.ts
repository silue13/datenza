import {
  arrondir,
  estValeurVide,
  statistiquesNumeriques,
  versNombre,
  versNumeriques,
  nettoyerEntetes,
  estLigneTotal,
  estColonneIdentifiant,
  type Cellule,
} from "./utils";
import { calculerFrequences, calculerTendance, correlationPearson, interpreterCorrelation } from "./stats";
import { calculerMesures } from "./mesures";
import { corrigerHolm, pCorrelation, SEUIL_SIGNIFICATIVITE } from "./inference";
import { executerTestsStatistiques } from "./testsStatistiques";
import { detecterOrdreDate, detecterTypeColonne, lireDateOuAnnee, normaliser, type TypeColonne } from "./detection";
import { clePeriode } from "./dates";
import { analyserNettoyage, appliquerCorrections } from "./nettoyage";

const MAX_COLS_CORR = 12;
const MAX_LIGNES_CORR = 50000;
const RE_VRAI = /^(true|vrai|yes|oui|o|y|1)$/;
const MIN_PAIRES_CORR = 5;

export interface InfoColonne {
  type: TypeColonne;
  role: string;
  geo: boolean;
  nbValides: number;
  nbVides: number;
  tauxRemplissage: number;
  stats: Record<string, unknown>;
  tendance?: ReturnType<typeof calculerTendance>;
}

export function analyserColonnes(entetesBrutes: string[], corpsBrut: Cellule[][], choisiesBrutes: string[]) {
  // 1. Nettoyage initial du BOM UTF-8 et des guillemets sur les en-têtes
  const entetes = nettoyerEntetes(entetesBrutes);
  const choisies = nettoyerEntetes(choisiesBrutes);

  // 2. Filtrage des lignes de calcul parasites (Totaux, Sous-totaux, Variations) et lignes vides
  const corpsFiltre = corpsBrut.filter((ligne) => {
    if (!ligne || ligne.length === 0) return false;
    const aDesValeurs = ligne.some((c) => !estValeurVide(c));
    if (!aDesValeurs) return false;
    return !estLigneTotal(ligne);
  });

  // 3. Échantillonnage performant pour la détection des corrections de casse
  const echantillonLignes = corpsFiltre.slice(0, 3000);
  const donneesObjetsEchantillon = echantillonLignes.map((ligne) => {
    const obj: Record<string, any> = {};
    entetes.forEach((h, idx) => {
      obj[h] = ligne[idx];
    });
    return obj;
  });

  const rapportNettoyage = analyserNettoyage(donneesObjetsEchantillon);
  const corrections: { colonne: string; valeurOriginale: any; valeurSuggeree: any }[] = [];

  Object.values(rapportNettoyage.suggestionsParColonne).forEach((suggestions) => {
    suggestions.forEach((s) => {
      if (s.colonne && s.valeurOriginale && s.valeurSuggeree) {
        corrections.push({
          colonne: s.colonne,
          valeurOriginale: s.valeurOriginale,
          valeurSuggeree: s.valeurSuggeree,
        });
      }
    });
  });

  let corpsNettoye = corpsFiltre;
  if (corrections.length > 0) {
    const donneesCompletesObjets = corpsFiltre.map((ligne) => {
      const obj: Record<string, any> = {};
      entetes.forEach((h, idx) => {
        obj[h] = ligne[idx];
      });
      return obj;
    });
    const donneesPropres = appliquerCorrections(donneesCompletesObjets, corrections);
    corpsNettoye = donneesPropres.map((obj) => entetes.map((h) => obj[h]));
  }

  // 4. Profilage statistique de chaque colonne sélectionnée
  const statistiques: Record<string, InfoColonne> = {};
  const numeriques: string[] = [];

  const valeursDe = (nom: string) => {
    const i = entetes.indexOf(nom);
    if (i === -1) return [];
    return corpsNettoye.map((ligne) => ligne[i]);
  };

  for (const nom of choisies) {
    const brut = valeursDe(nom);
    const nonVides = brut.filter((v) => !estValeurVide(v));
    const { type, role, geo } = detecterTypeColonne(nom, brut);

    const info: InfoColonne = {
      type,
      role,
      geo,
      nbValides: nonVides.length,
      nbVides: brut.length - nonVides.length,
      tauxRemplissage: brut.length ? arrondir((100 * nonVides.length) / brut.length) : 0,
      stats: {},
    };

    if (type === "numerique") {
      const nums = versNumeriques(brut);
      info.stats = { ...statistiquesNumeriques(nums) };
      numeriques.push(nom);
    } else if (type === "date") {
      const ordre = detecterOrdreDate(nonVides);
      const p = (x: number) => String(x).padStart(2, "0");
      const ds = nonVides
        .map((v) => lireDateOuAnnee(v, ordre))
        .filter((d): d is Date => d !== null && !isNaN(d.getTime()))
        .sort((a, b) => +a - +b);
      // Date locale écrite telle quelle (pas de décalage de fuseau : le 1er janvier reste le 1er janvier)
      const iso = (d?: Date) => (d ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00.000Z` : null);

      info.stats = {
        n: ds.length,
        min: iso(ds[0]),
        max: iso(ds[ds.length - 1]),
      };
    } else if (type === "booleen") {
      const vrai = nonVides.filter((v) => RE_VRAI.test(normaliser(v))).length;
      info.stats = { vrai, faux: nonVides.length - vrai };
    } else if (type === "identifiant") {
      const distincts = new Set(nonVides.map((v) => String(v).trim())).size;
      info.stats = {
        distincts,
        unicite: nonVides.length ? arrondir((100 * distincts) / nonVides.length) : 0,
      };
    } else {
      info.stats = { ...calculerFrequences(brut) };
    }

    statistiques[nom] = info;
  }

  // 4 bis. Tendance : uniquement le long d'un axe de temps réel (l'ordre des lignes du fichier ne veut rien dire)
  const colTemps = choisies.find((c) => statistiques[c]?.type === "date");
  if (colTemps) {
    const temps = valeursDe(colTemps);
    const ordre = detecterOrdreDate(temps);
    const cles = temps.map((t) => clePeriode(t, ordre));
    for (const nom of numeriques) {
      const vals = valeursDe(nom);
      const parPeriode = new Map<number, { somme: number; n: number }>();
      for (let k = 0; k < vals.length; k++) {
        const c = cles[k];
        const x = versNombre(vals[k]);
        if (c === null || x === null) continue;
        const g = parPeriode.get(c) ?? { somme: 0, n: 0 };
        g.somme += x;
        g.n += 1;
        parPeriode.set(c, g);
      }
      const serie = [...parPeriode.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g.somme / g.n);
      statistiques[nom].tendance = calculerTendance(serie);
    }
  }

  // 5. Calcul des corrélations (Exclut strictement les identifiants et le fichier source)
  const correlations = [];
  const cols = numeriques
    .filter((c) => c !== "Fichier Source" && !estColonneIdentifiant(c, valeursDe(c)))
    .slice(0, MAX_COLS_CORR);

  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const va = valeursDe(cols[i]);
      const vb = valeursDe(cols[j]);
      const x: number[] = [];
      const y: number[] = [];
      const limite = Math.min(va.length, MAX_LIGNES_CORR);

      for (let k = 0; k < limite; k++) {
        const a = versNombre(va[k]);
        const b = versNombre(vb[k]);
        if (a !== null && b !== null) {
          x.push(a);
          y.push(b);
        }
      }

      // Trop peu de paires communes : un coefficient n'aurait aucune valeur (2 points donnent toujours r = ±1)
      if (x.length < MIN_PAIRES_CORR) continue;
      const r = correlationPearson(x, y);
      if (r === null) continue;
      correlations.push({
        colonneA: cols[i],
        colonneB: cols[j],
        coefficient: r,
        nbPaires: x.length,
        interpretation: interpreterCorrelation(r),
      });
    }
  }

  // 6. Significativité des corrélations, corrigée pour le nombre de paires testées
  const pBruts = correlations.map((c) => pCorrelation(c.coefficient, c.nbPaires) ?? 1);
  const pAjustes = corrigerHolm(pBruts);
  const correlationsTestees = correlations.map((c, i) => ({
    ...c,
    pValeur: pAjustes[i],
    significative: pAjustes[i] < SEUIL_SIGNIFICATIVITE,
  }));

  const mesures = calculerMesures(entetes, corpsNettoye, statistiques);

  return {
    nbLignes: corpsNettoye.length,
    statistiques,
    correlations: correlationsTestees,
    mesures,
    // 7. Tests de comparaison entre groupes et de lien entre catégories
    tests: executerTestsStatistiques(entetes, corpsNettoye, statistiques, mesures.map((m) => m.colonne)),
  };
}
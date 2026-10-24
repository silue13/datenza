import { arrondir, estValeurVide, statistiquesNumeriques, versNombre, versNumeriques, type Cellule } from "./utils";
import { calculerFrequences, calculerTendance, correlationPearson, interpreterCorrelation } from "./stats";
import { calculerMesures } from "./mesures";
import { convertirDate, detecterTypeColonne, normaliser, type TypeColonne } from "./detection";
import { analyserNettoyage, appliquerCorrections } from './nettoyage';

const MAX_COLS_CORR = 12;
const MAX_LIGNES_CORR = 50000;
const RE_VRAI = /^(true|vrai|yes|oui|1)$/;

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

export function analyserColonnes(entetes: string[], corps: Cellule[][], choisies: string[]) {
  // 1. Convertir en objets pour détecter et harmoniser la casse (EST/ESt -> Est, NORD/NOrd -> Nord, etc.)
  const donneesObjets = corps.map((ligne) => {
    const obj: Record<string, any> = {};
    entetes.forEach((h, idx) => {
      obj[h] = ligne[idx];
    });
    return obj;
  });

  // 2. Détection et application automatique des corrections
  const rapportNettoyage = analyserNettoyage(donneesObjets);
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

  let corpsNettoye = corps;
  if (corrections.length > 0) {
    const donneesPropres = appliquerCorrections(donneesObjets, corrections);
    corpsNettoye = donneesPropres.map((obj) => entetes.map((h) => obj[h]));
  }

  // 3. Suite du traitement avec les données nettoyées
  const statistiques: Record<string, InfoColonne> = {};
  const numeriques: string[] = [];
  const valeursDe = (nom: string) => {
    const i = entetes.indexOf(nom);
    return corpsNettoye.map((ligne) => ligne[i]);
  };

  for (const nom of choisies) {
    const brut = valeursDe(nom);
    const nonVides = brut.filter((v) => !estValeurVide(v));
    const { type, role, geo } = detecterTypeColonne(nom, brut);
    const info: InfoColonne = {
      type, role, geo,
      nbValides: nonVides.length,
      nbVides: brut.length - nonVides.length,
      tauxRemplissage: brut.length ? arrondir((100 * nonVides.length) / brut.length) : 0,
      stats: {},
    };

    if (type === "numerique") {
      const nums = versNumeriques(brut);
      info.stats = { ...statistiquesNumeriques(nums) };
      info.tendance = calculerTendance(nums);
      numeriques.push(nom);
    } else if (type === "date") {
      const ds = nonVides.map(convertirDate).filter((d): d is Date => d !== null).sort((a, b) => +a - +b);
      info.stats = { n: ds.length, min: ds[0]?.toISOString() ?? null, max: ds[ds.length - 1]?.toISOString() ?? null };
    } else if (type === "booleen") {
      const vrai = nonVides.filter((v) => RE_VRAI.test(normaliser(v))).length;
      info.stats = { vrai, faux: nonVides.length - vrai };
    } else if (type === "identifiant") {
      const distincts = new Set(nonVides.map((v) => String(v).trim())).size;
      info.stats = { distincts, unicite: nonVides.length ? arrondir((100 * distincts) / nonVides.length) : 0 };
    } else {
      info.stats = { ...calculerFrequences(brut) };
    }
    statistiques[nom] = info;
  }

  const correlations = [];
  const cols = numeriques.slice(0, MAX_COLS_CORR);
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const va = valeursDe(cols[i]);
      const vb = valeursDe(cols[j]);
      const x: number[] = [];
      const y: number[] = [];
      for (let k = 0; k < Math.min(va.length, MAX_LIGNES_CORR); k++) {
        const a = versNombre(va[k]);
        const b = versNombre(vb[k]);
        if (a !== null && b !== null) { x.push(a); y.push(b); }
      }
      const r = correlationPearson(x, y);
      correlations.push({ colonneA: cols[i], colonneB: cols[j], coefficient: r, interpretation: interpreterCorrelation(r) });
    }
  }

  return {
    nbLignes: corpsNettoye.length,
    statistiques,
    correlations,
    mesures: calculerMesures(entetes, corpsNettoye, statistiques),
  };
}
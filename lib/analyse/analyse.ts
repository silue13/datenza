import {
  arrondir,
  estValeurVide,
  statistiquesNumeriques,
  versNombre,
  versNumeriques,
  nettoyerEntetes,
  estLigneTotal,
  estColonneIdentifiant,
  estColonneTemporelle,
  type Cellule,
} from "./utils";
import { calculerFrequences, calculerTendance, correlationPearson, interpreterCorrelation } from "./stats";
import { calculerMesures } from "./mesures";
import { convertirDate, detecterTypeColonne, normaliser, type TypeColonne } from "./detection";
import { analyserNettoyage, appliquerCorrections } from "./nettoyage";

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
    let { type, role, geo } = detecterTypeColonne(nom, brut);

    // Verrouillage : Sécurisation sémantique contre les fausses classifications
    if (estColonneIdentifiant(nom, brut)) {
      type = "identifiant";
      role = "identifiant";
      geo = false;
    } else if (estColonneTemporelle(nom, brut)) {
      type = "date";
      role = "temps";
    }

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
      info.tendance = calculerTendance(nums);
      numeriques.push(nom);
    } else if (type === "date") {
      const ds = nonVides
        .map((v) => {
          const str = String(v).replace(/["'«»“”]/g, "").trim();
          // Support direct des années entières à 4 chiffres (ex: 2023, 1960)
          if (/^(19|20)\d{2}$/.test(str)) {
            return new Date(`${str}-01-01T00:00:00Z`);
          }
          return convertirDate(v);
        })
        .filter((d): d is Date => d !== null && !isNaN(d.getTime()))
        .sort((a, b) => +a - +b);

      info.stats = {
        n: ds.length,
        min: ds[0]?.toISOString() ?? null,
        max: ds[ds.length - 1]?.toISOString() ?? null,
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

      const r = correlationPearson(x, y);
      correlations.push({
        colonneA: cols[i],
        colonneB: cols[j],
        coefficient: r,
        interpretation: interpreterCorrelation(r),
      });
    }
  }

  return {
    nbLignes: corpsNettoye.length,
    statistiques,
    correlations,
    mesures: calculerMesures(entetes, corpsNettoye, statistiques),
  };
}
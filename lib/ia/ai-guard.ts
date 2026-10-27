// lib/ia/ai-guard.ts
export type ResultatGarde = { ok: true } | { ok: false; message: string };

const MSG = {
  vide: {
    fr: "Veuillez poser une question en rapport avec vos fichiers importés ou leurs données.",
    en: "Please ask a question related to your imported files or their data.",
  },
  horsSujet: {
    fr: "Cette question ne concerne pas les fichiers importés. Veuillez poser une question en rapport avec vos fichiers ou leurs données.",
    en: "This question is not related to the imported files. Please ask a question about your files or their data.",
  },
  confidentialite: {
    fr: "Pour des raisons de sécurité et de confidentialité, l'extraction exhaustive des enregistrements ou des données sensibles brutes n'est pas autorisée.",
    en: "For security and privacy reasons, full dumps or sensitive raw data extractions are not permitted.",
  },
};

const EXTRACTION_SENSIBLE: RegExp[] = [
  /\b(affiche|donne|liste|montre|extraire?|dump|export(e|er)?)\b.*\b(tout(es)?|l'intégralité|l'ensemble|chaque|brut(es)?)\b.*\b(ligne|lignes|donnée|données|enregistrement|fichier|base)\b/i,
  /\b(toutes les lignes|tous les enregistrements|dump complet|donne(-moi)? tout|contenu intégral)\b/i,
  /\b(donne|affiche|liste|trouve)\b.*\b(mot de passe|password|iban|carte bancaire|securite sociale|ssn|salaire brut)\b/i,
];

const HORS_SUJET: RegExp[] = [
  /\b(quelle?|qui|qu[ée]|combien)\s+(est|sera|a|fait|fut)?\s*(la|le|les)?\s*(capitale|président|roi|reine|acteur|chanteur|film|musique|équipe|score|météo|date du jour)\b/i,
  /\b(raconte|racontez|explique|expliquez)\s+(moi\s+)?(une blague|une histoire|le monde|la vie|l'univers)\b/i,
  /\b(traduis|traduire|écris|écrire|rédige|rédiger|génère|générer)\b.*\b(poème|chanson|histoire|lettre|cv|roman|blague)\b/i,
  /\b(ignore|ignorer|oublie|oublier)\b.*\b(fichier|données|contexte)\b.*\b(dis|donne|répond|réponds)\b/i,
  /\b(ignore|ignorer)\b.*\b(instructions|consignes)\b/i,
];

// Dictionnaire enrichi avec prise en compte du mode benchmark, des écarts et des termes analytiques
const SIGNAUX = [
  // Données & Fichiers
  "fichier", "fichiers", "file", "files", "donnée", "données", "donnee", "donnees", "data", "dataset",
  "tableau", "table", "tdc", "tcd", "pivot", "colonne", "colonnes", "column", "columns",
  "ligne", "lignes", "row", "rows", "champ", "champs", "cellule", "cellules", "valeur", "valeurs",
  "enregistrement", "enregistrements", "base", "source", "sources",

  // Benchmark & Comparaison
  "comparer", "comparaison", "compare", "benchmark", "benchmarks", "comparatif", "comparatifs",
  "comparative", "comparatives", "versus", "vs", "différence", "differences", "difference",
  "écart", "écarts", "ecart", "ecarts", "delta", "deltas", "variation", "variations", "confrontation",
  "évolution", "evolution", "progression", "recul", "hausse", "baisse", "gain", "perte",

  // Corrélations, Liens & Statistiques
  "corrélation", "corrélations", "correlation", "correlations", "corréler", "correler",
  "régression", "regression", "liaison", "liaisons", "lien", "liens", "relation", "relations",
  "dépendance", "dependance", "synergie", "découplage", "decouplage", "inversion", "r", "r2",
  "coefficient", "pearson", "statistique", "statistiques", "stats",

  // Agrégations & Mesures
  "moyenne", "médiane", "mediane", "somme", "total", "minimum", "maximum", "min", "max",
  "pourcentage", "taux", "rate", "percentage", "effectif", "compte", "count", "distribution",
  "répartition", "repartition", "concentration", "dispersion",

  // Visualisations
  "graphique", "graphiques", "chart", "charts", "courbe", "courbes", "barre", "barres",
  "camembert", "anneau", "carte", "cartes", "map", "maps", "géographie", "geographie",

  // Prévisions & Tendances
  "prévision", "prévisions", "prevision", "previsions", "projection", "projections",
  "prédiction", "predictions", "prediction", "prospective", "futur", "future", "tendance",
  "tendances", "trend", "trajectoire", "trajectoires", "horizon", "scénario", "scenarios",

  // Synthèse & Qualité
  "résumé", "resume", "resumer", "synthèse", "synthese", "bilan", "rapport", "anomalie",
  "anomalies", "atypique", "atypiques", "outlier", "outliers", "doublon", "doublons",
  "manquant", "manquants", "manquante", "manquantes", "vide", "vides", "qualité", "qualite",
  "complétude", "completude",

  // Décisionnel & Business
  "kpi", "indicateur", "indicateurs", "performance", "performances", "chiffre d'affaires",
  "chiffre d’affaires", "ca", "marge", "marges", "coût", "cout", "coûts", "couts", "prix",
  "quantité", "quantite", "vente", "ventes", "recommandation", "recommandations", "conseil",
  "conseils", "stratégie", "strategie", "priorité", "priorite", "action", "actions", "alerte"
];

function normaliserTexte(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const SIGNAUX_NORMALISES = Array.from(new Set(SIGNAUX.map(normaliserTexte)));
const RE_SIGNAUX = SIGNAUX_NORMALISES.map(
  (m) => new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i")
);

export function verifierQuestionLieeAuxFichier(
  question: string,
  contexte: unknown,
  langueConversation?: string,
  mode?: "fichier" | "monchamp"
): ResultatGarde {
  const L = langueConversation === "en" ? "en" : "fr";
  const qBrute = String(question ?? "").trim();
  if (!qBrute) return { ok: false, message: MSG.vide[L] };

  // 1. Détection des requêtes d'extraction massive ou de données sensibles
  for (const re of EXTRACTION_SENSIBLE) {
    if (re.test(qBrute)) return { ok: false, message: MSG.confidentialite[L] };
  }

  // 2. Détection hors-sujet strict et tentatives d'injection
  for (const re of HORS_SUJET) {
    if (re.test(qBrute)) return { ok: false, message: MSG.horsSujet[L] };
  }

  const qNorm = normaliserTexte(qBrute);

  // 3. Détection d'un signal analytique ou comparatif
  let signal = RE_SIGNAUX.some((re) => re.test(qNorm));
  if (signal) return { ok: true };

  // 4. Détection via les métadonnées du fichier (colonnes, fichiers comparés, valeurs)
  let ctx: Record<string, unknown> = {};
  try {
    ctx = typeof contexte === "string" ? JSON.parse(contexte || "{}") : contexte || {};
  } catch {
    ctx = {};
  }

  // Vérification des noms des colonnes (avec tolérance sur les accents)
  const colonnes: unknown[] = Array.isArray(ctx.toutesLesColonnes)
    ? ctx.toutesLesColonnes
    : Array.isArray(ctx.colonnesAnalysees)
    ? ctx.colonnesAnalysees
    : Array.isArray(ctx.colonnes)
    ? ctx.colonnes
    : [];

  const textesColonnes = colonnes.map((c) => normaliserTexte(String(c ?? ""))).filter(Boolean);
  const colonneTrouvee = textesColonnes.some((c) => c.length >= 3 && qNorm.includes(c));
  if (colonneTrouvee) return { ok: true };

  // Vérification des noms de fichiers comparés
  if (ctx.fichiers_confrontes && typeof ctx.fichiers_confrontes === "object") {
    const fc = ctx.fichiers_confrontes as Record<string, unknown>;
    const s1 = normaliserTexte(String(fc.source_reference ?? ""));
    const s2 = normaliserTexte(String(fc.source_cible ?? ""));
    if ((s1.length >= 3 && qNorm.includes(s1)) || (s2.length >= 3 && qNorm.includes(s2))) {
      return { ok: true };
    }
  }

  // Vérification dans les clés de statistiques
  if (ctx.statistiques && typeof ctx.statistiques === "object") {
    const cleStats = Object.keys(ctx.statistiques).map(normaliserTexte);
    if (cleStats.some((n) => n.length >= 3 && qNorm.includes(n))) {
      return { ok: true };
    }
  }

  // Vérification dans les premières lignes de données
  if (Array.isArray(ctx.apercuPremieresLignes)) {
    const textes: string[] = [];
    for (const row of ctx.apercuPremieresLignes.slice(0, 12)) {
      if (!row) continue;
      for (const k of Object.keys(row)) {
        const v = normaliserTexte(String(row[k] ?? ""));
        if (v.length >= 3 && v.length <= 80) textes.push(v);
      }
    }
    if (textes.some((v) => qNorm.includes(v))) {
      return { ok: true };
    }
  }

  return { ok: false, message: MSG.horsSujet[L] };
}
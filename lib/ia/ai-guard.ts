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
};

const HORS_SUJET: RegExp[] = [
  /\b(quelle?|qui|qu[ée]|combien)\s+(est|sera|a|fait|fut)?\s*(la|le|les)?\s*(capitale|président|roi|reine|acteur|chanteur|film|musique|équipe|score|météo|date du jour)\b/i,
  /\b(raconte|racontez|explique|expliquez)\s+(moi\s+)?(une blague|une histoire|le monde|la vie|l'univers)\b/i,
  /\b(traduis|traduire|écris|écrire|rédige|rédiger|génère|générer)\b.*\b(poème|chanson|histoire|lettre|cv|roman|blague)\b/i,
  /\b(ignore|ignorer|oublie|oublier)\b.*\b(fichier|données|contexte)\b.*\b(dis|donne|répond|réponds)\b/i,
  /\b(ignore|ignorer)\b.*\b(instructions|consignes)\b/i,
];

const SIGNAUX = [
  "fichier","fichiers","donnée","données","dataset","tableau","tdc","pivot","colonne","colonnes",
  "ligne","lignes","dossier","dossiers","enregistrement","enregistrements","valeur","valeurs",
  "champ","champs","statut","statuts","région","régions","departement","département","départements",
  "sous-préfecture","sous préfecture","village","superficie","surface","code","parcelle","certificat",
  "analyse","analyser","analyses","comparer","comparaison","compare","répartition","distribution",
  "moyenne","médiane","somme","total","minimum","maximum","min","max","écart","pourcentage","taux",
  "manquant","manquants","manquante","manquantes","vide","vides","doublon","doublons","anomalie","anomalies",
  "corrélation","corrélations","tendance","évolution","progression","qualité","complétude",
  "prévision","prévisions","prédiction","prédictions","prediction","predictions","prévoir","prevoir",
  "projection","projections","prospective","futur","future","futures","avenir","prochain","prochaine",
  "prochains","prochaines","scénario","scénarios","forecast","forecasting","predict",
  "rentable","rentabilité","rentabiliser","rentabilisation","profit","profits","bénéfice","bénéfices",
  "marge","marges","revenu","revenus","chiffre d’affaires","chiffre d'affaires","ca","coût","coûts",
  "cout","couts","prix","performance","performances","opportunité","opportunités","opportunite","opportunites",
  "risque","risques","menace","menaces","potentiel","potentiels","optimiser","optimisation","améliorer",
  "amélioration","action","actions","recommandation","recommandations","recommander","conseil","conseils",
  "décision","décisions","decision","decisions","plan d’action","plan d'action","plan action","stratégie","stratégies",
  "priorité","priorités","priorite","priorites","quoi faire","que faire","faudra faire","à faire","a faire",
  "surveiller","indicateur","indicateurs","kpi","objectif","objectifs","alerte","alertes","opportunités futures",
  "what should","what can","profitability","profitable","revenue","cost","costs",
  "approved","rejected","missing","records","rows","columns","data","average","median",
  "sum","percentage","rate","duplicates","anomalies","trend","quality",
  "risk","opportunity","opportunities","recommendation","recommendations",
  "strategy","strategies","outlook","decisions",
];

export function verifierQuestionLieeAuxFichier(
  question: string,
  contexte: unknown,
  langueConversation?: string
): ResultatGarde {
  const L = langueConversation === "en" ? "en" : "fr";
  const q = String(question ?? "").trim().toLowerCase();
  if (!q) return { ok: false, message: MSG.vide[L] };

  let ctx: Record<string, unknown> = {};
  try {
    ctx = typeof contexte === "string" ? JSON.parse(contexte || "{}") : contexte || {};
  } catch {
    ctx = {};
  }

  const colonnes: unknown[] = Array.isArray(ctx.toutesLesColonnes)
    ? ctx.toutesLesColonnes
    : Array.isArray(ctx.colonnesAnalysees) ? ctx.colonnesAnalysees : [];
  const textesColonnes = colonnes.map((c) => String(c ?? "").toLowerCase().trim()).filter(Boolean);

  for (const re of HORS_SUJET) if (re.test(q)) return { ok: false, message: MSG.horsSujet[L] };

  const colonneTrouvee = textesColonnes.some((c) => c.length >= 3 && q.includes(c));
  let signal = SIGNAUX.some((m) => q.includes(m));

  if (!signal && ctx.statistiques) {
    signal = Object.keys(ctx.statistiques as object).some((n) => n.length >= 3 && q.includes(n.toLowerCase()));
  }
  if (!signal && Array.isArray(ctx.apercuPremieresLignes)) {
    const textes: string[] = [];
    for (const row of ctx.apercuPremieresLignes.slice(0, 12)) {
      if (!row) continue;
      for (const k of Object.keys(row)) {
        const v = String(row[k] ?? "").toLowerCase().trim();
        if (v.length >= 3 && v.length <= 80) textes.push(v);
      }
    }
    signal = textes.some((v) => q.includes(v));
  }

  if (!colonneTrouvee && !signal) return { ok: false, message: MSG.horsSujet[L] };
  return { ok: true };
}
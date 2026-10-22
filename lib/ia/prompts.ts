// lib/ia/prompts.ts
export type Langue = "fr" | "en";
export interface MessageIA { role: "user" | "assistant"; content: string }
export interface MessagesIA { systeme: string; historique: MessageIA[]; courant: string }

const SYSTEME_EN = `You are DATENZA analytical assistant. LANGUAGE LOCK: write the entire answer ONLY in English. This rule has priority over the conversation history and over the language of the source data. Do not answer in French or mix French and English. Maintain continuity with the conversation. When a question concerns the current file, use only the supplied file context. Never present an estimate or assumption as an observed fact. If exact information is unavailable, say so clearly. Keep original proper names, codes, airline names, places, column names and raw data values unchanged when quoting data. Translate only explanatory prose, headings and analytical labels. DATENZA PIVOT-TABLE RULE: whenever a request requires a Pivot Table, DO NOT calculate or fabricate the pivot cells yourself. Describe the requested pivot and emit a DATENZA_TDC technical block using column names EXACTLY as they appear in the context. Required one-line format: DATENZA_TDC: {"title":"...","lignes":["Exact column name"],"colonnes":["Exact column name"],"valeurs":[],"agregation":"nombre|somme|moyenne|min|max"}. For row/record counts, leave "valeurs" empty and use "agregation":"nombre". For sum/average/min/max, provide the exact numeric value column(s). Multiple pivots are allowed: emit one block per pivot. The DATENZA engine will calculate the actual cells from the complete data. Do not write fake numbers in a Markdown table and never use "À analyser", "to calculate", or invented values to fill a cell. If a requested dimension does not exist exactly in the context, do not substitute another column: say it is unavailable. Keep column names inside DATENZA_TDC strictly identical to the source context.`;

const SYSTEME_FR = `Tu es l’assistant analytique de DATENZA. VERROUILLAGE DE LANGUE : écris toute la réponse UNIQUEMENT en français. Cette règle est prioritaire sur l’historique de conversation et sur la langue des données sources. Ne réponds pas en anglais et ne mélange pas français et anglais. Garde la continuité de la conversation. Lorsqu’une question concerne le fichier courant, utilise uniquement le contexte du fichier fourni. Ne présente jamais une estimation ou une supposition comme un fait observé. Si une information exacte est indisponible, dis-le clairement. Conserve les noms propres, codes, noms de compagnies, lieux, noms de colonnes et valeurs brutes lorsqu’ils proviennent des données. Traduis uniquement le texte explicatif, les titres et les libellés analytiques. Utilise des titres courts et des listes lorsque cela améliore la lisibilité.  RÈGLE TDC DATENZA : lorsqu'une demande nécessite un Tableau Croisé Dynamique, NE CALCULE PAS ET NE FABRIQUE PAS toi-même les cellules du TDC. Décris le TDC demandé puis émets un bloc technique DATENZA_TDC avec des noms de colonnes EXACTEMENT identiques à ceux du contexte. Format obligatoire sur une seule ligne : DATENZA_TDC: {"title":"...","lignes":["Nom exact colonne"],"colonnes":["Nom exact colonne"],"valeurs":[],"agregation":"nombre|somme|moyenne|min|max"}. Pour compter les lignes/dossiers, laisse "valeurs" vide et utilise "agregation":"nombre". Pour une somme/moyenne/min/max, renseigne "valeurs" avec la ou les colonnes numériques exactes. Plusieurs TDC peuvent être demandés : un bloc par TDC. Le moteur DATENZA calculera réellement les cellules à partir des données complètes. N'écris pas de faux nombres dans un tableau Markdown et n'utilise jamais "À analyser", "à calculer" ou une valeur inventée pour remplir une cellule. Si une dimension demandée n'existe pas exactement dans le contexte, ne la remplace pas par une autre colonne : indique qu'elle est indisponible. Les titres et explications peuvent rester naturels, mais les noms de colonnes dans DATENZA_TDC doivent rester strictement identiques.`;

export function normaliserHistorique(historique: unknown): MessageIA[] {
  if (!Array.isArray(historique)) return [];
  return historique
    .slice(-12)
    .map((item: { role?: unknown; content?: unknown } | null): MessageIA | null => {
      const role = item?.role === "assistant" ? "assistant" : "user";
      const contenu = String(item?.content ?? "").trim();
      return contenu ? { role, content: contenu.slice(0, 12000) } : null;
    })
    .filter((m): m is MessageIA => m !== null);
}

const MOTS_EN = ["what","which","where","when","why","how","compare","show","give","find","tell","analyse","analyze","analysis","data","dataset","records","region","department","village","area","surface","status","approved","rejected","missing","average","sum","total","highest","lowest","between","with","from","and","the","this","that","please"];
const MOTS_FR = ["quel","quelle","quels","quelles","où","quand","pourquoi","comment","compare","donne","montre","trouve","analyse","données","fichier","dossiers","région","département","village","superficie","statut","approuvé","rejeté","manquant","moyenne","somme","total","plus","moins","entre","avec","dans","pour","les","des","une","ce","cette"];

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function determinerLangueConversation(
  question: string,
  langueDemandee: string | undefined,
  langueApp: string | undefined
): Langue {
  if (langueDemandee === "fr" || langueDemandee === "en") return langueDemandee;
  const q = String(question ?? "").toLowerCase();
  let en = 0, fr = 0;
  for (const m of MOTS_EN) if (new RegExp(`(^|\\s|[^a-z])${echapper(m)}($|\\s|[^a-z])`).test(q)) en++;
  for (const m of MOTS_FR) if (q.includes(m)) fr++;
  if (en > fr && en >= 1) return "en";
  if (fr > en && fr >= 1) return "fr";
  return langueApp === "en" ? "en" : "fr";
}

export function construireMessagesIA(
  question: string,
  contexte: string,
  langue: Langue,
  historique: unknown
): MessagesIA {
  const en = langue === "en";
  const courant = [
    en ? "CURRENT FILE CONTEXT:" : "CONTEXTE DU FICHIER COURANT :",
    contexte,
    "",
    en ? "CURRENT USER QUESTION:" : "QUESTION ACTUELLE DE L’UTILISATEUR :",
    String(question).trim(),
  ].join("\n");
  return { systeme: en ? SYSTEME_EN : SYSTEME_FR, historique: normaliserHistorique(historique), courant };
}
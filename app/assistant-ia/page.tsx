"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Sparkles,
  Trash2,
  FileSpreadsheet,
  ArrowRight,
  Cpu,
  Scale,
} from "lucide-react";
import { useData } from "../context/DataContext";
import { analyserColonnes } from "../../lib/analyse/analyse";
import { construireContexte } from "../../lib/analyse/context";
import { calculerTdcAvecLimite, type Agregation } from "../../lib/analyse/tdc";
import { parseNombre, arrondir, type Cellule } from "../../lib/analyse/utils";
import TableTdc from "../components/TableTdc";
import { enregistrerFournisseur, lireFournisseur } from "../../lib/prefs";

interface Message {
  role: "user" | "assistant";
  text: string;
  via?: string;
}

const AGGS: Record<string, Agregation> = {
  count: "nombre",
  compte: "nombre",
  nombre: "nombre",
  sum: "somme",
  somme: "somme",
  average: "moyenne",
  avg: "moyenne",
  moyenne: "moyenne",
  min: "min",
  minimum: "min",
  max: "max",
  maximum: "max",
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

type TdcCalcule =
  | { erreur: string }
  | {
      titre: string;
      donnees: ReturnType<typeof calculerTdcAvecLimite>["donnees"];
      agg: Agregation;
      lignes: string[];
      nbValeurs: number;
    };

function calculerTdcIA(json: string, entetes: string[], corps: Cellule[][]): TdcCalcule {
  try {
    const o = JSON.parse(json) as {
      title?: string;
      titre?: string;
      lignes?: string[];
      colonnes?: string[];
      valeurs?: string[];
      agregation?: string;
    };
    const trouver = (noms: unknown) =>
      (Array.isArray(noms) ? noms : [])
        .map((n) => entetes.find((e) => norm(e) === norm(String(n))))
        .filter((x): x is string => !!x);

    const lignes = trouver(o.lignes);
    const colonnes = trouver(o.colonnes);
    const valeurs = trouver(o.valeurs);
    const demandees =
      (o.lignes?.length ?? 0) + (o.colonnes?.length ?? 0) + (o.valeurs?.length ?? 0);

    if (lignes.length === 0 || lignes.length + colonnes.length + valeurs.length < demandees) {
      return { erreur: "une ou plusieurs colonnes demandées n'existent pas dans le fichier" };
    }
    if (lignes.some((c) => colonnes.includes(c))) {
      return { erreur: "une colonne ne peut pas être à la fois en lignes et en colonnes" };
    }

    const agg = AGGS[norm(o.agregation ?? "nombre")] ?? "nombre";
    const r = calculerTdcAvecLimite({ entetes, corps }, lignes, colonnes, valeurs, agg);
    return {
      titre: o.title ?? o.titre ?? "Tableau croisé dynamique",
      donnees: r.donnees,
      agg,
      lignes,
      nbValeurs: valeurs.length,
    };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "bloc illisible" };
  }
}

function TdcIA({ json, entetes, corps }: { json: string; entetes: string[]; corps: Cellule[][] }) {
  const r = calculerTdcIA(json, entetes, corps);
  if ("erreur" in r) return <p className="text-rose-600 text-xs">TDC non généré : {r.erreur}.</p>;
  return (
    <div className="my-3 space-y-2">
      <p className="font-bold text-purple-700 dark:text-purple-300">{r.titre}</p>
      <TableTdc
        donnees={r.donnees}
        agregation={r.agg}
        titreLignes={r.lignes.join(" / ")}
        plusieursValeurs={r.nbValeurs > 1}
      />
      <p className="text-[10px] text-slate-400">Calculé par le moteur DATENZA à partir des données du fichier.</p>
    </div>
  );
}

const H = ({ children }: { children?: ReactNode }) => (
  <h4 className="text-xs font-bold mt-3 mb-1 text-purple-700 dark:text-purple-300">{children}</h4>
);
const BORD = "border border-slate-300 dark:border-slate-600 px-2 py-1";
const MD: Components = {
  h1: H,
  h2: H,
  h3: H,
  h4: H,
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
  hr: () => <hr className="my-3 border-slate-300 dark:border-slate-600" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-[11px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className={`${BORD} text-left font-semibold bg-slate-200 dark:bg-slate-700`}>{children}</th>,
  td: ({ children }) => <td className={BORD}>{children}</td>,
};

function ReponseIA({ texte, entetes, corps }: { texte: string; entetes: string[]; corps: Cellule[][] }) {
  const morceaux = texte.split(/^\s*DATENZA_TDC\s*:\s*(\{.*\})\s*$/im);
  return (
    <>
      {morceaux.map((p, i) =>
        i % 2 === 1 ? (
          <TdcIA key={i} json={p} entetes={entetes} corps={corps} />
        ) : (
          p.trim() && (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MD}>
              {p}
            </ReactMarkdown>
          )
        )
      )}
    </>
  );
}

export default function AssistantIAPage() {
  const { nomFichier, corps, entetes, resultat } = useData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chargement, setChargement] = useState(false);
  const [fournisseur, setFournisseur] = useState("auto");
  const [dispo, setDispo] = useState<{ id: string; nom: string }[]>([]);
  const finDiscussionRef = useRef<HTMLDivElement>(null);

  // 1. Détection du mode benchmark (N fichiers)
  const estModeComparaison = entetes.includes("Fichier Source");
  const idxSource = entetes.indexOf("Fichier Source");

  const sourcesFichiers = useMemo(() => {
    if (!estModeComparaison || idxSource === -1) return [];
    return Array.from(new Set(corps.map((l) => String(l[idxSource] ?? "").trim()).filter(Boolean)));
  }, [estModeComparaison, idxSource, corps]);

  const estBenchmarkActif = estModeComparaison && sourcesFichiers.length >= 2;

  // Fichier étalon de référence
  const [sourceRefChoisie, setSourceRefChoisie] = useState<string>("");
  const refSource = sourcesFichiers.includes(sourceRefChoisie)
    ? sourceRefChoisie
    : sourcesFichiers[0] || "";

  // Découpage des lignes par source
  const corpsParSource = useMemo(() => {
    const map = new Map<string, Cellule[][]>();
    sourcesFichiers.forEach((src) => {
      map.set(src, corps.filter((l) => String(l[idxSource] ?? "").trim() === src));
    });
    return map;
  }, [sourcesFichiers, corps, idxSource]);

  // Moteurs IA disponibles
  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((d: { fournisseurs?: { id: string; nom: string }[] }) => {
        const liste = d.fournisseurs ?? [];
        setDispo(liste);
        const memorise = lireFournisseur();
        setFournisseur(liste.some((f) => f.id === memorise) ? memorise : "auto");
      })
      .catch(() => {});
  }, []);

  // Défilement automatique
  useEffect(() => {
    finDiscussionRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chargement]);

  // 2. Contexte structuré envoyé à l'IA (Multi-Sources vs Standard)
  const contexte = useMemo(() => {
    if (corps.length === 0) return "";
    const res = resultat ?? analyserColonnes(entetes, corps, entetes);
    const baseCtx = construireContexte(nomFichier, entetes, corps, res);

    if (!estBenchmarkActif) {
      return JSON.stringify(baseCtx);
    }

    const colonnesUtiles = entetes.filter((h) => h !== "Fichier Source");

    // Volumétrie par source
    const volumetrie: Record<string, number> = {};
    sourcesFichiers.forEach((src) => {
      volumetrie[src] = corpsParSource.get(src)?.length || 0;
    });

    // Profilage complet des colonnes numériques par source
    const indicateursNumeriques: Record<string, any> = {};

    colonnesUtiles.forEach((col) => {
      const idx = entetes.indexOf(col);
      const perfSources: {
        source: string;
        somme: number;
        moyenne: number;
        mediane: number;
        min: number;
        max: number;
        effectif: number;
      }[] = [];

      sourcesFichiers.forEach((src) => {
        const lignes = corpsParSource.get(src) || [];
        const nums = lignes.map((l) => parseNombre(l[idx])).filter((n): n is number => n !== null);
        if (nums.length > 0) {
          const tri = [...nums].sort((a, b) => a - b);
          const sum = nums.reduce((a, b) => a + b, 0);
          const moy = sum / nums.length;
          const med = nums.length % 2 === 1
            ? tri[Math.floor(nums.length / 2)]
            : (tri[nums.length / 2 - 1] + tri[nums.length / 2]) / 2;

          perfSources.push({
            source: src,
            somme: arrondir(sum),
            moyenne: arrondir(moy),
            mediane: arrondir(med),
            min: arrondir(tri[0]),
            max: arrondir(tri[tri.length - 1]),
            effectif: nums.length,
          });
        }
      });

      if (perfSources.length >= 2) {
        const classement = [...perfSources].sort((a, b) => b.somme - a.somme);
        const refData = perfSources.find((p) => p.source === refSource) || perfSources[0];

        const ecartsVsRef: Record<string, { delta_somme: number; pct_somme: number; delta_moyenne: number }> = {};
        perfSources.forEach((p) => {
          if (p.source !== refData.source) {
            const dSomme = arrondir(p.somme - refData.somme);
            const pctSomme = refData.somme > 0 ? Math.round((dSomme / refData.somme) * 1000) / 10 : 0;
            const dMoy = arrondir(p.moyenne - refData.moyenne);
            ecartsVsRef[p.source] = {
              delta_somme: dSomme,
              pct_somme: pctSomme,
              delta_moyenne: dMoy,
            };
          }
        });

        indicateursNumeriques[col] = {
          leader_volume: classement[0].source,
          valeurs_par_source: perfSources,
          comparatif_vs_reference: {
            source_pivot: refData.source,
            ecarts: ecartsVsRef,
          },
        };
      }
    });

    // Profilage des colonnes catégorielles
    const dominancesCategorielles: Record<string, any> = {};
    colonnesUtiles.forEach((col) => {
      if (indicateursNumeriques[col]) return;
      const idx = entetes.indexOf(col);

      const topParSource: Record<string, { premiere_valeur: string; effectif: number; pourcentage: number; nb_categories: number }> = {};
      sourcesFichiers.forEach((src) => {
        const lignes = corpsParSource.get(src) || [];
        const vals = lignes.map((l) => String(l[idx] ?? "").trim()).filter(Boolean);
        const freq: Record<string, number> = {};
        vals.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
        const premier = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        if (premier) {
          topParSource[src] = {
            premiere_valeur: premier[0],
            effectif: premier[1],
            pourcentage: vals.length ? Math.round((premier[1] / vals.length) * 100) : 0,
            nb_categories: Object.keys(freq).length,
          };
        }
      });

      dominancesCategorielles[col] = topParSource;
    });

    const contexteBenchmarkMulti = {
      ...baseCtx,
      mode_analyse: "BENCHMARK_MULTI_SOURCES",
      nombre_fichiers_analyses: sourcesFichiers.length,
      liste_fichiers: sourcesFichiers,
      fichier_reference_pivot: refSource,
      volumetrie_enregistrements: volumetrie,
      synthese_indicateurs_numeriques: indicateursNumeriques,
      dominances_categorielles: dominancesCategorielles,
      consignes_specifiques_ia: `CONSIGNE CRUCIALE MULTI-SOURCES :
Vous analysez un benchmark comparatif comprenant ${sourcesFichiers.length} fichiers : ${sourcesFichiers.map((s) => `« ${s} »`).join(", ")}.
Le fichier de référence étalon est : « ${refSource} ».
1. Ne fusionnez pas aveuglément les données des différents fichiers. Traitez-les comme des entités distinctes à confronter.
2. Lorsqu'on vous interroge sur des performances, volumes, moyennes ou corrélations, présentez le comparatif des fichiers, identifiez le leader et détaillez les écarts relatifs (deltas nets et variations %) par rapport à la référence « ${refSource} ».
3. Si l'utilisateur demande d'expliquer les corrélations, détaillez comment la force et le sens du lien linéaire (coefficient r) évoluent entre les différents fichiers.
4. Si l'utilisateur demande de générer un tableau croisé dynamique (DATENZA_TDC), incluez systématiquement "Fichier Source" dans la liste des "colonnes" du JSON pour afficher le benchmark côte à côte.`,
    };

    return JSON.stringify(contexteBenchmarkMulti);
  }, [nomFichier, entetes, corps, resultat, estBenchmarkActif, sourcesFichiers, refSource, corpsParSource, idxSource]);

  // 3. Suggestions dynamiques selon le mode
  const suggestions = useMemo(() => {
    if (!entetes.length || !corps.length) return [];
    const list: string[] = [];

    if (estBenchmarkActif) {
      list.push(`Quels sont les principaux écarts constatés par rapport à « ${refSource} » ?`);

      const colNum = entetes.find(
        (e) => e !== "Fichier Source" && /montant|total|ca|prix|quantite|vente|chiffre/i.test(e)
      );
      if (colNum) {
        list.push(`Quel fichier affiche le meilleur score sur « ${colNum} » ?`);
      } else {
        list.push(`Classe les ${sourcesFichiers.length} fichiers par performance globale.`);
      }

      list.push("Explique l'évolution des corrélations entre les variables de nos fichiers.");

      const colCat = entetes.find((e) => e !== "Fichier Source" && !/id|code|date|uuid|ref|num/i.test(e));
      if (colCat) {
        list.push(`Génère un TDC comparatif selon « ${colCat} » avec Fichier Source en colonnes.`);
      }

      return list.slice(0, 3);
    }

    list.push("Fais-moi un résumé exécutif des chiffres clés de ce fichier.");
    const colCat = entetes.find((e) => !/id|code|date|uuid|ref|num/i.test(e));
    if (colCat) {
      list.push(`Quels sont les segments dominants selon la colonne « ${colCat} » ?`);
      list.push(`Génère un tableau croisé dynamique selon ${colCat}.`);
    }
    list.push("Y a-t-il des anomalies, concentrations à risque ou valeurs atypiques ?");

    return list.slice(0, 3);
  }, [entetes, corps, estBenchmarkActif, refSource, sourcesFichiers]);

  async function envoyerQuestion(texteDirect?: string) {
    const question = (texteDirect ?? input).trim();
    if (!question || chargement) return;

    if (corps.length === 0) {
      setMessages((p) => [
        ...p,
        { role: "assistant", text: "Veuillez d'abord importer un fichier sur la page d'accueil." },
      ]);
      return;
    }

    const historique = messages.slice(-12).map((m) => ({ role: m.role, content: m.text }));
    setMessages((p) => [...p, { role: "user", text: question }]);
    if (!texteDirect) setInput("");
    setChargement(true);

    try {
      const rep = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          contexte,
          historique,
          fournisseur,
          langueConversation: "auto",
          langueApp: "fr",
        }),
      });
      const data = (await rep.json().catch(() => ({}))) as {
        reponse?: string;
        fournisseur?: string;
        error?: string;
      };
      if (!rep.ok || !data.reponse) throw new Error(data.error ?? `Erreur ${rep.status}`);
      setMessages((p) => [...p, { role: "assistant", text: data.reponse as string, via: data.fournisseur }]);
    } catch (e) {
      setMessages((p) => [
        ...p,
        { role: "assistant", text: `⚠ ${e instanceof Error ? e.message : "Impossible d'obtenir une réponse."}` },
      ]);
    } finally {
      setChargement(false);
    }
  }

  if (corps.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 md:p-12 text-center space-y-5 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto shadow-inner">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Aucun fichier de données actif
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Pour interroger l&apos;Assistant IA et générer des analyses comparatives multi-sources, importez vos fichiers sur l&apos;accueil.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/analyse"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow transition"
            >
              Aller à l&apos;analyse
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12 font-sans">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
            {estBenchmarkActif ? `DATENZA BENCHMARK IA (${sourcesFichiers.length} SOURCES)` : "DATENZA INTELLIGENCE"}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-2">
            Assistant IA
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </h1>
          <p className="text-slate-500 text-xs">
            {estBenchmarkActif ? (
              <span>
                Benchmark actif sur <strong>{sourcesFichiers.length} fichiers</strong> ({corps.length.toLocaleString("fr-FR")} lignes cumulées). Référence étalon : <strong className="text-purple-700 dark:text-purple-300">{refSource}</strong>
              </span>
            ) : (
              <span>
                Connecté à « {nomFichier} » ({corps.length.toLocaleString("fr-FR")} lignes, {entetes.length} colonnes)
              </span>
            )}
          </p>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-rose-600 border border-slate-200 dark:border-slate-800 rounded-xl transition self-start sm:self-auto cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Effacer la discussion
          </button>
        )}
      </div>

      {/* Cadre de discussion */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-[580px] flex flex-col shadow-sm overflow-hidden">
        {/* Barre de contrôle supérieure */}
        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50/50 dark:bg-slate-850">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Cpu className="w-3.5 h-3.5 text-purple-600" />
            <label htmlFor="moteur-ia" className="font-medium">Moteur :</label>
            <select
              id="moteur-ia"
              value={fournisseur}
              onChange={(e) => {
                setFournisseur(e.target.value);
                enregistrerFournisseur(e.target.value);
              }}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="auto">Automatique (recommandé)</option>
              {dispo.map((f) => (
                <option key={f.id} value={f.id}>{f.nom}</option>
              ))}
            </select>
          </div>

          {estBenchmarkActif && (
            <div className="flex items-center gap-2">
              <Scale className="w-3.5 h-3.5 text-indigo-600" />
              <label htmlFor="ref-source-ia" className="font-medium text-slate-600 dark:text-slate-400">Référence pivot :</label>
              <select
                id="ref-source-ia"
                value={refSource}
                onChange={(e) => setSourceRefChoisie(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1 text-indigo-700 dark:text-indigo-300 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {sourcesFichiers.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <span className="text-[11px] text-slate-400 hidden md:inline">
            {estBenchmarkActif ? "Analyse multi-sources synchronisée" : "Support Tableaux Croisés Dynamiques (TDC)"}
          </span>
        </div>

        {/* Zone de discussion */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          <div className="flex justify-start">
            <div className="max-w-[85%] p-4 rounded-2xl rounded-bl-none text-xs leading-relaxed bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm">
              {estBenchmarkActif ? (
                <div>
                  Bonjour ! Le mode <strong>Benchmark Multi-Sources</strong> est actif sur <strong>{sourcesFichiers.length} fichiers</strong> :{" "}
                  {sourcesFichiers.map((src, i) => (
                    <span key={src}>
                      <strong className={src === refSource ? "text-purple-600 dark:text-purple-300" : "text-slate-700 dark:text-slate-300"}>
                        « {src} »{src === refSource ? " (Réf)" : ""}
                      </strong>
                      {i < sourcesFichiers.length - 1 ? ", " : ""}
                    </span>
                  ))}.
                  <br className="my-1" />
                  Posez-moi vos questions sur le classement des fichiers, les deltas d&apos;activité par rapport à « {refSource} », les dominances par catégorie, ou demandez-moi un TDC comparatif.
                </div>
              ) : (
                <div>
                  Bonjour ! Le fichier <strong>« {nomFichier} »</strong> ({corps.length.toLocaleString("fr-FR")} lignes) est actif.
                  Posez-moi vos questions : classements, anomalies, ratios, tendances ou demandez-moi de générer un tableau croisé dynamique.
                </div>
              )}
            </div>
          </div>

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed shadow-sm ${
                  m.role === "user"
                    ? "bg-purple-600 text-white rounded-br-none whitespace-pre-wrap"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none"
                }`}
              >
                {m.role === "assistant" ? (
                  <>
                    <ReponseIA texte={m.text} entetes={entetes} corps={corps} />
                    {m.via && (
                      <p className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-[10px] text-slate-400">
                        Réponse générée par {dispo.find((f) => f.id === m.via)?.nom ?? m.via}
                      </p>
                    )}
                  </>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}

          {chargement && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none text-xs text-purple-600 dark:text-purple-400 flex items-center gap-2 font-medium shadow-sm">
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
                DATENZA IA analyse les {sourcesFichiers.length || 1} source(s) de données et prépare la réponse…
              </div>
            </div>
          )}

          <div ref={finDiscussionRef} />
        </div>

        {/* Puces de questions suggérées */}
        {suggestions.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 flex items-center gap-2 overflow-x-auto text-xs">
            <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => void envoyerQuestion(sug)}
                disabled={chargement}
                className="px-3 py-1 bg-white hover:bg-purple-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-purple-700 dark:text-slate-300 dark:hover:text-purple-300 rounded-full border border-slate-200 dark:border-slate-700 whitespace-nowrap transition text-[11px] cursor-pointer"
              >
                {sug}
              </button>
            ))}
          </div>
        )}

        {/* Champ de saisie */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2 bg-white dark:bg-slate-900">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void envoyerQuestion()}
            placeholder={
              estBenchmarkActif
                ? `Posez votre question comparative (ex: Quels sont les plus gros écarts vs ${refSource} ? Génère un TDC comparatif...)`
                : "Posez votre question (ex: Quels sont les 3 meilleurs clients ? Génère un TDC par région...)"
            }
            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={() => void envoyerQuestion()}
            disabled={chargement || !input.trim()}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-semibold text-xs rounded-xl shadow transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
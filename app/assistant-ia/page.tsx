"use client";
import { useMemo, useState } from "react";
import { useData } from "../context/DataContext";
import { analyserColonnes } from "../../lib/analyse/analyse";
import { construireContexte } from "../../lib/analyse/context";
import { calculerTdcAvecLimite, type Agregation } from "../../lib/analyse/tdc";
import type { Cellule } from "../../lib/analyse/utils";
import TableTdc from "../components/TableTdc";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const AGGS: Record<string, Agregation> = {
  count: "nombre", compte: "nombre", nombre: "nombre",
  sum: "somme", somme: "somme",
  average: "moyenne", avg: "moyenne", moyenne: "moyenne",
  min: "min", minimum: "min", max: "max", maximum: "max",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

type TdcCalcule =
  | { erreur: string }
  | { titre: string; donnees: ReturnType<typeof calculerTdcAvecLimite>["donnees"]; agg: Agregation; lignes: string[]; nbValeurs: number };

function calculerTdcIA(json: string, entetes: string[], corps: Cellule[][]): TdcCalcule {
  try {
    const o = JSON.parse(json) as { title?: string; titre?: string; lignes?: string[]; colonnes?: string[]; valeurs?: string[]; agregation?: string };
    const trouver = (noms: unknown) =>
      (Array.isArray(noms) ? noms : []).map((n) => entetes.find((e) => norm(e) === norm(String(n)))).filter((x): x is string => !!x);
    const lignes = trouver(o.lignes);
    const colonnes = trouver(o.colonnes);
    const valeurs = trouver(o.valeurs);
    const demandees = (o.lignes?.length ?? 0) + (o.colonnes?.length ?? 0) + (o.valeurs?.length ?? 0);
    if (lignes.length === 0 || lignes.length + colonnes.length + valeurs.length < demandees) {
      return { erreur: "une ou plusieurs colonnes demandées n'existent pas dans le fichier" };
    }
    if (lignes.some((c) => colonnes.includes(c))) return { erreur: "une colonne ne peut pas être à la fois en lignes et en colonnes" };
    const agg = AGGS[norm(o.agregation ?? "nombre")] ?? "nombre";
    const r = calculerTdcAvecLimite({ entetes, corps }, lignes, colonnes, valeurs, agg);
    return { titre: o.title ?? o.titre ?? "Tableau croisé dynamique", donnees: r.donnees, agg, lignes, nbValeurs: valeurs.length };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "bloc illisible" };
  }
}

/** Bloc technique « DATENZA_TDC: {...} » émis par l'IA : le tableau est calculé ici, jamais par l'IA. */
function TdcIA({ json, entetes, corps }: { json: string; entetes: string[]; corps: Cellule[][] }) {
  const r = calculerTdcIA(json, entetes, corps);
  if ("erreur" in r) return <p className="text-rose-600">TDC non généré : {r.erreur}.</p>;
  return (
    <div className="my-3 space-y-2">
      <p className="font-bold text-purple-700 dark:text-purple-300">{r.titre}</p>
      <TableTdc donnees={r.donnees} agregation={r.agg} titreLignes={r.lignes.join(" / ")} plusieursValeurs={r.nbValeurs > 1} />
      <p className="text-[10px] text-slate-400">Calculé par le moteur DATENZA à partir des données du fichier.</p>
    </div>
  );
}

function ReponseIA({ texte, entetes, corps }: { texte: string; entetes: string[]; corps: Cellule[][] }) {
  return (
    <>
      {texte.split("\n").map((ligne, i) => {
        const m = ligne.match(/^\s*DATENZA_TDC\s*:\s*(\{.*\})\s*$/i);
        if (m) return <TdcIA key={i} json={m[1]} entetes={entetes} corps={corps} />;
        return <div key={i} className="min-h-[1em]">{ligne}</div>;
      })}
    </>
  );
}

export default function AssistantIAPage() {
  const { nomFichier, corps, entetes, resultat } = useData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chargement, setChargement] = useState(false);

  // Contexte envoyé à l'IA : résumés statistiques + 8 premières lignes (jamais le fichier complet).
  const contexte = useMemo(() => {
    if (corps.length === 0) return "";
    const res = resultat ?? analyserColonnes(entetes, corps, entetes);
    return JSON.stringify(construireContexte(nomFichier, entetes, corps, res));
  }, [nomFichier, entetes, corps, resultat]);

  async function envoyerQuestion() {
    const question = input.trim();
    if (!question || chargement) return;
    if (corps.length === 0) {
      setMessages((p) => [...p, { role: "assistant", text: "Veuillez d'abord importer un fichier sur la page d'accueil." }]);
      return;
    }
    const historique = messages.slice(-12).map((m) => ({ role: m.role, content: m.text }));
    setMessages((p) => [...p, { role: "user", text: question }]);
    setInput("");
    setChargement(true);
    try {
      const rep = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, contexte, historique, fournisseur: "auto", langueConversation: "auto", langueApp: "fr" }),
      });
      const data = (await rep.json().catch(() => ({}))) as { reponse?: string; error?: string };
      if (!rep.ok || !data.reponse) throw new Error(data.error ?? `Erreur ${rep.status}`);
      setMessages((p) => [...p, { role: "assistant", text: data.reponse as string }]);
    } catch (e) {
      setMessages((p) => [...p, { role: "assistant", text: `⚠ ${e instanceof Error ? e.message : "Impossible d'obtenir une réponse."}` }]);
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 font-sans">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-purple-600">DATENZA INTELLIGENCE</span>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">Assistant IA</h1>
        <p className="text-slate-500 text-sm">Interrogez directement vos données en langage naturel.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-[560px] flex flex-col shadow-sm overflow-hidden">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="flex justify-start">
            <div className="max-w-[85%] p-4 rounded-2xl rounded-bl-none text-xs leading-relaxed bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {corps.length === 0
                ? "Bonjour ! Importez d'abord un fichier sur la page d'accueil, puis posez-moi vos questions sur vos données."
                : `Bonjour ! Le fichier « ${nomFichier} » (${corps.length} lignes) est chargé. Posez-moi vos questions : répartitions, anomalies, tendances, tableaux croisés…`}
            </div>
          </div>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed shadow-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-purple-600 text-white rounded-br-none"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none"
                }`}
              >
                {m.role === "assistant" ? <ReponseIA texte={m.text} entetes={entetes} corps={corps} /> : m.text}
              </div>
            </div>
          ))}
          {chargement && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl text-xs text-purple-600 animate-pulse font-medium">
                DATENZA IA analyse le jeu de données…
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void envoyerQuestion()}
            placeholder="Posez votre question sur le fichier…"
            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={() => void envoyerQuestion()}
            disabled={chargement || !input.trim()}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-semibold text-xs rounded-xl shadow transition"
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

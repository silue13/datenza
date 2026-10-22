// lib/ia/ai-providers.ts
import type { MessagesIA } from "./prompts";
import { normaliserHistorique } from "./prompts";

export type Fournisseur = "gemini" | "groq" | "mistral" | "openrouter";
export const FOURNISSEURS: Fournisseur[] = ["gemini", "groq", "mistral", "openrouter"];

export const IA_CONFIG: Record<Fournisseur, { nom: string; modele: string; url: string; env: string }> = {
  gemini: {
    nom: "Gemini",
    modele: "gemini-3.6-flash",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    env: "GEMINI_API_KEY",
  },
  groq: { nom: "Groq", modele: "openai/gpt-oss-120b", url: "https://api.groq.com/openai/v1/chat/completions", env: "GROQ_API_KEY" },
  mistral: { nom: "Mistral", modele: "mistral-small-latest", url: "https://api.mistral.ai/v1/chat/completions", env: "MISTRAL_API_KEY" },
  openrouter: { nom: "OpenRouter", modele: "openrouter/free", url: "https://openrouter.ai/api/v1/chat/completions", env: "OPENROUTER_API_KEY" },
};

const cle = (f: Fournisseur) => (process.env[IA_CONFIG[f].env] ?? "").trim();

export const fournisseursConfigures = (): Fournisseur[] => FOURNISSEURS.filter((f) => !!cle(f));

/** Même logique que construireCandidatsIA_ : ordre fixe, bascule automatique. */
export function candidatsIA(choix: string): Fournisseur[] {
  const dispo = fournisseursConfigures();
  if (choix === "auto") return dispo;
  if (!FOURNISSEURS.includes(choix as Fournisseur) || !dispo.includes(choix as Fournisseur)) return [];
  return [choix as Fournisseur, ...dispo.filter((n) => n !== choix)];
}

interface ReponseFournisseur {
  error?: { message?: string } | string;
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  choices?: { message?: { content?: string } }[];
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function appelerFournisseur(nom: Fournisseur, m: MessagesIA): Promise<string> {
  const apiKey = cle(nom);
  if (!apiKey) throw new Error("clé API absente");
  const cfg = IA_CONFIG[nom];
  const historique = normaliserHistorique(m.historique);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let payload: unknown;

  if (nom === "gemini") {
    headers["x-goog-api-key"] = apiKey; // en en-tête plutôt que dans l'URL (évite les clés dans les logs)
    payload = {
      systemInstruction: { parts: [{ text: m.systeme }] },
      contents: [
        ...historique.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
        { role: "user", parts: [{ text: m.courant }] },
      ],
      generationConfig: { maxOutputTokens: 2500, temperature: 0.2 },
    };
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    payload = {
      model: cfg.modele,
      messages: [
        { role: "system", content: m.systeme },
        ...historique,
        { role: "user", content: m.courant },
      ],
      temperature: 0.2,
      max_tokens: 2500,
    };
    if (nom === "openrouter") headers["X-Title"] = "DATENZA";
  }

  let rep: Response | null = null;
  for (let tentative = 0; tentative < 2; tentative++) {
    rep = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (rep.ok) break;
    if (!(rep.status === 429 || rep.status >= 500)) break; // erreurs temporaires seulement
    await pause(800 * (tentative + 1));
  }

  const texte = await rep!.text();
  let json: ReponseFournisseur | null = null;
  try { json = JSON.parse(texte); } catch {}

  if (!rep!.ok) {
    const msg = String((typeof json?.error === "string" ? json.error : json?.error?.message) ?? texte ?? `réponse HTTP ${rep!.status}`)
      .replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`HTTP ${rep!.status} — ${msg}`);
  }

  const sortie =
    nom === "gemini"
      ? (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")
      : json?.choices?.[0]?.message?.content ?? "";
  if (!sortie) throw new Error("réponse IA vide");
  return String(sortie).trim();
}
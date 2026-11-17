"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bar, Line } from "react-chartjs-2";
import "./chartSetup";
import { AlertTriangle, Download, TrendingDown, TrendingUp } from "lucide-react";
import type { Cellule } from "../../lib/analyse/utils";
import {
  analyserCohortes,
  analyserEvolution,
  analyserPareto,
  analyserRFM,
  CONSEILS_RFM,
  detecterColonnesMetier,
  phraseCohortes,
  phraseEvolution,
  phrasePareto,
  type Comparaison,
  type ResultatRFM,
} from "../../lib/analyse/metier";

interface InfoMinimale {
  type: string;
  role: string;
  stats: Record<string, unknown>;
}

interface Props {
  entetes: string[];
  corps: Cellule[][];
  statistiques: Record<string, InfoMinimale>;
  mesures: string[];
}

type Onglet = "pareto" | "evolution" | "rfm" | "cohortes";
const ONGLETS: { id: Onglet; titre: string; question: string }[] = [
  { id: "pareto", titre: "Pareto / ABC", question: "Qui fait l'essentiel du total ?" },
  { id: "evolution", titre: "Évolution", question: "Mieux ou moins bien que le mois dernier et que l'an dernier ?" },
  { id: "rfm", titre: "Segments clients (RFM)", question: "Quels clients choyer, relancer, reconquérir ?" },
  { id: "cohortes", titre: "Fidélité (cohortes)", question: "Les nouveaux clients reviennent-ils ?" },
];

const nf = (x: number, dec = 0) => x.toLocaleString("fr-FR", { maximumFractionDigits: dec });
const pct = (x: number) => `${nf(x, x < 10 ? 1 : 0)} %`;
const signe = (x: number, dec = 0) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${nf(Math.abs(x), dec)}`;
const sansEtiquettes = { datalabels: { display: false } } as const;

const champ = "text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 rounded-lg px-2 py-1.5 max-w-full";

function Selecteur({ libelle, valeur, options, onChange, optionnel }: { libelle: string; valeur: string; options: string[]; onChange: (v: string) => void; optionnel?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500 min-w-0">
      {libelle}
      <select className={champ} value={valeur} onChange={(e) => onChange(e.target.value)}>
        {optionnel && <option value="">— Aucune —</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Indisponible({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Colonne choisie si elle existe encore dans le fichier, sinon la proposition par défaut. */
function useChoix(defaut: string | null, disponibles: string[]): [string, (v: string) => void] {
  const [choix, setChoix] = useState<string | null>(null);
  const valeur = choix !== null && (choix === "" || disponibles.includes(choix)) ? choix : defaut ?? "";
  return [valeur, setChoix];
}

// ---------------------------------------------------------------------------

function OngletPareto({ entetes, corps, dimensions, mesures, dimDefaut, mesureDefaut }: { entetes: string[]; corps: Cellule[][]; dimensions: string[]; mesures: string[]; dimDefaut: string | null; mesureDefaut: string | null }) {
  const [dim, setDim] = useChoix(dimDefaut, dimensions);
  const [mes, setMes] = useChoix(mesureDefaut, mesures);
  const r = useMemo(() => (dim && mes ? analyserPareto(entetes, corps, dim, mes) : null), [entetes, corps, dim, mes]);

  if (!dimensions.length || !mesures.length) return <Indisponible>Il faut une colonne de catégories (produits, clients, régions…) et une colonne de montants.</Indisponible>;
  const visibles = r?.ok ? r.valeur.elements.slice(0, 30) : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        <Selecteur libelle="Éléments à classer" valeur={dim} options={dimensions} onChange={setDim} />
        <Selecteur libelle="Montant" valeur={mes} options={mesures} onChange={setMes} />
      </div>
      {r && !r.ok && <Indisponible>{r.raison}</Indisponible>}
      {r?.ok && (
        <>
          <p className="text-sm text-slate-800 dark:text-slate-100">{phrasePareto(r.valeur, dim, mes)}</p>
          <div className="h-64 sm:h-72">
            <Bar
              data={{
                labels: visibles.map((e) => e.nom),
                datasets: [
                  {
                    type: "bar" as const,
                    label: mes,
                    data: visibles.map((e) => e.total),
                    backgroundColor: visibles.map((e) => (e.classe === "A" ? "#2563eb" : e.classe === "B" ? "#93c5fd" : "#cbd5e1")),
                    yAxisID: "y",
                    order: 2,
                  },
                  {
                    type: "line" as const,
                    label: "Part cumulée (%)",
                    data: visibles.map((e) => e.cumul),
                    borderColor: "#d97706",
                    backgroundColor: "#d97706",
                    pointRadius: 2,
                    yAxisID: "y1",
                    order: 1,
                  },
                ] as never,
              }}
              options={{
                locale: "fr-FR",
                maintainAspectRatio: false,
                plugins: { ...sansEtiquettes, legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: {
                  x: { ticks: { font: { size: 10 }, maxRotation: 60, autoSkip: true } },
                  y: { beginAtZero: true, ticks: { font: { size: 10 } } },
                  y1: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, callback: (v) => `${v} %` } },
                },
              }}
            />
          </div>
          {r.valeur.elements.length > visibles.length && (
            <p className="text-[11px] text-slate-400">Graphique limité aux 30 premiers ; le tableau ci-dessous compte tous les éléments.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {(["A", "B", "C"] as const).map((c) => (
              <div key={c} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Classe {c} <span className="font-normal text-slate-500">· {r.valeur.classes[c].nb} élément(s) · {pct(r.valeur.classes[c].part)} du total</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {c === "A" ? "L'essentiel du total : suivre de près (disponibilité, prix, relation)." : c === "B" ? "Contribution intermédiaire : gestion courante." : "Longue traîne : à regrouper, simplifier ou rationaliser."}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            <strong>Classe A :</strong> {r.valeur.elements.filter((e) => e.classe === "A").slice(0, 12).map((e) => `${e.nom} (${pct(e.part)})`).join(", ")}
            {r.valeur.classes.A.nb > 12 ? "…" : ""}
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CarteComparaison({ titre, c, granularite }: { titre: string; c: Comparaison | null; granularite: string }) {
  if (!c) {
    return (
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
        <p className="text-[11px] font-semibold text-slate-500">{titre}</p>
        <p className="text-xs text-slate-400 mt-1">{granularite === "annee" ? "Sans objet pour des données annuelles." : "Pas de données pour cette période."}</p>
      </div>
    );
  }
  const hausse = c.ecart > 0;
  const Icone = hausse ? TrendingUp : TrendingDown;
  const couleur = c.ecart === 0 ? "text-slate-500" : hausse ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-500">{titre} ({c.libelle} : {nf(c.valeur)})</p>
      <p className={`text-lg font-bold flex items-center gap-1.5 ${couleur}`}>
        <Icone className="w-4 h-4" />
        {c.variation !== null ? `${signe(c.variation, 1)} %` : "—"}
        <span className="text-xs font-semibold">({signe(c.ecart)})</span>
      </p>
      {c.contributions.length > 0 && (
        <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
          {c.contributions.slice(0, 4).map((k) => (
            <li key={k.nom} className="flex justify-between gap-2">
              <span className="truncate">{k.nom}</span>
              <span className={`font-mono shrink-0 ${k.ecart > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{signe(k.ecart)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OngletEvolution({ entetes, corps, dates, mesures, dimensions, dateDefaut, mesureDefaut, dimDefaut }: { entetes: string[]; corps: Cellule[][]; dates: string[]; mesures: string[]; dimensions: string[]; dateDefaut: string | null; mesureDefaut: string | null; dimDefaut: string | null }) {
  const [date, setDate] = useChoix(dateDefaut, dates);
  const [mes, setMes] = useChoix(mesureDefaut, mesures);
  const [dim, setDim] = useChoix(dimDefaut, dimensions);
  const r = useMemo(() => (date && mes ? analyserEvolution(entetes, corps, date, mes, dim || undefined) : null), [entetes, corps, date, mes, dim]);

  if (!dates.length || !mesures.length) return <Indisponible>Il faut une colonne de dates (ou de mois, d&apos;années) et une colonne de montants.</Indisponible>;
  const p = r?.ok ? r.valeur : null;
  const phrase = p ? phraseEvolution(p, mes) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
        <Selecteur libelle="Date" valeur={date} options={dates} onChange={setDate} />
        <Selecteur libelle="Montant" valeur={mes} options={mesures} onChange={setMes} />
        <Selecteur libelle="Expliquer par" valeur={dim} options={dimensions} onChange={setDim} optionnel />
      </div>
      {r && !r.ok && <Indisponible>{r.raison}</Indisponible>}
      {p && (
        <>
          {phrase && <p className="text-sm text-slate-800 dark:text-slate-100">{phrase}</p>}
          {p.incomplete && (
            <Indisponible>
              {p.periode} semble inachevé (dernière date avant la fin du mois) : la comparaison sous-estime probablement cette période.
            </Indisponible>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-slate-500">Dernière période : {p.periode}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{nf(p.valeur)}</p>
            </div>
            <CarteComparaison titre="Vs période précédente" c={p.precedente} granularite={p.granularite} />
            <CarteComparaison titre="Vs un an plus tôt" c={p.anneePrecedente} granularite={p.granularite} />
          </div>
          {p.serie.length >= 3 && (
            <div className="h-48">
              <Line
                data={{ labels: p.serie.map((s) => s.libelle), datasets: [{ label: mes, data: p.serie.map((s) => s.valeur), borderColor: "#2563eb", backgroundColor: "#2563eb", pointRadius: 2, tension: 0.2 }] }}
                options={{ locale: "fr-FR", maintainAspectRatio: false, plugins: { ...sansEtiquettes, legend: { display: false } }, scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function telechargerSegments(r: ResultatRFM, colClient: string) {
  const echapper = (v: string | number) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lignes = [
    [colClient, "Segment", "Jours depuis le dernier achat", "Nombre d'achats", "Montant total", "Note R", "Note F", "Note M", "Action conseillée"],
    ...r.clients.map((c) => [c.client, c.segment, c.recenceJours, c.frequence, Math.round(c.montant * 100) / 100, c.r, c.f, c.m, CONSEILS_RFM[c.segment]]),
  ];
  // Point-virgule et BOM : ouverture directe et correcte dans Excel en français
  const csv = "﻿" + lignes.map((l) => l.map(echapper).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "segments-clients-rfm.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function OngletRFM({ entetes, corps, clients, dates, mesures, clientDefaut, dateDefaut, mesureDefaut }: { entetes: string[]; corps: Cellule[][]; clients: string[]; dates: string[]; mesures: string[]; clientDefaut: string | null; dateDefaut: string | null; mesureDefaut: string | null }) {
  const [cli, setCli] = useChoix(clientDefaut ?? clients[0] ?? null, clients);
  const [date, setDate] = useChoix(dateDefaut, dates);
  const [mes, setMes] = useChoix(mesureDefaut, mesures);
  const r = useMemo(() => (cli && date && mes ? analyserRFM(entetes, corps, cli, date, mes) : null), [entetes, corps, cli, date, mes]);

  if (!clients.length || !dates.length || !mesures.length) {
    return <Indisponible>Il faut un fichier de ventes ou de transactions avec une colonne client, une date et un montant (une ligne par achat).</Indisponible>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
        <Selecteur libelle="Client" valeur={cli} options={clients} onChange={setCli} />
        <Selecteur libelle="Date d'achat" valeur={date} options={dates} onChange={setDate} />
        <Selecteur libelle="Montant" valeur={mes} options={mesures} onChange={setMes} />
      </div>
      {!clientDefaut && <p className="text-[11px] text-slate-500">Aucune colonne ne s&apos;appelle « client » : vérifiez que « {cli} » identifie bien chaque client.</p>}
      {r && !r.ok && <Indisponible>{r.raison}</Indisponible>}
      {r?.ok && (
        <>
          <p className="text-[11px] text-slate-500">
            {r.valeur.clients.length} clients notés de 1 à 5 sur la récence, la fréquence et le montant, par rapport au dernier achat du fichier ({r.valeur.dateReference}).
            {r.valeur.frequenceUniforme && " Chaque client n'a qu'une ligne : la fréquence ne les distingue pas (fichier déjà agrégé ?)."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5 pr-2">Segment</th>
                  <th className="py-1.5 pr-2 text-right">Clients</th>
                  <th className="py-1.5 pr-2 min-w-[9rem]">Part du montant</th>
                  <th className="py-1.5 pr-2 text-right whitespace-nowrap">Dernier achat</th>
                  <th className="py-1.5 hidden md:table-cell">Action conseillée</th>
                </tr>
              </thead>
              <tbody>
                {r.valeur.segments.map((s) => (
                  <tr key={s.segment} className="border-b border-slate-100 dark:border-slate-800/60 align-top">
                    <td className="py-2 pr-2 font-semibold text-slate-800 dark:text-slate-100">
                      <span className="whitespace-nowrap">{s.segment}</span>
                      <span className="md:hidden block font-normal text-[10px] text-slate-500 min-w-[8rem]">{CONSEILS_RFM[s.segment]}</span>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono whitespace-nowrap">{s.nb} <span className="text-slate-400">({pct(s.partClients)})</span></td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, s.partMontant)}%` }} />
                        </div>
                        <span className="font-mono w-12 text-right">{pct(s.partMontant)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap text-slate-500">il y a {nf(s.recenceMoyenne)} j</td>
                    <td className="py-2 text-slate-600 dark:text-slate-300 hidden md:table-cell">{CONSEILS_RFM[s.segment]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => r.ok && telechargerSegments(r.valeur, cli)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Liste des clients avec leur segment (CSV)
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function OngletCohortes({ entetes, corps, clients, dates, clientDefaut, dateDefaut }: { entetes: string[]; corps: Cellule[][]; clients: string[]; dates: string[]; clientDefaut: string | null; dateDefaut: string | null }) {
  const [cli, setCli] = useChoix(clientDefaut ?? clients[0] ?? null, clients);
  const [date, setDate] = useChoix(dateDefaut, dates);
  const r = useMemo(() => (cli && date ? analyserCohortes(entetes, corps, cli, date) : null), [entetes, corps, cli, date]);

  if (!clients.length || !dates.length) return <Indisponible>Il faut une colonne client et une date (une ligne par achat ou par visite).</Indisponible>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        <Selecteur libelle="Client" valeur={cli} options={clients} onChange={setCli} />
        <Selecteur libelle="Date" valeur={date} options={dates} onChange={setDate} />
      </div>
      {r && !r.ok && <Indisponible>{r.raison}</Indisponible>}
      {r?.ok && (
        <>
          {r.ok && phraseCohortes(r.valeur) && <p className="text-sm text-slate-800 dark:text-slate-100">{phraseCohortes(r.valeur)}</p>}
          <div className="overflow-x-auto">
            <table className="text-[11px] border-separate border-spacing-0.5">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left pr-2 font-semibold">1ᵉʳ achat</th>
                  <th className="text-right pr-2 font-semibold">Clients</th>
                  {Array.from({ length: r.valeur.nbMois }, (_, k) => (
                    <th key={k} className="w-11 font-semibold">{k === 0 ? "M0" : `M+${k}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.valeur.cohortes.map((c) => (
                  <tr key={c.mois}>
                    <td className="pr-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{c.mois}</td>
                    <td className="pr-2 text-right font-mono text-slate-500">{c.taille}</td>
                    {c.retention.map((v, k) => (
                      <td
                        key={k}
                        className="w-11 h-7 text-center font-mono rounded"
                        style={v === null ? undefined : { backgroundColor: `rgba(37, 99, 235, ${0.08 + (0.85 * v) / 100})`, color: v > 55 ? "#fff" : undefined }}
                      >
                        {v === null ? "" : `${Math.round(v)}`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            Chaque ligne suit les clients selon le mois de leur premier achat : % encore actifs 1, 2, 3… mois plus tard. Une diagonale qui pâlit vite signale un problème de fidélisation.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AnalysesMetier({ entetes, corps, statistiques, mesures }: Props) {
  const [onglet, setOnglet] = useState<Onglet>("pareto");
  const det = useMemo(() => detecterColonnesMetier(statistiques, mesures), [statistiques, mesures]);
  const actif = ONGLETS.find((o) => o.id === onglet)!;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Analyses métier" className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            role="tab"
            type="button"
            aria-selected={onglet === o.id}
            onClick={() => setOnglet(o.id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              onglet === o.id
                ? "bg-blue-600 text-white border-blue-600"
                : "text-slate-700 border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            {o.titre}
          </button>
        ))}
      </div>
      <p className="text-[11px] sm:text-xs text-slate-500">{actif.question}</p>
      <div role="tabpanel">
        {onglet === "pareto" && <OngletPareto entetes={entetes} corps={corps} dimensions={det.dimensions} mesures={det.mesures} dimDefaut={det.dimensions[0] ?? null} mesureDefaut={det.mesure} />}
        {onglet === "evolution" && <OngletEvolution entetes={entetes} corps={corps} dates={det.dates} mesures={det.mesures} dimensions={det.dimensions} dateDefaut={det.date} mesureDefaut={det.mesure} dimDefaut={det.explicative} />}
        {onglet === "rfm" && <OngletRFM entetes={entetes} corps={corps} clients={det.candidatsClient} dates={det.dates} mesures={det.mesures} clientDefaut={det.client} dateDefaut={det.date} mesureDefaut={det.mesure} />}
        {onglet === "cohortes" && <OngletCohortes entetes={entetes} corps={corps} clients={det.candidatsClient} dates={det.dates} clientDefaut={det.client} dateDefaut={det.date} />}
      </div>
    </div>
  );
}

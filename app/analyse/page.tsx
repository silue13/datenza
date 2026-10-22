"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useData } from "../context/DataContext";
import GraphiqueGenerateur from "../components/GraphiqueGenerateur";
import CarteGeographique from "../components/CarteGeographique";
import TableauCroiseDynamique from "../components/TableauCroiseDynamique";

interface Cat { total: number; nbCategoriesDistinctes: number; topValeurs: { valeur: string; effectif: number; pourcentage: number }[] }
interface Num { n: number; moyenne: number | null; mediane: number | null; min: number | null; max: number | null; atypiques: number }
interface Boo { vrai: number; faux: number }
interface Dat { n: number; min: string | null; max: string | null }
interface Ident { distincts: number; unicite: number }

const carte = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm";
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR"));

export default function AnalysePage() {
  const { nomFichier, entetes, corps, resultat, rapport, epinglerGraphique } = useData();

  // Lignes strictement identiques (comparaison sur toutes les colonnes du fichier).
  const doublons = useMemo(() => {
    const vus = new Set<string>();
    let n = 0;
    for (const ligne of corps) {
      const cle = ligne.map((v) => String(v ?? "").trim()).join("\u001f");
      if (vus.has(cle)) n++;
      else vus.add(cle);
    }
    return n;
  }, [corps]);

  const manquants = useMemo(
    () => (resultat ? Object.values(resultat.statistiques).reduce((s, c) => s + c.nbVides, 0) : 0),
    [resultat]
  );

  if (corps.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Analyse</h1>
        <p className="text-slate-500 text-sm">
          Aucun fichier n&apos;a été importé. Veuillez d&apos;abord charger un fichier Excel ou CSV sur l&apos;accueil.
        </p>
      </div>
    );
  }

  if (!resultat) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Analyse</h1>
        <p className="text-slate-500 text-sm">
          Choisis les colonnes à analyser sur l&apos;accueil, puis clique sur « Lancer l&apos;analyse ».
        </p>
        <Link href="/" className="inline-block rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  const noms = Object.keys(resultat.statistiques);
  const correlations = [...resultat.correlations].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16 text-slate-800 dark:text-slate-100 font-sans">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-3xl font-black tracking-tight text-purple-700 dark:text-purple-400">DATENZA</h1>
        <p className="text-xl font-extrabold text-slate-800 dark:text-slate-200">Rapport d&apos;analyse des données</p>
        <p className="text-xs text-slate-500 mt-1">
          <strong className="text-slate-700 dark:text-slate-300">{nomFichier}</strong> — Généré le{" "}
          {new Date().toLocaleDateString("fr-FR")} à {new Date().toLocaleTimeString("fr-FR")}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Lignes analysées", valeur: resultat.nbLignes, couleur: "text-slate-900 dark:text-white" },
          { label: "Colonnes analysées", valeur: `${noms.length} / ${entetes.length}`, couleur: "text-purple-600" },
          { label: "Valeurs manquantes", valeur: manquants, couleur: manquants ? "text-amber-500" : "text-emerald-500" },
          { label: "Doublons", valeur: doublons, couleur: doublons ? "text-amber-500" : "text-emerald-500" },
        ].map((k) => (
          <div key={k.label} className={`${carte} p-5 text-center`}>
            <p className="text-xs font-semibold text-slate-500">{k.label}</p>
            <p className={`text-3xl font-black mt-1 ${k.couleur}`}>{typeof k.valeur === "number" ? fmt(k.valeur) : k.valeur}</p>
          </div>
        ))}
      </div>

      <div className={`${carte} p-6 space-y-4`}>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white border-b pb-2 border-slate-100 dark:border-slate-800">Synthèse</h2>
        <ul className="space-y-2.5 text-sm leading-relaxed">
          {rapport.map((b, i) => (
            <li key={i} className="border-b border-slate-100 dark:border-slate-800 pb-2.5 last:border-0">{b.texte}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Statistiques par colonne</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {noms.map((nom) => {
            const info = resultat.statistiques[nom];
            const s = info.stats;
            return (
              <div key={nom} className={`${carte} p-4 space-y-2`}>
                <div className="flex justify-between items-center gap-2 border-b pb-2 border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-sm truncate">{nom}</span>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 whitespace-nowrap">
                    {info.type}
                  </span>
                </div>
                <div className="text-xs space-y-1.5 pt-1">
                  {info.type === "numerique" && (() => {
                    const n = s as unknown as Num;
                    return (
                      <>
                        <Ligne l="Moyenne" v={fmt(n.moyenne)} />
                        <Ligne l="Médiane" v={fmt(n.mediane)} />
                        <Ligne l="Min / Max" v={`${fmt(n.min)} / ${fmt(n.max)}`} />
                        {n.atypiques > 0 && <Ligne l="Valeurs atypiques" v={fmt(n.atypiques)} />}
                        {info.tendance && <Ligne l="Tendance" v={info.tendance.direction} />}
                      </>
                    );
                  })()}
                  {info.type === "categorielle" && (() => {
                    const c = s as unknown as Cat;
                    return (
                      <>
                        <p className="text-[10px] text-slate-400">{fmt(c.total)} valeurs — {fmt(c.nbCategoriesDistinctes)} catégories</p>
                        {c.topValeurs.map((t, i) => (
                          <Ligne key={t.valeur} l={t.valeur} v={`${fmt(t.effectif)} (${t.pourcentage} %)`} fort={i === 0} />
                        ))}
                      </>
                    );
                  })()}
                  {info.type === "booleen" && (() => {
                    const b = s as unknown as Boo;
                    return (
                      <>
                        <Ligne l="Oui" v={fmt(b.vrai)} />
                        <Ligne l="Non" v={fmt(b.faux)} />
                      </>
                    );
                  })()}
                  {info.type === "date" && (() => {
                    const d = s as unknown as Dat;
                    return (
                      <>
                        <Ligne l="Du" v={d.min ? d.min.slice(0, 10) : "—"} />
                        <Ligne l="Au" v={d.max ? d.max.slice(0, 10) : "—"} />
                      </>
                    );
                  })()}
                  {info.type === "identifiant" && (() => {
                    const d = s as unknown as Ident;
                    return (
                      <>
                        <Ligne l="Valeurs distinctes" v={fmt(d.distincts)} />
                        <Ligne l="Unicité" v={`${d.unicite} %`} />
                      </>
                    );
                  })()}
                  <Ligne l="Remplissage" v={`${info.tauxRemplissage} %`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {correlations.length > 0 && (
        <div className={`${carte} p-6 space-y-3`}>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Corrélations</h2>
          <p className="text-xs text-slate-500">
            Une corrélation ne prouve pas une causalité. Les cellules vides sont ignorées dans le calcul.
          </p>
          <ul className="text-sm space-y-1.5">
            {correlations.slice(0, 10).map((c) => (
              <li key={`${c.colonneA}|${c.colonneB}`} className="flex justify-between gap-3">
                <span>{c.colonneA} ↔ {c.colonneB}</span>
                <span className="font-semibold">r = {c.coefficient} <span className="font-normal text-slate-500">({c.interpretation})</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <GraphiqueGenerateur key={`g-${nomFichier}`} entetes={entetes} corps={corps} onEpingler={epinglerGraphique} />
      <CarteGeographique key={`c-${nomFichier}`} entetes={entetes} corps={corps} />
      <TableauCroiseDynamique key={`t-${nomFichier}`} entetes={entetes} corps={corps} />
    </div>
  );
}

function Ligne({ l, v, fort }: { l: string; v: string; fort?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${fort ? "font-bold text-purple-600 dark:text-purple-400" : "text-slate-600 dark:text-slate-400"}`}>
      <span className="truncate">{l}</span>
      <span className="whitespace-nowrap font-semibold">{v}</span>
    </div>
  );
}

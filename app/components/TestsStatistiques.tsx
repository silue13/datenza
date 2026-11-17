"use client";

import { useState } from "react";
import { CheckCircle2, CircleSlash, Info, Link2 } from "lucide-react";
import { formaterP, type ResumeGroupe } from "../../lib/analyse/inference";
import {
  AVERTISSEMENT_TESTS,
  interpreterTest,
  libelleEffet,
  LIBELLES_VERDICT,
  nomMethode,
  trierTests,
  verdictTest,
  type ComparaisonGroupes,
  type Verdict,
  type TestStatistique,
} from "../../lib/analyse/testsStatistiques";

const nf = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 2 });

/** Boîtes à moustaches horizontales, une par groupe, sur une échelle commune. */
function BoitesMoustaches({ groupes, mesure }: { groupes: ResumeGroupe[]; mesure: string }) {
  const min = Math.min(...groupes.map((g) => g.moustacheBasse));
  const max = Math.max(...groupes.map((g) => g.moustacheHaute));
  const etendue = max - min || 1;
  const pos = (x: number) => `${((x - min) / etendue) * 100}%`;
  const larg = (a: number, b: number) => `${(Math.max(b - a, 0) / etendue) * 100}%`;

  return (
    <figure className="space-y-1.5" aria-label={`Distribution de ${mesure} par groupe`}>
      {groupes.map((g) => (
        <div key={g.nom} className="grid grid-cols-[minmax(0,7rem)_1fr] sm:grid-cols-[minmax(0,9rem)_1fr] items-center gap-2">
          <span className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 truncate" title={g.nom}>
            {g.nom} <span className="text-slate-400">({g.n})</span>
          </span>
          <div
            className="relative h-5"
            title={`${g.nom} — médiane ${nf(g.mediane)}, moyenne ${nf(g.moyenne)}, quartiles ${nf(g.q1)} à ${nf(g.q3)}, ${g.n} lignes${g.nbAtypiques ? `, ${g.nbAtypiques} valeur(s) atypique(s)` : ""}`}
          >
            {/* Moustaches */}
            <div className="absolute top-1/2 h-px bg-slate-400 dark:bg-slate-500" style={{ left: pos(g.moustacheBasse), width: larg(g.moustacheBasse, g.moustacheHaute) }} />
            <div className="absolute top-1 bottom-1 w-px bg-slate-400 dark:bg-slate-500" style={{ left: pos(g.moustacheBasse) }} />
            <div className="absolute top-1 bottom-1 w-px bg-slate-400 dark:bg-slate-500" style={{ left: pos(g.moustacheHaute) }} />
            {/* Boîte (quartiles) */}
            <div
              className="absolute top-0.5 bottom-0.5 rounded-sm bg-blue-100 border border-blue-500 dark:bg-blue-950/60 dark:border-blue-400"
              style={{ left: pos(g.q1), width: larg(g.q1, g.q3), minWidth: 2 }}
            />
            {/* Médiane */}
            <div className="absolute top-0.5 bottom-0.5 w-0.5 bg-blue-700 dark:bg-blue-300" style={{ left: pos(g.mediane) }} />
            {/* Moyenne */}
            <div
              className="absolute top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900"
              style={{ left: pos(g.moyenne) }}
            />
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,7rem)_1fr] sm:grid-cols-[minmax(0,9rem)_1fr] gap-2 text-[9px] sm:text-[10px] text-slate-400 font-mono" aria-hidden>
        <span />
        <span className="flex justify-between">
          <span>{nf(min)}</span>
          <span>{nf(max)}</span>
        </span>
      </div>
      <figcaption className="text-[9px] sm:text-[10px] text-slate-400">
        Boîte : 50 % central des valeurs · trait : médiane · <span className="text-amber-500">●</span> moyenne · moustaches : hors valeurs atypiques
      </figcaption>
    </figure>
  );
}

const STYLES_VERDICT: Record<Verdict, { classe: string; Icone: typeof Info }> = {
  demontre: { classe: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", Icone: CheckCircle2 },
  faible: { classe: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", Icone: Info },
  nonDemontre: { classe: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", Icone: CircleSlash },
  redondant: { classe: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", Icone: Link2 },
};

function Badge({ t }: { t: TestStatistique }) {
  const v = verdictTest(t);
  const { classe, Icone } = STYLES_VERDICT[v];
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full ${classe}`}>
      <Icone className="w-3 h-3" />
      {LIBELLES_VERDICT[v]}
    </span>
  );
}

function CarteTest({ t }: { t: TestStatistique }) {
  const titre = t.type === "comparaison" ? (
    <>
      {t.mesure} <span className="text-slate-400 font-normal">selon</span> {t.dimension}
    </>
  ) : (
    <>
      {t.colonneA} <span className="text-blue-500 font-normal">↔</span> {t.colonneB}
    </>
  );
  return (
    <div className="print-eviter-coupure p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm min-w-0 break-words">{titre}</h4>
        <Badge t={t} />
      </div>
      <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{interpreterTest(t)}</p>
      {t.type === "comparaison" && t.groupes.length >= 2 && (
        <>
          <BoitesMoustaches groupes={t.groupes} mesure={t.mesure} />
          {t.nbGroupes > t.groupes.length && (
            <p className="text-[10px] text-slate-400">
              {t.groupes.length - 1} groupes les plus élevés et le plus bas affichés, sur {t.nbGroupes} testés.
            </p>
          )}
        </>
      )}
      <p className="text-[10px] font-mono text-slate-400">
        {nomMethode(t)} · {formaterP(t.pAjustee)} (corrigée) · {libelleEffet(t)} · {t.nbLignes.toLocaleString("fr-FR")} lignes
      </p>
    </div>
  );
}

export default function TestsStatistiques({ tests }: { tests: TestStatistique[] }) {
  const [tousVisibles, setTousVisibles] = useState(false);
  if (!tests.length) {
    return (
      <p className="text-[11px] sm:text-xs text-slate-500">
        Aucun test applicable : il faut au moins une mesure numérique et une colonne de catégories (2 à 20 groupes d&apos;au moins 2 lignes),
        ou deux colonnes de catégories.
      </p>
    );
  }
  const tries = trierTests(tests);
  const comparaisons = tries.filter((t): t is ComparaisonGroupes => t.type === "comparaison");
  const liens = tries.filter((t) => t.type === "lien");
  const limite = <T,>(l: T[]) => (tousVisibles ? l : l.slice(0, 4));

  return (
    <div className="space-y-4">
      <p className="text-[11px] sm:text-xs text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
        <span>
          Ces tests disent si un écart observé dépasse ce que le hasard produit. Les moyennes sont calculées par ligne du fichier.{" "}
          {AVERTISSEMENT_TESTS.fr}
        </span>
      </p>

      {comparaisons.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Écarts entre groupes</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {limite(comparaisons).map((t) => (
              <CarteTest key={`c|${t.mesure}|${t.dimension}`} t={t} />
            ))}
          </div>
        </div>
      )}

      {liens.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Liens entre catégories</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {limite(liens).map((t) => (
              <CarteTest key={t.type === "lien" ? `l|${t.colonneA}|${t.colonneB}` : ""} t={t} />
            ))}
          </div>
        </div>
      )}

      {(comparaisons.length > 4 || liens.length > 4) && (
        <button
          type="button"
          onClick={() => setTousVisibles((v) => !v)}
          className="print:hidden text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
        >
          {tousVisibles ? "Afficher moins" : `Afficher les ${tests.length} tests`}
        </button>
      )}
    </div>
  );
}

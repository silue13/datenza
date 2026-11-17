"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, Calculator, Check, Database, Link2, Loader2, Pencil, Plus, Sigma, Table2, Trash2, X } from "lucide-react";
import { useData } from "../context/DataContext";
import { lireFichier, EXTENSIONS_ACCEPTEES } from "../../lib/import/lecture";
import { suggererRelation, tauxCorrespondance, type Relation, type TableReference } from "../../lib/analyse/modele";
import {
  CalculateurMesures,
  formaterMesure,
  modelesMesures,
  validerFormule,
  type DefinitionMesure,
  type FormatMesure,
} from "../../lib/analyse/formules";
import { estValeurVide, parseNombre } from "../../lib/analyse/utils";

const champ =
  "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
const etiquette = "block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1";
const boutonPrincipal =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
const boutonSecondaire =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer";

const nouvelId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const pct = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString("fr-FR")} %`;

/** Panneau « Modèle de données » de la page Analyse : tables de référence reliées et mesures réutilisables. */
export default function ModeleDonnees() {
  const { entetes, corps, lectureSeule, tablesReference, mesures } = useData();
  const [onglet, setOnglet] = useState<"tables" | "mesures">("tables");
  if (!entetes.length) return null;

  const resume = [
    tablesReference.length ? `${tablesReference.length} table${tablesReference.length > 1 ? "s" : ""} reliée${tablesReference.length > 1 ? "s" : ""}` : null,
    mesures.length ? `${mesures.length} mesure${mesures.length > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="print:hidden group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
      <summary className="list-none cursor-pointer select-none flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 dark:text-white">Modèle de données</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {resume || "Reliez d'autres tables (produits, régions…) et définissez vos propres mesures"}
            </span>
          </span>
        </span>
        <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0 group-open:hidden">Ouvrir</span>
        <span className="text-[11px] font-semibold text-slate-500 shrink-0 hidden group-open:inline">Fermer</span>
      </summary>

      <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 sm:px-5 space-y-4">
        <div role="tablist" className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
          {(
            [
              ["tables", "Tables reliées", Link2],
              ["mesures", "Mesures", Sigma],
            ] as const
          ).map(([id, libelle, Icone]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={onglet === id}
              onClick={() => setOnglet(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                onglet === id ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-xs" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Icone className="w-3.5 h-3.5" />
              {libelle}
            </button>
          ))}
        </div>
        {lectureSeule && <p className="text-[11px] text-slate-500">Projet partagé en lecture seule : le modèle est consultable, pas modifiable.</p>}
        {onglet === "tables" ? <OngletTables /> : <OngletMesures entetes={entetes} corps={corps} />}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- Tables reliées

function OngletTables() {
  const { sources, tablesReference, relations, diagnosticsModele, ajouterTableReference, retirerTableReference, retirerRelation, lectureSeule } = useDataModele();
  const [enChargement, setEnChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<Relation | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  async function importer(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setErreur(null);
    setEnChargement(true);
    try {
      const tableau = await lireFichier(fichier);
      const table: TableReference = {
        id: nouvelId(),
        nom: fichier.name.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 60) || "Table",
        entetes: tableau.entetes,
        corps: tableau.corps,
      };
      ajouterTableReference(table);
      // Relation proposée d'emblée : la paire de colonnes dont les valeurs se retrouvent le mieux
      const s = suggererRelation(sources, table);
      setEdition({
        id: nouvelId(),
        tableId: table.id,
        colonnePrincipale: s?.colonnePrincipale ?? sources.entetes[0] ?? "",
        colonneCle: s?.colonneCle ?? table.entetes[0] ?? "",
        colonnes: table.entetes.filter((c) => c !== (s?.colonneCle ?? table.entetes[0])),
      });
      if (!s) setErreur("Aucune colonne commune évidente n'a été trouvée : choisissez vous-même les deux colonnes à relier.");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Lecture du fichier impossible.");
    } finally {
      setEnChargement(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        Une table de référence complète votre fichier principal : par exemple une liste de produits (code, libellé, famille, prix) reliée aux ventes par
        le code produit. Ses colonnes deviennent utilisables partout : filtres, graphiques, tableau croisé, colonnes calculées et mesures.
      </p>

      {!lectureSeule && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={champFichier} type="file" accept={EXTENSIONS_ACCEPTEES} onChange={importer} className="hidden" />
          <button type="button" onClick={() => champFichier.current?.click()} disabled={enChargement} className={boutonPrincipal}>
            {enChargement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Ajouter une table de référence
          </button>
          {tablesReference.length > 0 && !edition && (
            <button
              type="button"
              className={boutonSecondaire}
              onClick={() =>
                setEdition({
                  id: nouvelId(),
                  tableId: tablesReference[0].id,
                  colonnePrincipale: sources.entetes[0] ?? "",
                  colonneCle: tablesReference[0].entetes[0] ?? "",
                  colonnes: tablesReference[0].entetes.slice(1),
                })
              }
            >
              <Link2 className="w-3.5 h-3.5" />
              Nouvelle relation
            </button>
          )}
        </div>
      )}

      {erreur && (
        <p role="alert" className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {erreur}
        </p>
      )}

      {edition && <FormulaireRelation initiale={edition} onFermer={() => setEdition(null)} />}

      {relations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Relations</h4>
          {relations.map((r, i) => {
            const table = tablesReference.find((t) => t.id === r.tableId);
            const d = diagnosticsModele[i];
            const total = d ? d.lignesReliees + d.lignesSansCorrespondance : 0;
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    <strong>{r.colonnePrincipale}</strong> <span className="text-slate-400">(fichier principal)</span> →{" "}
                    <strong>{r.colonneCle}</strong> <span className="text-slate-400">({table?.nom ?? "table retirée"})</span>
                  </p>
                  {!lectureSeule && (
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" title="Modifier la relation" onClick={() => setEdition(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-900 cursor-pointer">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Supprimer la relation" onClick={() => retirerRelation(r.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-900 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                {d?.erreur ? (
                  <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">{d.erreur}</p>
                ) : (
                  d && (
                    <>
                      <p className={`text-[11px] ${d.lignesSansCorrespondance ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {total ? `${d.lignesReliees.toLocaleString("fr-FR")} ligne(s) reliée(s) sur ${total.toLocaleString("fr-FR")} (${pct(d.lignesReliees / total)})` : "Aucune clé renseignée dans le fichier principal."}
                        {d.lignesSansCorrespondance > 0 &&
                          ` · ${d.lignesSansCorrespondance.toLocaleString("fr-FR")} sans correspondance (ex. ${d.exemplesSansCorrespondance.map((x) => `« ${x} »`).join(", ")}) : leurs colonnes reliées restent vides.`}
                      </p>
                      {d.clesEnDouble.length > 0 && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Clé(s) en double dans « {table?.nom} » : {d.clesEnDouble.map((x) => `« ${x} »`).join(", ")}. La première ligne est retenue.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {d.colonnesAjoutees.map((c) => (
                          <span key={c.nom} className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold">
                            + {c.nom}
                          </span>
                        ))}
                      </div>
                    </>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {tablesReference.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Tables de référence</h4>
          <div className="flex flex-wrap gap-2">
            {tablesReference.map((t) => {
              const utilisee = relations.some((r) => r.tableId === t.id);
              return (
                <span key={t.id} className="inline-flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
                  <Table2 className="w-3.5 h-3.5 text-indigo-500" />
                  <strong>{t.nom}</strong>
                  <span className="text-slate-400">
                    {t.corps.length.toLocaleString("fr-FR")} lignes · {t.entetes.length} col.{utilisee ? "" : " · non reliée"}
                  </span>
                  {!lectureSeule && (
                    <button
                      type="button"
                      title={utilisee ? "Retirer la table et ses relations" : "Retirer la table"}
                      onClick={() => retirerTableReference(t.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">Les tables de référence sont enregistrées avec la session et avec le projet, comme le fichier principal.</p>
        </div>
      )}
    </div>
  );
}

function FormulaireRelation({ initiale, onFermer }: { initiale: Relation; onFermer: () => void }) {
  const { sources, tablesReference, diagnosticsModele, enregistrerRelation, relations } = useDataModele();
  const [rel, setRel] = useState<Relation>(initiale);
  const table = tablesReference.find((t) => t.id === rel.tableId) ?? null;
  const existante = relations.some((r) => r.id === rel.id);
  // Point de départ possible : le fichier principal et les colonnes ajoutées par les relations précédentes (pas par celle-ci)
  const rang = relations.findIndex((r) => r.id === rel.id);
  const colonnesPrincipales = [
    ...sources.entetes,
    ...diagnosticsModele.slice(0, rang === -1 ? diagnosticsModele.length : rang).flatMap((d) => d.colonnesAjoutees.map((c) => c.nom)),
  ];

  const apercu = useMemo(() => {
    if (!table) return null;
    const i = sources.entetes.indexOf(rel.colonnePrincipale);
    const j = table.entetes.indexOf(rel.colonneCle);
    if (i === -1 || j === -1) return null;
    return tauxCorrespondance(
      sources.corps.slice(0, 5000).map((l) => l[i]),
      table.corps.map((l) => l[j])
    );
  }, [table, sources, rel.colonnePrincipale, rel.colonneCle]);

  function changerTable(id: string) {
    const t = tablesReference.find((x) => x.id === id);
    if (!t) return;
    const s = suggererRelation(sources, t);
    setRel({ ...rel, tableId: id, colonneCle: s?.colonneCle ?? t.entetes[0], colonnePrincipale: s?.colonnePrincipale ?? rel.colonnePrincipale, colonnes: t.entetes.filter((c) => c !== (s?.colonneCle ?? t.entetes[0])) });
  }

  if (!table) return null;
  const colonnesDisponibles = table.entetes.filter((c) => c !== rel.colonneCle);
  const valide = !!rel.colonnePrincipale && !!rel.colonneCle && rel.colonnes.length > 0;

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-3">
      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{existante ? "Modifier la relation" : "Relier une table"}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label className={etiquette}>Table de référence</label>
          <select value={rel.tableId} onChange={(e) => changerTable(e.target.value)} className={champ}>
            {tablesReference.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiquette}>Colonne du fichier principal</label>
          <select value={rel.colonnePrincipale} onChange={(e) => setRel({ ...rel, colonnePrincipale: e.target.value })} className={champ}>
            {colonnesPrincipales.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiquette}>Clé dans « {table.nom} »</label>
          <select
            value={rel.colonneCle}
            onChange={(e) => setRel({ ...rel, colonneCle: e.target.value, colonnes: rel.colonnes.filter((c) => c !== e.target.value) })}
            className={champ}
          >
            {table.entetes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {apercu !== null && (
        <p className={`text-[11px] font-semibold ${apercu >= 0.9 ? "text-emerald-700 dark:text-emerald-400" : apercu >= 0.5 ? "text-amber-700 dark:text-amber-400" : "text-rose-700 dark:text-rose-400"}`}>
          {pct(apercu)} des valeurs de « {rel.colonnePrincipale} » se retrouvent dans « {rel.colonneCle} »
          {apercu < 0.5 ? " : ces deux colonnes ne semblent pas correspondre." : "."}
        </p>
      )}
      <div>
        <span className={etiquette}>Colonnes à ajouter au fichier principal</span>
        <div className="flex flex-wrap gap-1.5">
          {colonnesDisponibles.map((c) => {
            const coche = rel.colonnes.includes(c);
            return (
              <label
                key={c}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer select-none ${
                  coche ? "border-blue-500 bg-white dark:bg-slate-900 text-blue-800 dark:text-blue-200" : "border-slate-200 dark:border-slate-700 text-slate-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={coche}
                  onChange={() => setRel({ ...rel, colonnes: coche ? rel.colonnes.filter((x) => x !== c) : [...rel.colonnes, c] })}
                  className="accent-blue-600 h-3.5 w-3.5"
                />
                {c}
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!valide}
          onClick={() => {
            enregistrerRelation(rel);
            onFermer();
          }}
          className={boutonPrincipal}
        >
          <Check className="w-3.5 h-3.5" />
          {existante ? "Enregistrer" : "Relier"}
        </button>
        <button type="button" onClick={onFermer} className={boutonSecondaire}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Mesures

const MESURE_VIDE = { nom: "", formule: "", format: "nombre" as FormatMesure, unite: "" };

function OngletMesures({ entetes, corps }: { entetes: string[]; corps: (string | number | boolean | null | undefined | Date)[][] }) {
  const { mesures, enregistrerMesure, supprimerMesure, lectureSeule } = useData();
  const [edition, setEdition] = useState<{ id: string | null; nom: string; formule: string; format: FormatMesure; unite: string } | null>(null);
  const zoneFormule = useRef<HTMLTextAreaElement>(null);

  const colonnesNumeriques = useMemo(
    () =>
      entetes.filter((h, i) => {
        const vals = corps.slice(0, 500).map((l) => l[i]).filter((v) => !estValeurVide(v));
        return vals.length > 0 && vals.filter((v) => parseNombre(v) !== null).length / vals.length >= 0.7;
      }),
    [entetes, corps]
  );
  const calculateur = useMemo(() => new CalculateurMesures(entetes, corps as never, mesures), [entetes, corps, mesures]);

  const brouillon: DefinitionMesure | null = edition
    ? { id: edition.id ?? "__brouillon__", nom: edition.nom.trim() || "Nouvelle mesure", formule: edition.formule, format: edition.format, ...(edition.unite.trim() ? { unite: edition.unite.trim() } : {}) }
    : null;
  const toutes = brouillon ? [...mesures.filter((m) => m.id !== brouillon.id), brouillon] : mesures;
  const validation = edition && edition.formule.trim() ? validerFormule(edition.formule, entetes, toutes, brouillon?.id) : null;
  const nomPris = !!edition && mesures.some((m) => m.id !== edition.id && m.nom.trim().toLowerCase() === edition.nom.trim().toLowerCase());
  const nomColonne = !!edition && entetes.some((h) => h.trim().toLowerCase() === edition.nom.trim().toLowerCase());
  const valeurBrouillon = brouillon && validation?.ok ? new CalculateurMesures(entetes, corps as never, toutes).calculerOuVide(brouillon, corps as never) : null;

  function inserer(texte: string) {
    if (!edition) return;
    const zone = zoneFormule.current;
    const debut = zone?.selectionStart ?? edition.formule.length;
    const fin = zone?.selectionEnd ?? edition.formule.length;
    const formule = edition.formule.slice(0, debut) + texte + edition.formule.slice(fin);
    setEdition({ ...edition, formule });
    requestAnimationFrame(() => {
      zone?.focus();
      zone?.setSelectionRange(debut + texte.length, debut + texte.length);
    });
  }

  function enregistrer() {
    if (!edition || !validation?.ok || !edition.nom.trim() || nomPris || nomColonne) return;
    enregistrerMesure({
      id: edition.id ?? nouvelId(),
      nom: edition.nom.trim(),
      formule: edition.formule.trim(),
      format: edition.format,
      ...(edition.unite.trim() ? { unite: edition.unite.trim() } : {}),
    });
    setEdition(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        Une mesure est un calcul nommé, défini une fois : chiffre d&apos;affaires, marge, taux, part du total… Elle s&apos;affiche dans les indicateurs, se
        choisit dans les graphiques personnalisés et se recalcule avec les filtres.
      </p>

      {mesures.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {mesures.map((m) => {
            let valeur: string;
            try {
              valeur = formaterMesure(calculateur.calculer(m, corps as never), m);
            } catch {
              valeur = "Formule à corriger";
            }
            return (
              <div key={m.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{m.nom}</p>
                  <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">{valeur}</p>
                  <code className="block text-[10px] text-slate-500 dark:text-slate-400 break-all">{m.formule}</code>
                </div>
                {!lectureSeule && (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Modifier"
                      onClick={() => setEdition({ id: m.id, nom: m.nom, formule: m.formule, format: m.format, unite: m.unite ?? "" })}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-900 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" title="Supprimer" onClick={() => supprimerMesure(m.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-900 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!lectureSeule && !edition && (
        <div className="space-y-2">
          <button type="button" onClick={() => setEdition({ id: null, ...MESURE_VIDE })} className={boutonPrincipal}>
            <Plus className="w-3.5 h-3.5" />
            Nouvelle mesure
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Exemples :</span>
            {modelesMesures(colonnesNumeriques)
              .filter((x) => !mesures.some((m) => m.nom === x.nom))
              .map((x) => (
                <button
                  key={x.nom}
                  type="button"
                  onClick={() => setEdition({ id: null, nom: x.nom, formule: x.formule, format: x.format, unite: "" })}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-blue-400 cursor-pointer"
                >
                  {x.nom}
                </button>
              ))}
          </div>
        </div>
      )}

      {edition && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-3">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5 text-blue-600" />
            {edition.id ? "Modifier la mesure" : "Nouvelle mesure"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div className="sm:col-span-2">
              <label htmlFor="nom-mesure" className={etiquette}>
                Nom
              </label>
              <input id="nom-mesure" value={edition.nom} maxLength={80} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} placeholder="Chiffre d'affaires" className={champ} />
            </div>
            <div>
              <label htmlFor="format-mesure" className={etiquette}>
                Affichage
              </label>
              <select id="format-mesure" value={edition.format} onChange={(e) => setEdition({ ...edition, format: e.target.value as FormatMesure })} className={champ}>
                <option value="nombre">Nombre</option>
                <option value="pourcentage">Pourcentage (0,25 → 25 %)</option>
              </select>
            </div>
            <div>
              <label htmlFor="unite-mesure" className={etiquette}>
                Unité (facultative)
              </label>
              <input
                id="unite-mesure"
                value={edition.unite}
                maxLength={20}
                disabled={edition.format === "pourcentage"}
                onChange={(e) => setEdition({ ...edition, unite: e.target.value })}
                placeholder="FCFA"
                className={`${champ} disabled:opacity-40`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="formule-mesure" className={etiquette}>
              Formule
            </label>
            <textarea
              id="formule-mesure"
              ref={zoneFormule}
              value={edition.formule}
              onChange={(e) => setEdition({ ...edition, formule: e.target.value })}
              rows={2}
              spellCheck={false}
              placeholder="SOMME([Quantité] * [Prix])"
              className={`${champ} font-mono`}
            />
            <div className="mt-1.5 min-h-[18px] text-[11px]" aria-live="polite">
              {nomPris ? (
                <span className="font-semibold text-rose-700 dark:text-rose-400">Une autre mesure porte déjà ce nom.</span>
              ) : nomColonne ? (
                <span className="font-semibold text-rose-700 dark:text-rose-400">Une colonne porte déjà ce nom : choisissez un nom différent.</span>
              ) : validation && !validation.ok ? (
                <span className="font-semibold text-rose-700 dark:text-rose-400">{validation.erreur}</span>
              ) : validation?.ok && brouillon ? (
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Formule correcte · valeur sur les données affichées : {formaterMesure(valeurBrouillon, brouillon)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-500 mr-1">Fonctions :</span>
              {["SOMME(", "MOYENNE(", "MEDIANE(", "MIN(", "MAX(", "NOMBRE()", "DISTINCT(", "TOTAL(", "SI("].map((f) => (
                <button key={f} type="button" onClick={() => inserer(f)} className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer">
                  {f.replace("(", "").replace(")", "")}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1 max-h-24 overflow-y-auto">
              <span className="text-[11px] text-slate-500 mr-1">Colonnes :</span>
              {entetes.map((h) => (
                <button key={h} type="button" onClick={() => inserer(`[${h}]`)} className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300 cursor-pointer">
                  [{h}]
                </button>
              ))}
            </div>
            {mesures.filter((m) => m.id !== edition.id).length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-slate-500 mr-1">Mesures :</span>
                {mesures
                  .filter((m) => m.id !== edition.id)
                  .map((m) => (
                    <button key={m.id} type="button" onClick={() => inserer(`[${m.nom}]`)} className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[10px] font-mono text-indigo-800 dark:text-indigo-300 cursor-pointer">
                      [{m.nom}]
                    </button>
                  ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Colonnes et mesures entre crochets. Condition après un point-virgule : <code className="font-mono">SOMME([Montant]; [Culture] = &quot;Cacao&quot;)</code>.
              Part du total : <code className="font-mono">[Ventes] / TOTAL([Ventes])</code>. Une division par zéro donne une valeur vide.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={enregistrer} disabled={!validation?.ok || !edition.nom.trim() || nomPris || nomColonne} className={boutonPrincipal}>
              <Check className="w-3.5 h-3.5" />
              Enregistrer la mesure
            </button>
            <button type="button" onClick={() => setEdition(null)} className={boutonSecondaire}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Accès au contexte ; « sources » est la table principale telle qu'importée, avant les colonnes reliées. */
function useDataModele() {
  const d = useData();
  return { ...d, sources: d.tablePrincipale };
}

import type { Cellule } from "./analyse/utils";
import type { BlocRapport } from "./analyse/rapport";
import type { ConditionFiltre, DefinitionColonneCalculee } from "./analyse/filtres";
import type { GraphiqueEpingle, ResultatAnalyse } from "../app/context/DataContext";
import { normaliserSource, type SourceDistante } from "./import/source";
import { normaliserRelations, normaliserTables, type Relation, type TableReference } from "./analyse/modele";
import { normaliserMesures, type DefinitionMesure } from "./analyse/formules";

// Sauvegarde locale (IndexedDB) de la session : les données restent après un rechargement
// de la page, jusqu'à ce que l'utilisateur les supprime.

const NOM_BASE = "datenza";
const NOM_STORE = "etat";
const CLE = "session";
// À incrémenter si la forme des données sauvegardées change (une ancienne sauvegarde est alors ignorée)
const VERSION_FORMAT = 1;

export interface EtatPersiste {
  nomFichier: string;
  sources: { entetes: string[]; corps: Cellule[][] };
  choisies: string[];
  rapport: BlocRapport[];
  resultat: ResultatAnalyse | null;
  graphiquesEpingles: GraphiqueEpingle[];
  filtresActifs: ConditionFiltre[];
  definitionsCalculs: DefinitionColonneCalculee[];
  /** Projet du compte auquel cette session est rattachée (absent : fichier non enregistré en ligne). */
  projet?: { id: string; nom: string } | null;
  /** Source en direct (Google Sheets, adresse web) d'où viennent les données ; absente pour un fichier déposé. */
  source?: SourceDistante | null;
  /** Modèle de données : tables de référence reliées à la table principale. */
  tablesReference?: TableReference[];
  relations?: Relation[];
  /** Mesures réutilisables définies par l'utilisateur. */
  mesures?: DefinitionMesure[];
}

function disponible(): boolean {
  return typeof indexedDB !== "undefined";
}

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(NOM_BASE, 1);
    requete.onupgradeneeded = () => {
      if (!requete.result.objectStoreNames.contains(NOM_STORE)) {
        requete.result.createObjectStore(NOM_STORE);
      }
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
    requete.onblocked = () => reject(new Error("Base IndexedDB bloquée"));
  });
}

async function executer<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const base = await ouvrirBase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = base.transaction(NOM_STORE, mode);
      const requete = action(transaction.objectStore(NOM_STORE));
      transaction.oncomplete = () => resolve(requete.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    base.close();
  }
}

export async function sauvegarderEtat(etat: EtatPersiste): Promise<boolean> {
  if (!disponible()) return false;
  try {
    await executer("readwrite", (s) => s.put({ ...etat, version: VERSION_FORMAT }, CLE));
    return true;
  } catch {
    // Si l'analyse détaillée ne peut pas être enregistrée, on garde l'essentiel :
    // elle est recalculée automatiquement à partir des données.
    try {
      await executer("readwrite", (s) =>
        s.put({ ...etat, resultat: null, rapport: [], version: VERSION_FORMAT }, CLE)
      );
      return true;
    } catch {
      return false;
    }
  }
}

export async function chargerEtat(): Promise<EtatPersiste | null> {
  if (!disponible()) return null;
  try {
    const brut = await executer("readonly", (s) => s.get(CLE));
    if (!brut || brut.version !== VERSION_FORMAT) return null;
    if (!brut.sources?.entetes?.length || !brut.sources?.corps?.length) return null;
    return {
      nomFichier: brut.nomFichier ?? "",
      sources: brut.sources,
      choisies: brut.choisies ?? brut.sources.entetes,
      rapport: brut.rapport ?? [],
      resultat: brut.resultat ?? null,
      graphiquesEpingles: brut.graphiquesEpingles ?? [],
      filtresActifs: brut.filtresActifs ?? [],
      definitionsCalculs: brut.definitionsCalculs ?? [],
      projet: brut.projet?.id ? { id: String(brut.projet.id), nom: String(brut.projet.nom ?? "") } : null,
      source: normaliserSource(brut.source),
      tablesReference: normaliserTables(brut.tablesReference),
      relations: normaliserRelations(brut.relations),
      mesures: normaliserMesures(brut.mesures),
    };
  } catch {
    return null;
  }
}

export async function effacerEtat(): Promise<void> {
  if (!disponible()) return;
  try {
    await executer("readwrite", (s) => s.delete(CLE));
  } catch {
    // rien à faire : au pire, l'ancienne sauvegarde sera écrasée à la prochaine importation
  }
}

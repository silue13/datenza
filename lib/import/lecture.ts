// lib/import/lecture.ts — lecture d'un fichier déposé par l'utilisateur (Excel, CSV, TSV, TXT, JSON).
import * as XLSX from "xlsx";
import { decoderTexte, jsonVersLignes, parserCsv, preparerTableau, type TableauImporte } from "./tableau";

export const EXTENSIONS_ACCEPTEES = ".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.txt,.json";

const RE_FEUILLE_DONNEES = /donn[eé]es?|data/i;
const RE_FEUILLE_ANNEXE = /^(m[eé]tadonn[eé]es?|metadata|sch[eé]ma|requ[eê]te|notice|sommaire|notes?|lisez[_\-\s]?moi|readme|l[eé]gende|param[eè]tres?)$/i;

/** Choisit la feuille de données d'un classeur : celle nommée « Données », sinon la plus grande feuille utile. */
export function selectionnerMeilleureFeuille(wb: XLSX.WorkBook): XLSX.WorkSheet {
  if (!wb.SheetNames?.length) throw new Error("Le classeur ne contient aucune feuille.");
  const taille = (nom: string) => {
    const ref = wb.Sheets[nom]?.["!ref"];
    if (!ref) return 0;
    const r = XLSX.utils.decode_range(ref);
    return (r.e.r - r.s.r + 1) * (r.e.c - r.s.c + 1);
  };
  const nommee = wb.SheetNames.find((n) => RE_FEUILLE_DONNEES.test(n.trim()) && taille(n) > 1);
  if (nommee) return wb.Sheets[nommee];
  const utiles = wb.SheetNames.filter((n) => !RE_FEUILLE_ANNEXE.test(n.trim()));
  const candidates = utiles.length ? utiles : wb.SheetNames;
  return wb.Sheets[candidates.reduce((a, b) => (taille(b) > taille(a) ? b : a))];
}

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Lit une feuille cellule par cellule en gardant les VRAIES valeurs :
 * - nombres : la valeur stockée, pas le texte affiché (« 1,234 » affiché reste 1234) ;
 * - dates : reconstruites depuis le numéro de série Excel, sans aucun décalage de fuseau horaire ;
 * - pourcentages : 0,25 au format % devient « 25 % » ;
 * - cellules fusionnées : la valeur est recopiée sur toute la zone fusionnée.
 */
export function feuilleVersLignes(feuille: XLSX.WorkSheet): unknown[][] {
  const ref = feuille["!ref"];
  if (!ref) return [];
  const plage = XLSX.utils.decode_range(ref);
  const lignes: unknown[][] = [];
  for (let r = plage.s.r; r <= plage.e.r; r++) {
    const ligne: unknown[] = [];
    for (let c = plage.s.c; c <= plage.e.c; c++) {
      const cellule = feuille[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cellule || cellule.v === undefined || cellule.v === null || cellule.t === "z") {
        ligne.push("");
      } else if (cellule.t === "e") {
        ligne.push("");
      } else if (cellule.t === "d" && cellule.v instanceof Date) {
        ligne.push(cellule.v);
      } else if (cellule.t === "n" && typeof cellule.v === "number") {
        const format = typeof cellule.z === "string" ? cellule.z : "";
        if (format && XLSX.SSF.is_date(format)) {
          const d = XLSX.SSF.parse_date_code(cellule.v);
          if (!d) ligne.push(cellule.v);
          else if (cellule.v < 1) ligne.push(`${p2(d.H)}:${p2(d.M)}`);
          else {
            const jour = `${d.y}-${p2(d.m)}-${p2(d.d)}`;
            ligne.push(d.H || d.M ? `${jour} ${p2(d.H)}:${p2(d.M)}` : jour);
          }
        } else if (format.includes("%")) {
          ligne.push(`${String(Number((cellule.v * 100).toFixed(6))).replace(".", ",")} %`);
        } else {
          // Corrige le bruit binaire (0,1 + 0,2 = 0,30000000000000004)
          ligne.push(Number.isInteger(cellule.v) ? cellule.v : Number(cellule.v.toPrecision(15)));
        }
      } else {
        ligne.push(cellule.v);
      }
    }
    lignes.push(ligne);
  }
  for (const f of feuille["!merges"] ?? []) {
    const valeur = lignes[f.s.r - plage.s.r]?.[f.s.c - plage.s.c];
    if (valeur === "" || valeur === undefined) continue;
    for (let r = f.s.r; r <= f.e.r; r++) {
      for (let c = f.s.c; c <= f.e.c; c++) {
        const l = lignes[r - plage.s.r];
        if (l && (l[c - plage.s.c] === "" || l[c - plage.s.c] === undefined)) l[c - plage.s.c] = valeur;
      }
    }
  }
  return lignes;
}

/** Lit un fichier et renvoie un tableau propre, quel que soit son format. */
export async function lireFichier(fichier: File): Promise<TableauImporte> {
  const ext = fichier.name.split(".").pop()?.toLowerCase() ?? "";
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let lignes: unknown[][];

  if (ext === "json") {
    lignes = jsonVersLignes(decoderTexte(octets));
  } else if (ext === "csv" || ext === "tsv" || ext === "txt") {
    lignes = parserCsv(decoderTexte(octets));
  } else {
    const wb = XLSX.read(octets, { type: "array", cellNF: true, cellDates: false });
    lignes = feuilleVersLignes(selectionnerMeilleureFeuille(wb));
  }

  const tableau = preparerTableau(lignes);
  if (!tableau.entetes.length) throw new Error(`Fichier ${fichier.name} vide : aucune colonne détectée.`);
  if (!tableau.corps.length) throw new Error(`Le fichier ${fichier.name} contient des en-têtes mais aucune donnée exploitable.`);
  return tableau;
}

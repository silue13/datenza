"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { analyserColonnes } from "../lib/analyse/analyse";
import { genererRapport, type BlocRapport } from "../lib/analyse/rapport";

type Cellule = string | number | boolean | null | undefined;

export default function Page() {
  const [entetes, setEntetes] = useState<string[]>([]);
  const [corps, setCorps] = useState<Cellule[][]>([]);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [rapport, setRapport] = useState<BlocRapport[]>([]);

  async function lireFichier(f: File) {
    const wb = XLSX.read(await f.arrayBuffer());
    const lignes = XLSX.utils.sheet_to_json<Cellule[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: false,
      defval: "",
    });
    const [tete, ...reste] = lignes;
    const noms = tete.map(String);
    setEntetes(noms);
    setCorps(reste);
    setChoisies(noms);
    setRapport([]);
  }

  function basculer(nom: string) {
    setChoisies((c) => (c.includes(nom) ? c.filter((x) => x !== nom) : [...c, nom]));
  }

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "auto" }}>
      <h1>DATENZA</h1>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => e.target.files?.[0] && lireFichier(e.target.files[0])}
      />
      {entetes.length > 0 && (
        <>
          <h3>Colonnes à analyser</h3>
          {entetes.map((nom) => (
            <label key={nom} style={{ display: "block" }}>
              <input type="checkbox" checked={choisies.includes(nom)} onChange={() => basculer(nom)} /> {nom}
            </label>
          ))}
          <button onClick={() => setRapport(genererRapport(analyserColonnes(entetes, corps, choisies)))}>
            Lancer l’analyse
          </button>
        </>
      )}
      {rapport.map((b, i) => (
        <p key={i}>{b.texte}</p>
      ))}
    </main>
  );
}
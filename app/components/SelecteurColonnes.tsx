"use client";
import { useState, useMemo } from "react";

interface SelecteurColonnesProps {
  entetes: string[];
  choisies: string[];
  onChangeChoisies: (nouvellesChoisies: string[]) => void;
  onLancerAnalyse: () => void;
}

export default function SelecteurColonnes({
  entetes,
  choisies,
  onChangeChoisies,
  onLancerAnalyse,
}: SelecteurColonnesProps) {
  const [estOuvert, setEstOuvert] = useState(true);
  const [recherche, setRecherche] = useState("");

  const nombreTotal = entetes.length;
  const nombreSelectionnees = choisies.length;

  const colonnesFiltrees = useMemo(() => {
    if (!recherche.trim()) return entetes;
    const q = recherche.toLowerCase().trim();
    return entetes.filter((nom) => nom.toLowerCase().includes(q));
  }, [entetes, recherche]);

  function basculer(nom: string) {
    if (choisies.includes(nom)) {
      onChangeChoisies(choisies.filter((x) => x !== nom));
    } else {
      onChangeChoisies([...choisies, nom]);
    }
  }

  function toutCocher() {
    onChangeChoisies([...entetes]);
  }

  function toutDecocher() {
    onChangeChoisies([]);
  }

  return (
    <div className="carte selection-colonnes-card">
      {/* En-tête de la section */}
      <div className="selection-colonnes-entete">
        <div>
          <span className="section-kicker">PRÉPARATION DE L&apos;ANALYSE</span>
          <h3 className="margin-0 font-bold">Choisissez les colonnes à analyser</h3>
          <div className="selection-colonnes-resume">
            {nombreSelectionnees} colonne(s) sélectionnée(s)
          </div>
        </div>

        <div className="selection-colonnes-badge">
          {nombreSelectionnees}
        </div>
      </div>

      {/* Bouton de bascule Masquer/Ouvrir */}
      <button
        type="button"
        className="selecteur-colonnes-toggle"
        onClick={() => setEstOuvert(!estOuvert)}
      >
        <span>{estOuvert ? "Masquer les colonnes" : "Choisir les colonnes"}</span>
        <span>{estOuvert ? "▴" : "▾"}</span>
      </button>

      {/* Boîte déroulante fermée/ouverte */}
      {estOuvert && (
        <div className="selecteur-colonnes-zone">
          {/* Barre d'outils (Tout cocher / Tout décocher) */}
          <div className="selection-colonnes-outils">
            <button
              type="button"
              className="selection-colonnes-outil"
              onClick={toutCocher}
              disabled={nombreSelectionnees === nombreTotal}
            >
              ✓ Tout cocher
            </button>
            <button
              type="button"
              className="selection-colonnes-outil"
              onClick={toutDecocher}
              disabled={nombreSelectionnees === 0}
            >
              □ Tout décocher
            </button>
          </div>

          {/* Champ de recherche interne */}
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un champ…"
            className="liste-coches__recherche"
          />

          {/* LA LISTE DÉROULANTE INTERNE AVEC DÉFILEMENT (Max 290px comme sur Apps Script) */}
          <div id="liste-colonnes">
            {colonnesFiltrees.length === 0 ? (
              <div className="liste-coches__vide">Aucun champ trouvé</div>
            ) : (
              colonnesFiltrees.map((nom) => (
                <label key={nom} className="colonne-option">
                  <input
                    type="checkbox"
                    checked={choisies.includes(nom)}
                    onChange={() => basculer(nom)}
                  />
                  <span>{nom}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bouton Lancer l&apos;analyse */}
      <div style={{ marginTop: "14px" }}>
        <button
          type="button"
          className="bouton-accent selection-colonnes-action"
          onClick={onLancerAnalyse}
          disabled={nombreSelectionnees === 0}
        >
          Lancer l&apos;analyse
        </button>
      </div>
    </div>
  );
}
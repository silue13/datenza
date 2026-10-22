"use client";
import { useData } from "../context/DataContext";
import { Bar, Line, Pie } from "react-chartjs-2";
import "../components/chartSetup";

export default function DashboardPage() {
  const { nomFichier, corps, entetes, resultat, graphiquesEpingles, desepinglerGraphique } = useData();
  const manquants = resultat ? Object.values(resultat.statistiques).reduce((s, c) => s + c.nbVides, 0) : null;
  const options = { responsive: true, maintainAspectRatio: false } as const;

  function imprimerRapport() {
    window.print();
  }

  if (!corps || corps.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Tableau de bord</h1>
        <p className="text-slate-500 text-sm">
          Aucune donnée disponible. Veuillez d&apos;abord charger un fichier sur la page d&apos;accueil.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 print:p-0 print:max-w-full font-sans">
      {/* En-tête du Tableau de bord avec bouton d'export PDF */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-600">DATENZA EXECUTIVE</span>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">Tableau de bord</h1>
          <p className="text-slate-500 text-sm">
            <strong className="text-slate-700 dark:text-slate-300">{nomFichier}</strong> — Synthèse des indicateurs et graphiques épinglés
          </p>
        </div>

        <button
          onClick={imprimerRapport}
          className="print:hidden px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow transition flex items-center gap-2"
        >
          📄 Télécharger le Rapport PDF
        </button>
      </div>

      {/* Cartes KPI Globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-500">Total Lignes</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{corps.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-500">Champs / Colonnes</p>
          <p className="text-3xl font-black text-purple-600 mt-1">{entetes.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-500">Graphiques épinglés</p>
          <p className="text-3xl font-black text-indigo-600 mt-1">{graphiquesEpingles.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-500">Valeurs manquantes</p>
          <p className={`text-3xl font-black mt-1 ${manquants ? "text-amber-500" : manquants === 0 ? "text-emerald-500" : "text-slate-400"}`}>{manquants === null ? "—" : manquants.toLocaleString("fr-FR")}</p>
          {manquants === null && <p className="text-[10px] text-slate-400 mt-1">Lance une analyse</p>}
        </div>
      </div>

      {/* Grille des Visualisations épinglées */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Visualisations sélectionnées</h2>

        {graphiquesEpingles.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
            Aucun graphique épinglé pour le moment. Allez sur la page <strong className="text-purple-600">Analyse</strong> et cliquez sur « ★ Ajouter au tableau de bord ».
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {graphiquesEpingles.map((g) => (
              <div
                key={g.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm relative"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{g.titre}</h3>
                  <button
                    onClick={() => desepinglerGraphique(g.id)}
                    className="print:hidden text-[11px] font-semibold text-rose-500 hover:text-rose-700 transition"
                  >
                    Retirer
                  </button>
                </div>

                <div className="h-64 flex items-center justify-center p-2">
                  {g.type === "Barres" && <Bar data={g} options={options} />}
                  {g.type === "Courbe" && <Line data={g} options={options} />}
                  {g.type === "Camembert" && <Pie data={g} options={options} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
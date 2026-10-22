"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation: { name: string; href: string; bientot?: boolean }[] = [
  { name: "Accueil", href: "/" },
  { name: "Analyse", href: "/analyse" },
  { name: "Tableau de bord", href: "/dashboard" },
  { name: "Données Publiques", href: "/opendata", bientot: true },
  { name: "MonChamp (Agri)", href: "/monchamp", bientot: true },
  { name: "Assistant IA", href: "/assistant-ia" },
  { name: "Paramètres", href: "/parametres" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="print:hidden w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between p-4 shrink-0 min-h-screen">
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-xl shadow-md">
            D
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            DATENZA
          </span>
        </div>

        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            if (item.bientot) {
              return (
                <span key={item.name} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 dark:text-slate-600 cursor-not-allowed">
                  {item.name}
                  <span className="text-[9px] uppercase tracking-wide">bientôt</span>
                </span>
              );
            }
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-purple-100/70 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-3.5 py-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
        <p className="text-xs font-semibold text-purple-900 dark:text-purple-300">DATENZA v2.0</p>
        <p className="text-[11px] text-purple-600/80 dark:text-purple-400 mt-0.5">Côte d&apos;Ivoire & Open Data</p>
      </div>
    </aside>
  );
}
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart2, Sparkles, Layers, Settings } from "lucide-react";
import LogoDatenza from "./LogoDatenza";

const navigation = [
  { name: "Accueil", href: "/", icon: Home },
  { name: "Analyse", href: "/analyse", icon: BarChart2 },
  { name: "Assistant IA", href: "/assistant-ia", icon: Sparkles },
  { name: "Fusion & Réconciliation", href: "/fusion", icon: Layers },
  { name: "Paramètres", href: "/parametres", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="print:hidden w-64 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col p-4 shrink-0 min-h-screen">
      <div className="space-y-6">
        {/* En-tête avec LogoDatenza */}
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-center shadow-xs">
            <LogoDatenza taille={26} />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-white block leading-none">
              DATENZA
            </span>
            <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
              Data Intelligence
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-white text-slate-950 font-bold shadow-xs"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-slate-900" : "text-slate-400"}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
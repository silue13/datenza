"use client";

interface LogoProps {
  className?: string;
  taille?: number;
}

export default function LogoDatenza({ className = "", taille = 36 }: LogoProps) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      <defs>
        {/* Dégradé Cobalt pour la structure principale */}
        <linearGradient id="datenza-cobalt" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Dégradé Cyan pour les connexions dynamiques */}
        <linearGradient id="datenza-cyan" x1="20" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>

      {/* Ligne verticale principale du "D" (Montant gauche) */}
      <line x1="14" y1="14" x2="14" y2="34" stroke="url(#datenza-cobalt)" strokeWidth="3" strokeLinecap="round" />
      
      {/* Nœuds du montant gauche */}
      <circle cx="14" cy="14" r="3" fill="#3b82f6" />
      <circle cx="14" cy="24" r="2.5" fill="#2563eb" />
      <circle cx="14" cy="34" r="3" fill="#1d4ed8" />

      {/* Structure externe courbée du "D" (Réseau de nœuds) */}
      {/* Haut */}
      <line x1="16" y1="14" x2="26" y2="14" stroke="url(#datenza-cyan)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="26" y1="14" x2="33" y2="20" stroke="url(#datenza-cyan)" strokeWidth="2.5" strokeLinecap="round" />
      
      {/* Milieu (Jointure) */}
      <line x1="14" y1="24" x2="23" y2="24" stroke="url(#datenza-cobalt)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="23" y1="24" x2="33" y2="20" stroke="url(#datenza-cyan)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="23" y1="24" x2="33" y2="28" stroke="url(#datenza-cyan)" strokeWidth="2.5" strokeLinecap="round" />
      
      {/* Droite (Fermeture de la boucle) */}
      <line x1="33" y1="20" x2="33" y2="28" stroke="url(#datenza-cyan)" strokeWidth="2.5" strokeLinecap="round" />
      
      {/* Bas */}
      <line x1="16" y1="34" x2="26" y2="34" stroke="url(#datenza-cyan)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="26" y1="34" x2="33" y2="28" stroke="url(#datenza-cyan)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Nœuds du réseau externe */}
      <circle cx="26" cy="14" r="2.5" fill="#38bdf8" />
      <circle cx="33" cy="20" r="2.5" fill="#0ea5e9" />
      <circle cx="23" cy="24" r="2.5" fill="#3b82f6" />
      <circle cx="33" cy="28" r="2.5" fill="#0284c7" />
      <circle cx="26" cy="34" r="2.5" fill="#38bdf8" />
    </svg>
  );
}
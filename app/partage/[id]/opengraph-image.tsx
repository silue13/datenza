// app/partage/[id]/opengraph-image.tsx — image affichée quand un lien partagé est publié (LinkedIn, WhatsApp, X…).
// Nom du projet, taille du fichier et mini graphique du premier graphique de l'analyse (valeurs agrégées uniquement).
import { ImageResponse } from "next/og";
import { lireProjetPartage } from "../../../lib/projets/partageServeur";
import { normaliserApercu, type ApercuGraphique } from "../../../lib/projets/apercu";

export const alt = "Aperçu d'une analyse partagée avec DATENZA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BLEU = "#2563eb";
const ENCRE = "#0f172a";
const GRIS = "#64748b";

function MiniGraphique({ apercu }: { apercu: ApercuGraphique }) {
  const max = Math.max(...apercu.barres.map((b) => Math.abs(b.valeur ?? 0)), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 12 }}>
      <div style={{ display: "flex", fontSize: 24, color: GRIS }}>{apercu.titre.length > 80 ? `${apercu.titre.slice(0, 79)}…` : apercu.titre}</div>
      <div style={{ display: "flex", alignItems: "flex-end", height: 170, gap: 18, borderBottom: "2px solid #cbd5e1" }}>
        {apercu.barres.map((b, i) => (
          <div key={i} style={{ display: "flex", flex: 1, height: "100%", alignItems: "flex-end" }}>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: `${Math.max(2, (Math.abs(b.valeur ?? 0) / max) * 100)}%`,
                background: b.valeur === null ? "#e2e8f0" : BLEU,
                borderRadius: "8px 8px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        {apercu.barres.map((b, i) => (
          <div key={i} style={{ display: "flex", flex: 1, justifyContent: "center", fontSize: 18, color: GRIS, overflow: "hidden", whiteSpace: "nowrap" }}>
            {b.label.length > 11 ? `${b.label.slice(0, 10)}…` : b.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lecture = await lireProjetPartage(id).catch(() => null);
  const fiche = lecture?.etat === "ok" ? lecture.fiche : null;
  const apercu = fiche ? normaliserApercu((fiche.reglages as { apercu?: unknown } | null)?.apercu) : null;
  const nom = fiche ? (fiche.nom.length > 60 ? `${fiche.nom.slice(0, 59)}…` : fiche.nom) : "Analyse de données";
  const lignes = Number(fiche?.nb_lignes) || 0;
  const colonnes = Number(fiche?.nb_colonnes) || 0;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#f8fafc", padding: "56px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: BLEU, letterSpacing: 2 }}>DATENZA</div>
          <div style={{ display: "flex", fontSize: 22, color: GRIS }}>Analyse partagée · lecture seule</div>
        </div>
        <div style={{ display: "flex", fontSize: 50, fontWeight: 800, color: ENCRE, marginTop: 24, lineHeight: 1.1, maxHeight: 112, overflow: "hidden" }}>{nom}</div>
        {lignes > 0 && (
          <div style={{ display: "flex", fontSize: 26, color: GRIS, marginTop: 10 }}>
            {`${lignes.toLocaleString("fr-FR")} lignes${colonnes ? ` · ${colonnes} colonnes` : ""}`}
          </div>
        )}
        <div style={{ display: "flex", marginTop: "auto" }}>
          {apercu ? (
            <MiniGraphique apercu={apercu} />
          ) : (
            <div style={{ display: "flex", fontSize: 30, color: GRIS }}>Graphiques interactifs, filtres et constats chiffrés.</div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}

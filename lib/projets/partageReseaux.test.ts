import { describe, it, expect } from "vitest";
import { RESEAUX, lienReseau, texteDePartage } from "./partageReseaux";

const url = "https://datenza.app/partage/123e4567-e89b-12d3-a456-426614174000";

describe("projets/partageReseaux", () => {
  it("propose un texte avec le nom du projet, ou générique sans nom", () => {
    expect(texteDePartage("  Ventes 2026 ")).toBe("Découvrez mon analyse « Ventes 2026 » réalisée avec DATENZA");
    expect(texteDePartage("   ")).toBe("Découvrez mon analyse réalisée avec DATENZA");
    expect(texteDePartage("Ventes", true)).toBe("Découvrez l'analyse « Ventes » réalisée avec DATENZA");
  });
  it("encode le lien dans l'adresse de chaque réseau", () => {
    for (const { id } of RESEAUX) {
      const lien = lienReseau(id, url, "Texte & co");
      expect(lien).toContain(encodeURIComponent(url));
      expect(lien).not.toContain("Texte & co");
    }
  });
  it("utilise les bonnes adresses de publication", () => {
    expect(lienReseau("whatsapp", url, "Voir")).toBe(`https://wa.me/?text=${encodeURIComponent(`Voir : ${url}`)}`);
    expect(lienReseau("linkedin", url, "Voir")).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
    expect(lienReseau("facebook", url, "Voir")).toMatch(/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
    expect(lienReseau("x", url, "Voir")).toMatch(/^https:\/\/x\.com\/intent\/post\?text=Voir&url=/);
    expect(lienReseau("telegram", url, "Voir")).toMatch(/^https:\/\/t\.me\/share\/url\?url=/);
    expect(lienReseau("email", url, "Voir")).toMatch(/^mailto:\?subject=Voir&body=/);
  });
});

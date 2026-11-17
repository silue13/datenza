import { afterEach, describe, expect, it, vi } from "vitest";
import { estVersionPerimee, messageErreur, rechargerPourNouvelleVersion } from "./erreurs";

describe("erreurs d'affichage", () => {
  it("reconnaît une version périmée de l'application", () => {
    const chunk = new Error("Loading chunk 4521 failed.\n(error: https://datenza.vercel.app/_next/static/chunks/4521.js)");
    chunk.name = "ChunkLoadError";
    expect(estVersionPerimee(chunk)).toBe(true);
    expect(estVersionPerimee(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js"))).toBe(true);
    expect(estVersionPerimee(new TypeError("Importing a module script failed."))).toBe(true);
    expect(estVersionPerimee("Loading CSS chunk app-layout failed")).toBe(true);
  });

  it("ne confond pas un vrai bug avec une version périmée", () => {
    expect(estVersionPerimee(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(estVersionPerimee(null)).toBe(false);
  });

  it("donne un message lisible quelle que soit la valeur levée", () => {
    expect(messageErreur(new Error("boum"))).toBe("boum");
    expect(messageErreur("texte")).toBe("texte");
    expect(messageErreur({ code: 3 })).toBe('{"code":3}');
  });

  describe("rechargement", () => {
    const stockage = new Map<string, string>();
    const recharger = vi.fn();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => stockage.get(k) ?? null, setItem: (k: string, v: string) => stockage.set(k, v) });
    vi.stubGlobal("window", { location: { reload: recharger } });
    afterEach(() => recharger.mockClear());

    it("recharge une fois, puis s'abstient pendant une minute pour ne pas boucler", () => {
      expect(rechargerPourNouvelleVersion(1_000_000)).toBe(true);
      expect(rechargerPourNouvelleVersion(1_030_000)).toBe(false);
      expect(rechargerPourNouvelleVersion(1_070_000)).toBe(true);
      expect(recharger).toHaveBeenCalledTimes(2);
    });
  });
});

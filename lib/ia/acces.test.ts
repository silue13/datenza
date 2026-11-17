import { describe, expect, it, vi } from "vitest";
import { extraireJeton, MESSAGE_CONNEXION, MESSAGE_SESSION_EXPIREE, verifierAccesIA, type DependancesAcces } from "./acces";

function deps(partiel: Partial<DependancesAcces> = {}): DependancesAcces {
  return {
    configure: true,
    limite: 3,
    verifierJeton: async (j) => (j === "bon-jeton" ? "utilisateur-1" : null),
    consommerQuota: async () => ({ autorise: true, utilises: 1 }),
    ...partiel,
  };
}

describe("accès à l'assistant IA", () => {
  it("lit le jeton de l'en-tête Authorization", () => {
    expect(extraireJeton("Bearer abc.def")).toBe("abc.def");
    expect(extraireJeton("bearer abc")).toBe("abc");
    expect(extraireJeton("Basic abc")).toBeNull();
    expect(extraireJeton(null)).toBeNull();
  });

  it("refuse un visiteur non connecté, avec un message qui dit quoi faire", async () => {
    expect(await verifierAccesIA(null, deps())).toEqual({ ok: false, status: 401, message: MESSAGE_CONNEXION });
  });

  it("refuse un jeton invalide ou expiré", async () => {
    expect(await verifierAccesIA("Bearer faux", deps())).toEqual({ ok: false, status: 401, message: MESSAGE_SESSION_EXPIREE });
  });

  it("accepte un compte connecté et décompte la question", async () => {
    const consommer = vi.fn(async () => ({ autorise: true, utilises: 2 }));
    expect(await verifierAccesIA("Bearer bon-jeton", deps({ consommerQuota: consommer }))).toEqual({ ok: true, utilisateur: "utilisateur-1", utilises: 2, limite: 3 });
    expect(consommer).toHaveBeenCalledWith("bon-jeton", 3);
  });

  it("bloque quand le quota du jour est atteint", async () => {
    const r = await verifierAccesIA("Bearer bon-jeton", deps({ consommerQuota: async () => ({ autorise: false, utilises: 3 }) }));
    expect(r).toMatchObject({ ok: false, status: 429 });
    if (!r.ok) expect(r.message).toMatch(/vos 3 questions/);
  });

  it("garde un quota par compte même si la fonction SQL n'est pas encore installée", async () => {
    const sansFonction = deps({ consommerQuota: async () => null, verifierJeton: async () => "utilisateur-memoire" });
    const resultats = [];
    for (let i = 0; i < 4; i++) resultats.push((await verifierAccesIA("Bearer x", sansFonction)).ok);
    expect(resultats).toEqual([true, true, true, false]);
  });

  it("signale une panne de Supabase sans laisser passer", async () => {
    const r = await verifierAccesIA("Bearer bon-jeton", deps({ verifierJeton: async () => { throw new Error("réseau"); } }));
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("laisse passer quand les comptes ne sont pas configurés (installation sans Supabase)", async () => {
    expect(await verifierAccesIA(null, deps({ configure: false }))).toMatchObject({ ok: true, utilisateur: null });
  });
});

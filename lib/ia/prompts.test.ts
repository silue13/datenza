import { describe, it, expect } from "vitest";
import { construireMessagesIA } from "./prompts";

describe("ia/prompts", () => {
  it("n'autorise les demandes de calcul que si on le demande", () => {
    expect(construireMessagesIA("q", "{}", "fr", []).systeme).not.toContain("DATENZA_REQUETES");
    expect(construireMessagesIA("q", "{}", "fr", [], { avecCalculs: true }).systeme).toContain("DATENZA_REQUETES");
    expect(construireMessagesIA("q", "{}", "en", [], { avecCalculs: true }).systeme).toContain("DATENZA COMPUTE RULE");
  });
  it("au second tour, fournit les résultats et interdit de redemander des calculs", () => {
    const m = construireMessagesIA("Combien ?", "{}", "fr", [], { avecCalculs: true, resultatsCalculs: "CALCUL 1 — T\nA | 12" });
    expect(m.courant).toContain("A | 12");
    expect(m.courant).toContain("N'émets PLUS de DATENZA_REQUETES");
    expect(m.systeme).not.toContain("RÈGLE CALCULS DATENZA");
  });
});

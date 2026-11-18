// lib/analyse/interpretationMetier.ts — lecture détaillée des analyses métier (Pareto, évolution, RFM, cohortes), sans IA.
import type { Interpretation, LigneInterpretation } from "./interpretation";
import type { ResultatCohortes, ResultatEvolution, ResultatPareto, ResultatRFM } from "./metier";

const nf = (x: number, dec = 0) => x.toLocaleString("fr-FR", { maximumFractionDigits: dec });
const pct = (x: number) => `${nf(x, x < 10 ? 1 : 0)} %`;
const signe = (x: number, dec = 0) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${nf(Math.abs(x), dec)}`;

// ---------------------------------------------------------------- Pareto / ABC

export function interpreterPareto(r: ResultatPareto, dimension: string, mesure: string): Interpretation {
  const guide =
    "Les barres classent les éléments du plus grand au plus petit. La ligne orange (axe de droite) additionne leurs parts au fur et à mesure : là où elle atteint 80 %, on a trouvé les éléments qui font l'essentiel du total. Couleurs : bleu foncé = classe A (jusqu'à 80 % du total cumulé), bleu clair = classe B (de 80 à 95 %), gris = classe C (les 5 % restants). La « règle des 80/20 » dit qu'en général environ 20 % des éléments font 80 % du total.";
  const n = r.elements.length;
  const complements: LigneInterpretation[] = [];
  const premier = r.elements[0];
  if (premier) complements.push({ titre: "Le premier", texte: `« ${premier.nom} » représente à lui seul ${pct(premier.part)} de « ${mesure} ».` });
  const top3 = r.elements.slice(0, 3).reduce((a, e) => a + e.part, 0);
  if (n >= 5) complements.push({ titre: "Les trois premiers", texte: `Ensemble, ils pèsent ${pct(top3)} du total, soit ${pct((3 / n) * 100)} des éléments.` });
  complements.push({
    titre: "Classes",
    texte: `A : ${r.classes.A.nb} élément(s) pour ${pct(r.classes.A.part)} du total ; B : ${r.classes.B.nb} pour ${pct(r.classes.B.part)} ; C : ${r.classes.C.nb} pour ${pct(r.classes.C.part)}.`,
  });
  const ecart80 = r.partElementsPour80 - 20;
  complements.push({
    titre: "Par rapport à la règle des 80/20",
    texte:
      Math.abs(ecart80) <= 5
        ? `Votre répartition suit presque exactement la règle : ${pct(r.partElementsPour80)} des éléments font 80 % du total.`
        : ecart80 < 0
        ? `Plus concentré que la règle : il suffit de ${pct(r.partElementsPour80)} des éléments (au lieu de 20 %) pour faire 80 % du total.`
        : `Moins concentré que la règle : il faut ${pct(r.partElementsPour80)} des éléments (au lieu de 20 %) pour faire 80 % du total.`,
  });

  const resume =
    r.partElementsPour80 <= 30
      ? `Une petite minorité de « ${dimension} » (${r.nbPour80} sur ${n}) fait 80 % de « ${mesure} ». Votre activité dépend fortement d'eux : leur perte ou leur baisse aurait un effet important.`
      : r.partElementsPour80 >= 60
      ? `« ${mesure} » est bien réparti : il faut ${r.nbPour80} « ${dimension} » sur ${n} pour faire 80 % du total. Aucun élément n'est indispensable à lui seul, mais l'effort est dispersé.`
      : `Concentration modérée : ${r.nbPour80} « ${dimension} » sur ${n} font 80 % de « ${mesure} ».`;

  const pistes: string[] = [];
  pistes.push(`Classe A : ce sont vos priorités. Vérifiez leur évolution récente (onglet « Évolution », expliqué par « ${dimension} ») et protégez-les (disponibilité, relation, prix).`);
  if (r.classes.C.nb >= n * 0.3) pistes.push(`La classe C compte ${r.classes.C.nb} éléments pour seulement ${pct(r.classes.C.part)} du total : faut-il tous les garder, les regrouper ou les simplifier ?`);
  if (premier && premier.part >= 30) pistes.push(`« ${premier.nom} » pèse ${pct(premier.part)} à lui seul : une dépendance aussi forte est un risque à surveiller.`);
  pistes.push("La classe B peut monter en A : ce sont souvent les meilleurs relais de croissance.");
  return { guide, complements, resume, pistes };
}

// ---------------------------------------------------------------- Évolution

export function interpreterEvolution(r: ResultatEvolution, mesure: string): Interpretation {
  const unite = r.granularite === "annee" ? "année" : "mois";
  const guide = `On compare la dernière période du fichier (${r.periode}) à la période précédente et, pour des données mensuelles, au même mois un an plus tôt. La comparaison « sur un an » élimine les effets de saison (fêtes, rentrée, saison des pluies…) : c'est la plus fiable pour juger d'une vraie progression. Sous chaque carte, les catégories listées sont celles qui expliquent le plus l'écart : en vert celles qui le tirent vers le haut, en rouge vers le bas. La courbe montre toute l'histoire, ${unite} par ${unite}.`;
  const complements: LigneInterpretation[] = [];
  const p = r.precedente;
  const a = r.anneePrecedente;
  if (p) {
    const hausses = p.contributions.filter((c) => c.ecart > 0);
    const baisses = p.contributions.filter((c) => c.ecart < 0);
    if (hausses.length) complements.push({ titre: "Ce qui tire vers le haut", texte: hausses.slice(0, 3).map((c) => `« ${c.nom} » (${signe(c.ecart)})`).join(", ") + "." });
    if (baisses.length) complements.push({ titre: "Ce qui tire vers le bas", texte: baisses.slice(0, 3).map((c) => `« ${c.nom} » (${signe(c.ecart)})`).join(", ") + "." });
  }
  if (r.serie.length >= 3) {
    const vals = r.serie.map((s) => s.valeur);
    const moy = vals.reduce((x, y) => x + y, 0) / vals.length;
    const max = r.serie.reduce((x, y) => (y.valeur > x.valeur ? y : x));
    const min = r.serie.reduce((x, y) => (y.valeur < x.valeur ? y : x));
    complements.push({
      titre: "Sur tout l'historique",
      texte: `Moyenne de ${nf(moy)} par ${unite} ; meilleur ${unite} : ${max.libelle} (${nf(max.valeur)}), plus faible : ${min.libelle} (${nf(min.valeur)}). La dernière période est ${r.valeur >= moy ? "au-dessus" : "en dessous"} de la moyenne.`,
    });
  }

  let resume: string | null = null;
  if (p) {
    const sensP = p.ecart > 0 ? "progresse" : p.ecart < 0 ? "recule" : "est stable";
    resume = `En ${r.periode}, « ${mesure} » ${sensP}${p.variation !== null && p.ecart !== 0 ? ` de ${nf(Math.abs(p.variation), 1)} %` : ""} par rapport à ${p.libelle}`;
    if (a?.variation != null) {
      const memeSens = Math.sign(a.ecart) === Math.sign(p.ecart);
      resume += memeSens
        ? `, et ${a.ecart > 0 ? "progresse" : "recule"} aussi sur un an (${signe(a.variation, 1)} %) : la tendance est confirmée.`
        : `, mais ${a.ecart > 0 ? "progresse" : "recule"} sur un an (${signe(a.variation, 1)} %) : le mouvement du dernier ${unite} est peut-être saisonnier.`;
    } else resume += ".";
  }

  const pistes: string[] = [];
  if (r.incomplete) pistes.push(`${r.periode} semble inachevé : attendez la fin de la période ou comparez à date équivalente avant de conclure.`);
  if (p && p.ecart < 0 && p.contributions[0]?.ecart < 0) pistes.push(`Commencez par « ${p.contributions[0].nom} », qui explique la plus grosse part de la baisse.`);
  if (p && p.ecart > 0 && p.contributions[0]?.ecart > 0) pistes.push(`« ${p.contributions[0].nom} » porte la hausse : est-ce durable (nouvelle clientèle, nouveau produit) ou ponctuel (grosse commande) ?`);
  if (!p?.contributions.length) pistes.push("Choisissez une colonne dans « Expliquer par » pour savoir quelles catégories expliquent la variation.");
  if (r.granularite === "mois" && !a) pistes.push("Il faut au moins 13 mois de données pour comparer à l'année précédente et neutraliser la saisonnalité.");
  return { guide, complements, resume, pistes };
}

// ---------------------------------------------------------------- RFM

export function interpreterRFM(r: ResultatRFM): Interpretation {
  const guide =
    "Chaque client reçoit trois notes de 1 (faible) à 5 (excellent) : R pour Récence (a-t-il acheté récemment ?), F pour Fréquence (achète-t-il souvent ?) et M pour Montant (dépense-t-il beaucoup ?). Ces notes sont comparatives : 5 = parmi les 20 % meilleurs clients du fichier. Les combinaisons de notes donnent des segments, chacun avec une action conseillée. Lisez le tableau ainsi : combien de clients dans chaque segment, et quelle part du chiffre d'affaires ils représentent.";
  const total = r.clients.length;
  const seg = new Map(r.segments.map((s) => [s.segment, s]));
  const complements: LigneInterpretation[] = [];
  const meilleurs = ["Champions", "Fidèles"].map((k) => seg.get(k as never)).filter(Boolean) as ResultatRFM["segments"];
  const partClientsTop = meilleurs.reduce((x, s) => x + s.partClients, 0);
  const partMontantTop = meilleurs.reduce((x, s) => x + s.partMontant, 0);
  if (meilleurs.length)
    complements.push({ titre: "Vos meilleurs clients", texte: `Champions et Fidèles : ${pct(partClientsTop)} des clients, mais ${pct(partMontantTop)} du montant total.` });
  const risque = ["À risque", "À réveiller"].map((k) => seg.get(k as never)).filter(Boolean) as ResultatRFM["segments"];
  const partRisque = risque.reduce((x, s) => x + s.partMontant, 0);
  const nbRisque = risque.reduce((x, s) => x + s.nb, 0);
  if (nbRisque) complements.push({ titre: "Chiffre d'affaires menacé", texte: `${nbRisque} clients « À risque » ou « À réveiller » représentent ${pct(partRisque)} du montant : ils achetaient, mais ralentissent ou ont cessé.` });
  const perdus = seg.get("Perdus");
  if (perdus) complements.push({ titre: "Clients perdus", texte: `${perdus.nb} clients (${pct(perdus.partClients)}) n'achètent plus depuis en moyenne ${nf(perdus.recenceMoyenne)} jours.` });
  const nouveaux = (seg.get("Nouveaux")?.nb ?? 0) + (seg.get("Prometteurs")?.nb ?? 0);
  if (nouveaux) complements.push({ titre: "Relève", texte: `${nouveaux} clients récents (Nouveaux et Prometteurs) : à transformer en clients réguliers.` });

  const principal = [...r.segments].sort((a, b) => b.partMontant - a.partMontant)[0];
  const resume = principal
    ? `Sur ${total} clients, le segment qui rapporte le plus est « ${principal.segment} » (${pct(principal.partMontant)} du montant pour ${pct(principal.partClients)} des clients).` +
      (partRisque >= 20 ? ` Attention : ${pct(partRisque)} du montant vient de clients qui décrochent.` : "")
    : null;

  const pistes: string[] = [];
  if (nbRisque) pistes.push("Priorité n° 1 : contacter les clients « À risque » (téléchargez la liste ci-dessus) ; les reconquérir coûte moins cher que d'en trouver de nouveaux.");
  if (meilleurs.length) pistes.push("Chouchoutez les Champions : ce sont eux qui recommandent et qui achètent les nouveautés en premier.");
  if (nouveaux) pistes.push("Pour les clients récents (Nouveaux, Prometteurs), le 2ᵉ achat est décisif : une relance dans les semaines qui suivent le 1ᵉʳ achat fait souvent la différence.");
  if (r.frequenceUniforme) pistes.push("Chaque client n'a qu'une ligne : utilisez un fichier détaillé (une ligne par achat) pour une segmentation fiable.");
  return { guide, complements, resume, pistes };
}

// ---------------------------------------------------------------- Cohortes

export function interpreterCohortes(r: ResultatCohortes): Interpretation {
  const guide =
    "Chaque ligne regroupe les clients qui ont fait leur premier achat le même mois (une « cohorte »). Les colonnes M+1, M+2… indiquent le pourcentage de ces clients qui ont encore acheté 1, 2… mois plus tard. M0 vaut toujours 100 %. Plus une case est foncée, plus la fidélité est bonne. Lisez une ligne de gauche à droite pour voir à quelle vitesse les clients décrochent, et comparez les lignes entre elles pour voir si la fidélité s'améliore avec le temps.";
  const complements: LigneInterpretation[] = [];
  const { m1, m3, m6 } = r.moyenne;
  if (m1 !== null) complements.push({ titre: "Perte après le 1ᵉʳ mois", texte: `${pct(100 - m1)} des nouveaux clients ne reviennent pas le mois suivant.` });
  if (m1 !== null && m3 !== null) complements.push({ titre: "Entre M+1 et M+3", texte: `La fidélité passe de ${pct(m1)} à ${pct(m3)}.` });

  // Meilleure et moins bonne cohorte à M+1 (cohortes d'au moins 5 clients)
  const avecM1 = r.cohortes.filter((c) => c.taille >= 5 && c.retention[1] !== null && c.retention[1] !== undefined);
  if (avecM1.length >= 2) {
    const best = avecM1.reduce((a, c) => ((c.retention[1] as number) > (a.retention[1] as number) ? c : a));
    const worst = avecM1.reduce((a, c) => ((c.retention[1] as number) < (a.retention[1] as number) ? c : a));
    if (best !== worst)
      complements.push({ titre: "Écart entre cohortes", texte: `Meilleur retour à M+1 : clients arrivés en ${best.mois} (${pct(best.retention[1] as number)}) ; le plus faible : ${worst.mois} (${pct(worst.retention[1] as number)}).` });
    const moitie = Math.floor(avecM1.length / 2);
    const anciennes = avecM1.slice(0, moitie);
    const recentes = avecM1.slice(moitie);
    const moy = (l: typeof avecM1) => l.reduce((a, c) => a + (c.retention[1] as number), 0) / l.length;
    if (anciennes.length && recentes.length) {
      const d = moy(recentes) - moy(anciennes);
      if (Math.abs(d) >= 3)
        complements.push({ titre: "Tendance", texte: `Les cohortes récentes reviennent ${d > 0 ? "mieux" : "moins"} que les anciennes à M+1 (${signe(d, 1)} points) : la fidélisation ${d > 0 ? "s'améliore" : "se dégrade"}.` });
    }
  }

  let resume: string | null = null;
  if (m1 !== null) {
    const niveau = m1 >= 40 ? "bonne" : m1 >= 20 ? "moyenne" : "faible";
    resume = `Fidélité ${niveau} : ${pct(m1)} des clients reviennent le mois suivant leur premier achat${m6 !== null ? `, et ${pct(m6)} sont encore actifs 6 mois plus tard` : ""}.`;
  }
  const pistes: string[] = [];
  if (m1 !== null && m1 < 30) pistes.push("La plupart des clients n'achètent qu'une fois : travaillez le 2ᵉ achat (relance, offre de bienvenue, suivi après-vente).");
  pistes.push("Une cohorte nettement meilleure ou moins bonne que les autres ? Cherchez ce qui s'est passé le mois de leur arrivée (promotion, campagne, rupture de stock).");
  pistes.push("Les niveaux de fidélité normaux varient beaucoup selon l'activité : comparez-vous surtout à vous-même, mois après mois.");
  return { guide, complements, resume, pistes };
}

# Jeux de test DATENZA

Onze fichiers pour tester toutes les interfaces de l'application. Les données sont **réalistes mais fictives** : noms, clients, montants et indicateurs ont été générés pour l'occasion. Elles ne décrivent aucune entreprise ni aucune statistique officielle réelle.

Chaque fichier contient des tendances et des écarts **connus à l'avance**. Ils sont listés ci-dessous : vous pouvez ainsi vérifier que l'application les retrouve et que ses interprétations sont justes.

| Fichier | Sert à tester |
|---|---|
| `01_ventes_2024_2025.xlsx` | Import et nettoyage, analyse complète, graphiques, carte, prévisions, analyses métier (Pareto, évolution, segments clients, fidélité), tests statistiques, exports, projets et partage |
| `02_factures_2025.xlsx` + `03_paiements_2025.csv` | Comparer 2 fichiers (rapprochement factures/paiements), correspondance manuelle des colonnes |
| `04` + `05` + `06` (portefeuille janvier, février, mars) | Comparer plusieurs fichiers, correspondance des colonnes, analyse comparée |
| `07` + `08` + `09` (agences Abidjan, Bouaké, Korhogo) | Fusionner (empiler), colonnes de noms différents, analyse comparée, comparaison depuis l'accueil |
| `10_indicateurs_regions.csv` | Carte par régions, corrélations |
| `11_effectifs_rh.xlsx` | Tests statistiques, nuage de points, histogramme, tableau croisé |

---

## 1. Ventes 2024-2025 (`01_ventes_2024_2025.xlsx`)

3 761 ventes sur 24 mois : date, facture, client, ville, produit, catégorie, canal, vendeur, quantité, prix, remise, montant, marge.

**Où :** Accueil → déposer le fichier → « Lancer l'analyse ».

**Défauts de saisie glissés volontairement :**
- une ligne « TOTAL » à la fin : elle doit être retirée automatiquement ;
- 5 montants écrits en texte (« 125 000 FCFA ») ;
- 43 villes mal orthographiées (« abidjan », « Bouake », « San Pedro ») ;
- 8 vendeurs manquants ;
- 3 lignes en double.

**Résultats attendus :**
- **Évolution :** le chiffre d'affaires 2025 dépasse celui de 2024 d'environ **+27 %**. **Décembre** est chaque année le mois le plus fort, **février** le plus faible.
- **Villes :** **Abidjan** fait à elle seule environ **45 %** du total. Sur la carte, la région d'Abidjan est la plus foncée.
- **Canaux :** le **Grossiste** pèse environ **68 %** du montant. **En ligne** est petit mais progresse nettement d'un mois à l'autre.
- **Pareto :** quelques gros clients font l'essentiel du chiffre d'affaires (concentration forte).
- **Segments clients (RFM) :** les « Champions » rapportent environ **70 %** du montant. 41 clients ont cessé d'acheter en cours de période : ils doivent apparaître dans « À risque » ou « Perdus ».
- **Fidélité (cohortes) :** environ la moitié des clients achètent dès le début de 2024, les autres arrivent au fil des mois.
- **Prévisions** (Montant par Date) : tendance à la hausse avec un pic saisonnier en fin d'année.
- **Tests statistiques :** « Montant selon Catégorie » est démontré (Électronique la plus haute, Hygiène la plus basse), de même que « Quantité selon Canal » (le Grossiste achète bien plus par commande).
- **Corrélation :** forte corrélation entre Montant et Marge.

**À tester aussi :**
- le bouton « Image » sur un graphique, la carte et la prévision ;
- les exports PowerPoint, Word, Excel et PDF ;
- l'enregistrement dans Projets, puis le partage par lien et sur un réseau social ;
- un filtre (par exemple Ville = Bouaké), en vérifiant que les interprétations se mettent à jour.

---

## 2. Factures et paiements (`02_factures_2025.xlsx` + `03_paiements_2025.csv`)

450 factures et 427 lignes de paiement. Les références sont écrites en minuscules dans les paiements (« f2025-0001 » contre « F2025-0001 ») : elles doivent quand même se rapprocher.

**Où :** Comparer / Fusionner → déposer les deux fichiers → « Comparer 2 fichiers » → « Comparer les valeurs ».

**Étapes :**
1. Vérifiez que la clé proposée est **N° Facture ↔ Référence facture**, avec « 92 % des lignes de A retrouvent leur clé dans B ».
2. Ouvrez « Correspondance des colonnes » et choisissez **Montant réglé** en face de **Montant TTC**. Ce rapprochement est volontairement impossible à deviner automatiquement : il teste la correspondance manuelle.
3. Lancez la comparaison.

**Résultats attendus :**
- **384** factures payées exactement ;
- **30** factures avec un écart de montant : 24 paiements partiels et 6 trop-perçus de 5 000 FCFA ;
- **36** factures impayées (« Absent de B ») ;
- **9** paiements sans facture connue (« Absent de A ») ;
- 4 paiements saisis deux fois, signalés comme clés en double.

**À tester aussi :**
- les autres choix : « Présentes seulement dans A » (les 36 impayées), « Présentes seulement dans B » (les 9 paiements sans facture), « Tout garder » ;
- les boutons « Analyser ce fichier » et « Analyse comparée des 2 fichiers ».

---

## 3. Portefeuille clients sur 3 mois (`04`, `05`, `06`)

Le même portefeuille de créances sur 3 mois. Les noms de colonnes changent d'un fichier à l'autre :

| Janvier | Février | Mars |
|---|---|---|
| Code client | Réf client | Code (en minuscules : « c0001 ») |
| Nom | Nom du client | Client |
| Ville | Localité | Commune |
| Encours | Encours | Solde |
| Statut | Statut | Statut |

**Où :** Comparer / Fusionner → déposer les 3 fichiers → « Comparer plusieurs ».

**Étapes :**
1. Vérifiez l'ordre : janvier, février, mars.
2. Vérifiez que les clés proposées sont bien les codes clients dans les 3 fichiers.
3. Dans « Correspondance des colonnes », **Ville = Localité = Commune** et **Nom = Nom du client** doivent être proposés automatiquement. Choisissez à la main **Solde** en face d'**Encours** pour mars, et **Client** en face de **Nom**.
4. Lancez la comparaison.

**Résultats attendus :**
- **172** clients au total, dont **136** présents dans les 3 mois ;
- **22** clients apparus (absents en janvier, présents en mars) ;
- **14** clients disparus (présents en janvier, absents en mars) ;
- environ 40 % des encours changent d'un mois à l'autre, et quelques statuts passent en « Retard » ou « Contentieux ».

**À tester aussi :** « Analyse comparée des fichiers ». L'analyse doit s'ouvrir en mode comparaison, avec 3 fichiers et janvier comme référence.

---

## 4. Ventes mensuelles de 3 agences (`07`, `08`, `09`)

Même structure, noms de colonnes différents :

| Abidjan | Bouaké | Korhogo |
|---|---|---|
| Mois | Mois | Mois |
| Produit | Produit | Article |
| Catégorie | Catégorie | Famille |
| Qté | Quantité | Quantité |
| CA | Chiffre d'affaires | Ventes |

**Où :** Comparer / Fusionner → déposer les 3 fichiers → « Fusionner (empiler) ».

**Résultats attendus :**
- toutes les colonnes sont rapprochées automatiquement (« CA = Chiffre d'affaires = Ventes », « Produit = Article », « Catégorie = Famille », « Qté = Quantité ») ;
- **720** lignes au final : aucune ligne retirée, même si deux agences ont parfois les mêmes chiffres un mois donné ;
- en « Analyser ce fichier » (analyse comparée) :
  - **Abidjan**, la plus grosse agence : environ **+11 %** entre 2024 et 2025 ;
  - **Bouaké** : stable, environ **−3 %**, avec un recul continu de l'Électronique ;
  - **Korhogo**, la plus petite : la plus forte croissance, environ **+33 %**.

**À tester aussi :** depuis l'**Accueil**, déposez les 3 fichiers, cochez-les et cliquez sur « Comparer ». Le message bleu doit lister les colonnes reconnues malgré leurs noms différents.

---

## 5. Indicateurs par région (`10_indicateurs_regions.csv`)

Les 31 régions, plus les districts d'Abidjan et de Yamoussoukro : population, écoles, taux de scolarisation, points de vente, chiffre d'affaires. Ces chiffres sont **fictifs**.

**Résultats attendus :**
- la carte s'ouvre en **régions colorées**, avec Abidjan la plus foncée ;
- la carte affiche par défaut le « CA 2025 (FCFA) » ; changez la mesure pour voir la population ou les points de vente ;
- forte corrélation entre Population, Points de vente et CA 2025 ;
- taux de scolarisation plus élevé dans les régions les plus urbaines (Abidjan, Yamoussoukro).

---

## 6. Effectifs RH (`11_effectifs_rh.xlsx`)

320 salariés : sexe, âge, service, ville, ancienneté, contrat, salaire, prime, satisfaction.

**Résultats attendus :**
- **Tests statistiques :** « Salaire mensuel selon Service » est démontré avec un effet fort (Informatique la plus haute, Production la plus basse) ; les stages et CDD sont moins bien payés que les CDI ;
- **Nuage de points** Ancienneté × Salaire : liaison positive ;
- **Histogramme** du salaire : distribution étalée vers la droite ;
- le **sexe** et la **ville** ont été tirés au hasard : « Salaire selon Sexe », « Salaire selon Ville » et « Sexe ↔ Service » doivent rester **« Non démontré »**. C'est un bon test pour vérifier que l'application n'invente pas de conclusion. La satisfaction (1 à 5) est elle aussi tirée au hasard.

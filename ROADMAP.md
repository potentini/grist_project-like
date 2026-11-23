# Feuille de route du widget de suivi

Cette feuille conserve les évolutions discutées et reportées. La première version `@` est développée uniquement dans ce dépôt de prévisualisation ; les autres sujets restent reportés et leur présence ne vaut pas autorisation de développement. Ajouter ici les nouveaux sujets explicitement laissés pour plus tard, avec les décisions déjà prises et les questions ouvertes.

## Enregistrement automatique des notes dans Grist

Statut : reporté explicitement le 20 novembre 2026. Seul le brouillon local avec récupération des textes de réunions et points est développé à ce stade ; Enregistrer reste nécessaire pour écrire dans Grist.

Piste à reprendre : compléter le brouillon local par une sauvegarde dans Grist après une pause de saisie (environ trois secondes), avec un intervalle maximal pendant une frappe continue. Afficher clairement les états Enregistrement, Enregistré et Échec réseau, et conserver le brouillon jusqu’à confirmation effective de Grist. Le rythme exact reste à décider.

Limiter initialement cette sauvegarde aux textes de réunions et points, après création effective de la ligne. Préserver les confirmations des rattachements et opérations structurelles. Ne pas écraser une modification concurrente ; étudier une comparaison explicite des versions. Clarifier le sens de Fermer, Annuler et d’un éventuel rétablissement de la version d’ouverture après les premières sauvegardes automatiques. Aucune sauvegarde automatique dans Grist n’est autorisée par cette inscription.

## Prise de notes de réunion et rattachements rapides

Statut : première version expérimentale développée le 23 novembre 2026 dans `grist_project-like-preview` uniquement. Le dépôt stable `grist_project-like` n’est pas modifié. Voir README pour les prérequis et essais. La création d’action depuis un paragraphe, la continuité des séances et le renvoi vers une réunion future restent reportés.

Objectif : écrire les notes de réunion avec un minimum d’interruptions, tout en produisant des points de discussion structurés, lisibles dans le widget et dans les tables Grist.

- Taper `@` dans un paragraphe ouvre la liste des projets.
- Se positionner sur un projet propose ses chantiers ; sur un chantier, ses tâches.
- Permettre de valider le rattachement au niveau projet, chantier ou tâche, sans confondre exploration et validation.
- Proposer aussi une recherche par quelques lettres, avec le chemin de l’élément affiché pour lever les ambiguïtés.
- Permettre plusieurs associations et leur retrait ; conserver les références stables malgré les changements de titre.
- Reconnaître le paragraphe comme un point abordé, lié à la réunion et aux éléments sélectionnés. Garder le texte lisible dans Grist sans imposer de mise en forme spéciale.
- Prévoir navigation au clavier et utilisation sur téléphone, sans dépendance au survol.

### Création rapide d’une action depuis le paragraphe

- Un raccourci clavier déclenche la création d’une action depuis le paragraphe ; ajouter une commande équivalente sur téléphone.
- Proposition à valider : Ctrl + Maj + Entrée, après vérification des conflits Grist, navigateur et système.
- Proposer un titre prérempli et les rattachements existants, avec responsable et échéance à compléter, dans une zone compacte.
- Proposition : conserver le point de discussion et créer une action issue de celui-ci, avec sa provenance réunion/point, plutôt que supprimer le point.
- Afficher un accès à l’action créée et prévenir une double création involontaire.

Première version : paragraphes séparés par une ligne vide, confirmation explicite avant transformation, blocs et associations multiples conservés dans le brouillon local, enregistrement groupé uniquement au bouton Enregistrer. Un point existant reste la même ligne ; aucun rapprochement par titre ni suppression implicite. L’analyse automatique d’un texte libre, les fusions, le réordonnancement des points et les conversions d’anciennes notes en masse restent à étudier.

## Conversions inverses et réaffectation des liens

Statut : réflexion explicitement mise de côté, à reprendre ultérieurement.

Existant : Action → Tâche et Tâche → Chantier. Évolutions envisagées : Chantier → Tâche et Tâche → Action, avec aperçu avant confirmation.

### Règles retenues pendant la discussion

- La hiérarchie structurelle est uniquement Projet → Chantier → Tâche.
- Réunions, points de discussion et actions sont transverses ; leur rattachement au suivi peut viser au plus bas une tâche. Ils ne constituent pas un quatrième niveau de cette hiérarchie.
- Distinguer rattachement au travail et provenance d’une action issue d’un point/réunion.
- Lorsqu’une tâche devient une action, proposer de réaffecter les actions, réunions et points qui lui étaient associés au chantier de l’ancienne tâche, par défaut, ou à un autre élément choisi.
- Lorsqu’un chantier devient une tâche, choisir un autre chantier parent pour la nouvelle tâche. Proposer le projet de l’ancien chantier comme destination des éléments transverses directement associés.
- Pour les véritables tâches dépendantes d’un chantier, proposer leur déplacement vers un autre chantier ou leur conversion en actions. Étudier la cascade et les réaffectations des liens à chaque niveau.
- Conserver les autres associations et la provenance, éviter les doublons ; ne rien fusionner ni supprimer implicitement.
- Préserver les origines transformées, les champs compatibles et les pourcentages d’avancement ; expliquer les champs non repris dans l’aperçu.
- Examiner les dépendants au-delà des seuls éléments affichés par les filtres, notamment les archivés ; prévoir les références externes, droits et modifications concurrentes. Appliquer les écritures nécessaires ensemble.
- Une conversion inverse est une nouvelle transformation, pas une annulation ni une restauration automatique de l’ancienne ligne.

### Tables et décisions à reprendre

Les rattachements existants Projet/Chantier/Tâche suffisent pour cette approche. Les listes Actions supplémentaires dans Notes et Points ne sont donc pas nécessaires pour gérer ces conversions.

Pour conserver la filiation des nouvelles conversions, prévoir, si absents :

| Table | Colonne | Type |
| --- | --- | --- |
| Chantiers | Transforme | Booléen |
| Taches | ChantierOrigine | Référence vers Chantiers |
| Actions | TacheOrigine | Référence vers Taches |

Vérifier et mapper ces champs avant utilisation ; aucune colonne n’est créée dans un document Grist par cette feuille de route.

Questions ouvertes : conversions entre projets différents ; choix détaillés des destinations dans une cascade ; présentation de l’historique des réaffectations et traitement des champs non compatibles. Le périmètre de la première version reste à valider.

## Réunions récurrentes et continuité des points de discussion

Statut : proposition discutée puis explicitement reportée, à reprendre ultérieurement. Aucun changement de tables ou de comportement à réaliser à ce stade.

### Modèle proposé

Conserver les tables actuelles, sans ajouter de table de cycles ni de sujets durables pour la première version. Dans le document utilisateur, **Sujets est la table des réunions**.

- Chaque ligne de réunion représente une séance datée distincte.
- Le champ existant `Instance`, de type Choix, identifie la série : Codir, Réunion d’équipe, Bilat – Amandine, etc.
- Chaque point reste propre à une séance, via `NoteOrigine`, et conserve ses échanges et décisions historiques.
- Relier les reprises d’un sujet au moyen d’une référence vers le point précédent. La chaîne représente la continuité du sujet.

### Colonnes à prévoir et mapping

| Table | Colonne | Type / traitement proposé |
| --- | --- | --- |
| Sujets (réunions) | Instance | Réutiliser et mapper ; Choix pour commencer |
| Sujets | Date | Réutiliser et mapper ; Date |
| Sujets | Nom | Mapping distinct du titre libre déjà disponible ; colonne Texte du document pour les réunions ponctuelles |
| Sujets | Titre | Formule texte : Instance + « du » + date ; sans Instance, utiliser Nom ; sans date, afficher Instance seule |
| Sujets | Etat | Vérifier et adapter les valeurs existantes pour distinguer séances prévues, tenues et annulées |
| Points de discussion | PointPrecedent | Ajouter ; Référence vers cette même table |
| Points de discussion | EtatSuivi | Ajouter ; Choix : À reprendre, En attente, Clos |
| Points de discussion | ReprendreApres | Facultatif ; Date |

Avant de passer Titre en formule, recopier les titres actuels dans Nom. Utiliser Instance pour le regroupement, jamais le titre calculé. Conserver les codes, références, participants, contenu général, rattachements et archivage existants.

Pour de nouveaux points, proposer À reprendre par défaut. Un état historique vide ne déclenche pas de reprise automatique ; identifier progressivement les anciens points encore ouverts. Aucun ajout nécessaire dans Actions pour cette première version.

### Workflow envisagé

1. Créer une réunion en choisissant Instance et Date ; calculer son titre automatiquement.
2. Proposer une commande **Reprendre les sujets ouverts**, avec aperçu et sélection avant création.
3. Chercher dans toutes les séances antérieures de la même Instance, pas uniquement dans la dernière. Retenir le dernier point de chaque fil pour éviter les doublons ; distinguer À reprendre et En attente, et respecter éventuellement ReprendreApres.
4. Montrer le dernier compte rendu, la dernière décision, les actions en cours et l’historique.
5. Pour chaque reprise sélectionnée, créer un nouveau point lié à la nouvelle réunion et au PointPrecedent. Reprendre le titre et les rattachements, en les laissant modifiables. Laisser Contenu et Decision vides pour les nouveaux échanges ; consulter les anciennes informations comme contexte.
6. Mettre à jour EtatSuivi sur le nouveau point. Conserver l’état de l’ancien point comme historique. Un dernier point Clos retire le fil des prochaines propositions automatiques.
7. Retrouver les actions à travers le fil sans les dupliquer ni réécrire leur réunion ou point d’origine. Les nouvelles actions restent issues du point et de la réunion où elles sont créées.

### Garde-fous et travail restant

- Empêcher les autoréférences et les boucles de PointPrecedent.
- Éviter une double reprise dans la même réunion ; signaler un sujet déjà repris dans une autre séance prévue.
- Définir précisément la gestion d’une réunion annulée, de la suppression ou du déplacement d’un point et des changements d’Instance, sans perdre les sujets à reprendre.
- Pour la reprise automatique, rechercher dans une même Instance. Prévoir aussi un renvoi manuel vers une autre instance ou une réunion ponctuelle, selon la proposition du 23 novembre ci-dessous.
- Développer le mapping des nouvelles colonnes, les formulaires compatibles avec le titre calculé, l’aperçu de reprise, la lecture de l’historique et l’agrégation des actions.
- Articuler ensuite ce workflow avec la saisie rapide `@` et la création d’action depuis un paragraphe déjà inscrites à la feuille de route.

### Anticipation dans la saisie `@` et renvoi vers une réunion future

Proposition de conception discutée le 23 novembre 2026, à valider avant développement. Aucune colonne ni fonctionnalité n’est créée par cette inscription.

- Un bloc de discussion doit avoir une identité locale stable puis correspondre à une seule ligne Points. Son identité ne doit dépendre ni de son texte, ni de sa position, ni de ses mentions. Le premier choix validé après `@` prépare la création du point ; les suivants ajoutent des rattachements au même point. Proposer aussi un point sans rattachement au suivi, toujours lié à sa réunion.
- Rechercher les projets, chantiers et tâches actifs accessibles par titres, codes et chemins parents, sans distinction de casse ni d’accents. Recherche locale sur les données chargées ; aucune création à la seule frappe. Les rattachements multiples restent possibles.
- Anticiper les mappings PointPrecedent, EtatSuivi et éventuellement ReprendreApres, sans les rendre obligatoires pour utiliser `@`. Un nouveau point indépendant démarre sans PointPrecedent ; ce lien est réservé à une reprise explicite, jamais déduit de titres similaires.
- Le brouillon structuré devra conserver les identifiants de blocs, références, ordre et éventuels liens de reprise, avec compatibilité des brouillons texte existants. Les textes généraux restent distincts du contenu des points ; ne pas stocker deux copies modifiables du même paragraphe.
- Proposer ultérieurement **Renvoyer à une réunion…** : choisir une séance future existante ou en créer une, récurrente (Instance) ou ponctuelle (Nom libre), avec date ou date à préciser. Prévoir son état « prévue » et une confirmation avant écriture.
- Pour un sujet déjà abordé, conserver le point et ses échanges dans la réunion source. Créer un nouveau point dans la destination avec NoteOrigine vers cette réunion et PointPrecedent vers le point source. Reprendre titre et rattachements ; laisser les nouveaux échanges et décisions vides, en affichant l’historique en contexte. Un simple changement de NoteOrigine déplace la provenance et ne doit pas servir de renvoi historique.
- Aucun champ ReunionCible n’est nécessaire d’emblée : le nouveau point et sa NoteOrigine portent déjà la destination. La création de la réunion éventuelle et de son point doit être cohérente, sans doublon lors d’un nouvel essai après erreur.
- Première version recommandée : un seul successeur planifié par point, toutes instances confondues, avec accès à la destination et possibilité de réorienter explicitement. Plusieurs destinations simultanées créeraient des branches de discussion : périmètre à décider séparément.
- Une reprise déjà planifiée doit être signalée et exclue des nouvelles propositions automatiques de reprise pour éviter les doublons. Distinguer les séances prévues des séances tenues ; ne pas perdre un sujet si sa séance cible est annulée, supprimée ou reportée. Le suivi du sujet reste distinct de la planification d’une séance.
- Les actions existantes restent attachées à leur point/réunion d’origine et sont retrouvées via le fil des points, sans copie ni changement de provenance. Les nouvelles actions appartiennent à la séance qui les crée.
- Maintenir la distinction : reprise automatique par Instance ; renvoi manuel entre toutes réunions accessibles. Étudier séparément le déplacement d’un point ajouté par erreur à une réunion avant qu’il soit abordé.

## Utilisateur courant et filtres « Mes… »

Statut : explicitement reporté le 17 novembre 2026. Aucune implémentation à ce stade.

Objectif : retrouver le collaborateur correspondant à l’utilisateur connecté à Grist, puis proposer **Mes projets**, **Mes actions** et **Mes prochaines échéances**.

- Vérifier l’API disponible pour obtenir l’identité de l’utilisateur connecté (la piste `grist.getUserProfile()` évoquée dans la discussion reste à confirmer sur la version de Grist utilisée).
- Rapprocher l’adresse e-mail du compte de la colonne **Adresse email** de **COLLABORATEURS**, puis filtrer les champs Responsable par référence à cette ligne, sans se baser sur le nom affiché.
- Prévoir les cas sans utilisateur identifié, sans correspondance ou avec plusieurs correspondances ; ne pas sélectionner arbitrairement un collaborateur.
- Mes actions : actions attribuées au collaborateur courant.
- Mes prochaines échéances : éléments attribués, non terminés, classés par date ; préciser l’horizon et le traitement des dates absentes lors de la reprise.
- Question métier ouverte : Mes projets vise-t-il seulement les projets dont le collaborateur est responsable, ou aussi ceux contenant ses tâches et actions ?
- Préserver les filtres applicables et les comportements PC, tablette et téléphone. Ces raccourcis d’affichage ne remplacent pas les règles d’accès Grist.
- Ne pas modifier les données existantes ni l’initialisation native du Responsable à la création.

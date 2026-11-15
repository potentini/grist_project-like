# Feuille de route du widget de suivi

Cette feuille conserve les évolutions discutées et reportées. Les sujets ci-dessous ne sont pas implémentés et leur présence ne vaut pas autorisation de développement. Ajouter ici les nouveaux sujets explicitement laissés pour plus tard, avec les décisions déjà prises et les questions ouvertes.

## Prise de notes de réunion et rattachements rapides

Statut : à étudier et à réaliser ultérieurement. Discussion du 15 novembre 2026.

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

Points à décider : règles de séparation des paragraphes, traitement du collage, des déplacements, fusions et suppressions ; synchronisation sans doublons avec la table Points ; rythme d’enregistrement ; comportement lorsque plusieurs rattachements sont présents. Une saisie par blocs/points stables est une première piste ; l’analyse automatique d’un texte entièrement libre peut venir ensuite.

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
| Sujets | Nom | Ajouter ; Texte libre pour les réunions ponctuelles |
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
- Limiter les reprises à une même Instance pour une première version ; les reprises entre instances restent à étudier.
- Développer le mapping des nouvelles colonnes, les formulaires compatibles avec le titre calculé, l’aperçu de reprise, la lecture de l’historique et l’agrégation des actions.
- Articuler ensuite ce workflow avec la saisie rapide `@` et la création d’action depuis un paragraphe déjà inscrites à la feuille de route.

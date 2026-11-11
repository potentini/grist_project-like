# Projets, notes et actions — widget Grist V1

Une page d’accueil rassemble trois vues : **Projets**, **Notes et réunions**, **À faire**. La hiérarchie est Projet → Chantier → Tâche. Les notes restent du texte multiligne dans les tables Grist. Les actions peuvent être autonomes, issues d’une note et/ou rattachées à un élément du projet.

## Essayer

Publier les fichiers à la racine de `main` sur GitHub Pages (Settings → Pages → Deploy from a branch). Dans Grist, créer un widget personnalisé utilisant l’URL publiée de `index.html` et lui accorder **l’accès complet au document**. L’accès effectif en écriture reste soumis aux permissions Grist.

1. Importer les cinq CSV en tables distinctes : Projets, Chantiers, Taches, Notes, Actions.
2. Ouvrir **Mapping**. Les noms de tables, identifiants et libellés des colonnes servent à détecter les correspondances. Les accents, espaces et majuscules sont ignorés. Un identifiant exact est prioritaire ; les synonymes ambigus ne sont pas choisis.
3. Corriger les tables et champs proposés. Les tables renommées se sélectionnent manuellement ; les champs reconnus de cette table sont alors proposés. La détection complète les champs manquants sans remplacer les choix existants.
4. Cliquer **Enregistrer le mapping**. La configuration est enregistrée dans les options de cette instance Grist, sans modifier le schéma des tables. Aucun contenu métier n’est stocké dans le navigateur.
5. Sélectionner une ligne pour lire ses détails, créer une note/action ou modifier les champs mappés. **Actualiser** recharge toutes les tables, notamment après une modification faite dans une autre vue Grist.

Pour un aperçu indépendant de Grist : servir le dossier avec `python -m http.server 8765`, puis ouvrir `index.html?demo=1` sur ce serveur. Cette démonstration contient des données fictives et reste en lecture seule. Ne pas ouvrir directement le fichier depuis le disque.

## Mapping et liens

Chaque objet doit utiliser une table distincte. Seul Titre est requis pour créer une ligne ; les parents doivent être mappés pour construire l’arbre. Tous les champs des CSV proposés sont configurables.

Les liens acceptent :

- les vraies colonnes **Référence** / **Liste de références** Grist ;
- les codes métier des CSV, si la colonne **Code** est mappée dans la table cible. Les listes de codes sont séparées par des virgules.

Les codes doivent être uniques et stables dans chaque table. Le formulaire propose un code libre pour les nouvelles lignes et protège le code des lignes existantes. Les colonnes de formule sont lisibles et exclues des formulaires d’écriture. Les références dans Responsable/Participants se modifient depuis la table Grist ; la V1 privilégie ici les colonnes Texte des CSV.

Une action liée à une tâche retrouve automatiquement son chantier et son projet à l’enregistrement ; une action liée à un chantier retrouve son projet. Aucun pourcentage du projet n’est recalculé en terminant une action. Avancement utilise une valeur de 0 à 1 (0,5 = 50 %). Les échéances libres restent du texte et les filtres de retard utilisent seulement DateFin. Sans date précise, aucune date n’est supposée.

Les notes et actions associées sont affichées depuis le projet, le chantier ou la tâche ; les actions permettent aussi de retrouver leur note d’origine. Une note peut référencer plusieurs chantiers ou tâches.

## Timeline conservée

`timeline.html` conserve la table et la timeline d’origine, le redimensionnement des panneaux et leur mapping interne. La page principale enregistre également les trois niveaux du mapping dans les options existantes (`directMapping`). Pour naviguer vers la timeline depuis la V1, les parents Projet et Chantier doivent être de vraies références Grist. Avec de simples codes CSV, la V1 fonctionne mais demande de convertir ces colonnes avant d’utiliser la timeline.

Un lien permet de revenir à la page principale. Les champs supplémentaires configurés dans l’ancien mapping restent conservés.

## Validation et limites

Lancer le serveur avec `python -m http.server 8766 --bind 127.0.0.1`, puis `node tests/workspace.cjs`. Cette commande exécute des parcours navigateur avec Playwright et Chromium, sur un serveur local lancé dans le dossier. Playwright doit être installé dans l’environnement ; le test utilise `/usr/bin/chromium`. L’API Grist est simulée : ces tests couvrent les codes CSV, références natives, colonnes renommées, sauvegarde du mapping, édition des notes, création d’actions, filtres, protection des formules et erreurs d’accès.

Une connexion à un vrai document Grist reste à vérifier lors de l’essai utilisateur. La V1 ne crée pas de tables/colonnes, ne supprime pas de données et ne traite pas la matrice « Avancement par dimension ». Les notes ne disposent pas d’un éditeur enrichi. La timeline reste une page séparée. Il n’y a pas encore de gestion des conflits entre deux éditeurs simultanés.

## Édition dans le détail

Le bouton **Modifier** transforme directement les informations affichées en champs préremplis dans le panneau de détail. **Enregistrer** applique les modifications ; **Annuler** restitue la lecture sans écrire dans Grist. Les autres champs et rattachements restent accessibles dans une section dépliable. Les créations utilisent encore un formulaire séparé.

Le brouillon reste visible en cas d’erreur et lors des rafraîchissements. Il faut enregistrer ou annuler avant de changer de vue ou d’élément. Les colonnes calculées restent protégées et seules les valeurs modifiées sont envoyées (avec normalisation des parents d’une action).

## Plier les niveaux et déplacer des sous-éléments

Le bouton **Édition** est désactivé à l’ouverture. En lecture, les flèches et les boutons **Tout plier / Tout déplier** restent accessibles ; les créations, modifications et déplacements sont bloqués.

- **Projets** : chaque projet contient ses chantiers, leurs tâches et les actions rattachées au niveau le plus précis.
- **Notes et réunions** : chaque note peut se déplier pour afficher ses actions.
- **À faire** : les actions sont regroupées dans la hiérarchie projet / chantier / tâche, avec une zone pour les actions sans rattachement au projet.
- Dans le panneau droit, les éléments dépendants et les actions des notes associées sont dépliables (repliés par défaut). Les liens vers les parents restent des liens simples.

En mode Édition, glisser un chantier sur un projet, une tâche sur un chantier, ou une action sur un projet, chantier, tâche ou réunion. La cible compatible est mise en évidence. Le bouton **Déplacer** fournit la même opération au clavier ou sur écran tactile. Un déplacement est enregistré immédiatement, sans passer par le bouton Enregistrer du formulaire.

Changer le parent d’un chantier ou d’une tâche conserve ses descendants et met à jour les rattachements redondants des actions liées dans une seule opération Grist. Déplacer une action sur une réunion change seulement sa réunion d’origine : son lien au projet est conservé. La destination **Sans rattachement au projet** conserve aussi la réunion d’origine. Aucun réordonnancement manuel entre frères n’est ajouté.

Les parents calculés ou les champs de liaison non mappés peuvent empêcher un déplacement ; le widget affiche alors l’explication. Les droits Grist restent applicables. Un refus d’écriture conserve le parent d’origine. Le pliage est indépendant dans chaque volet et reste conservé pendant la navigation de la session (réinitialisé au rechargement).

## Défilement et repères visuels

La liste et le détail disposent de défilements verticaux indépendants dans la hauteur disponible du widget. Sur petit écran, les deux volets sont empilés et restent défilables séparément. Le mapping possède aussi une hauteur limitée avec son propre défilement. Chaque volet peut recevoir le focus au clavier.

Une bordure et un fond discret distinguent les projets (bleu), chantiers (ocre), tâches (vert bleuté), actions (mauve) et notes (gris bleuté). La palette s’inspire d’Okabe–Ito ; les libellés de type et l’indentation permettent également de reconnaître les niveaux sans distinguer les couleurs. Les contrastes du texte et des bordures sur leurs fonds sont vérifiés (respectivement ≥ 4,5:1 et ≥ 3:1).

## Revenir à l’endroit précédent

Les boutons **Retour** et **Suivant**, en haut du panneau de détail, parcourent l’historique de navigation du widget. Cliquer sur un élément ouvre son détail en haut du panneau ; revenir restaure la sélection précédente, les positions de défilement des deux volets, les niveaux pliés/dépliés, la vue et ses filtres. Les clics dans la liste et dans le détail, ainsi que les changements d’onglet, alimentent cet historique.

Une nouvelle navigation après un retour remplace la branche « Suivant ». Les commandes restent bloquées tant qu’un formulaire n’a pas été enregistré ou annulé. Cet historique conserve jusqu’à 100 étapes pendant la session, ne modifie aucune donnée Grist et se réinitialise au rechargement du widget. Il ne sert pas à annuler les modifications de données.

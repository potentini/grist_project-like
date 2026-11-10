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

`node tests/workspace.cjs` exécute des parcours navigateur avec Playwright et Chromium, sur un serveur local lancé dans le dossier. Playwright doit être installé dans l’environnement ; le test utilise `/usr/bin/chromium`. L’API Grist est simulée : ces tests couvrent les codes CSV, références natives, colonnes renommées, sauvegarde du mapping, édition des notes, création d’actions, filtres, protection des formules et erreurs d’accès.

Une connexion à un vrai document Grist reste à vérifier lors de l’essai utilisateur. La V1 ne crée pas de tables/colonnes, ne supprime pas de données et ne traite pas la matrice « Avancement par dimension ». Les notes ne disposent pas d’un éditeur enrichi. La timeline reste une page séparée. Il n’y a pas encore de gestion des conflits entre deux éditeurs simultanés.

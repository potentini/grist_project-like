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

## Modifier les rattachements dans le panneau droit

En mode Édition, **Modifier** transforme directement les rattachements affichés en listes de sélection, y compris ceux encore vides. Les actions proposent Projet, Chantier, Tâche et Note / réunion d’origine ; les chantiers proposent leur Projet, les tâches leur Chantier, et les notes leurs associations à un projet, des chantiers et des tâches. Les champs doivent être mappés et non calculés pour être modifiables. Les autres champs facultatifs restent dans « Autres champs ».

Choisir une tâche renseigne immédiatement son chantier et son projet. Changer de chantier ou de projet retire les rattachements inférieurs devenus incompatibles. Les choix ne sont écrits dans Grist qu’avec **Enregistrer** ; **Annuler** conserve les anciens liens. Changer le parent d’une tâche ou d’un chantier actualise également les rattachements redondants des actions dépendantes dans la même sauvegarde. Les notes peuvent sélectionner plusieurs chantiers ou tâches.

## Réunions et points de discussion transversaux

Une réunion reste une ligne de Notes avec sa date, ses participants et son texte général. La table facultative **Points** ajoute des sujets ordonnés : titre, contenu, décision, réunion d’origine, plusieurs projets/chantiers/tâches. Dans « Notes et réunions », la réunion se déplie en points puis en actions. Un projet, chantier ou tâche affiche les points qui le concernent ; ouvrir un point donne accès à ses notes et à la réunion complète.

Chaque action peut avoir une référence **PointOrigine**, en plus de NoteOrigine. Le point détermine sa réunion d’origine, mais ne choisit pas arbitrairement un projet parmi plusieurs. Ses rattachements opérationnels restent facultatifs et indépendants. Réaffecter un point à une réunion met à jour la réunion d’origine de ses actions. Déplacer une action vers une autre réunion retire un lien au point devenu incompatible.

Cette évolution est compatible avec les documents sans table Points. Pour l’activer, suivre [imports/README.md](imports/README.md), importer [Points.csv](imports/Points.csv), ajouter Actions.PointOrigine et enregistrer le mapping. Aucun document Grist n’est modifié automatiquement par la mise à jour du widget.

## Faire évoluer un travail

En mode Édition, une action peut devenir une tâche et une tâche devenir un chantier. Le bouton **Faire évoluer en…** ouvre un aperçu : parent choisi, champs repris ou non repris, actions et notes/points à réaffecter. La confirmation crée la destination, conserve la filiation et marque l’origine Transforme, hors du suivi actif. Le statut d’exécution de l’origine n’est pas changé en Fait.

Les liens d’origine restent consultables, mais ne sont pas éditables par le formulaire normal. Les notes/points gardent l’accès aux actions transformées. Une tâche transformée en chantier rejoint le projet choisi ; elle ne devient pas un chantier imbriqué dans son ancien chantier. Aucun pourcentage d’avancement n’est inventé.

Avant utilisation, ajouter et mapper les quatre colonnes décrites dans [imports/TRANSFORMATIONS.md](imports/TRANSFORMATIONS.md). Le widget ne crée pas ces colonnes automatiquement. Les listes actives du widget filtrent les origines ; pour les vues Grist natives, appliquer aussi le filtre Transforme=false si nécessaire.

## Archivage et suppression

Les commandes **Archiver…**, **Restaurer…** et **Supprimer…** sont accessibles dans le détail en mode Édition. L’archivage nécessite une colonne de données booléenne Archive dans chaque table concernée ; la suppression peut être utilisée sans cette colonne. Les données archivées sont conservées et retrouvables avec **Afficher les archivés**. Les parents archivés restent visibles comme contexte de leurs dépendants actifs.

La suppression ne se fait pas en cascade et est bloquée en présence de références à l’élément. L’aperçu liste les liens à réaffecter et exige une confirmation explicite. Voir [les consignes détaillées](imports/ARCHIVAGE_SUPPRESSION.md).

## Réunions associées à un élément

La section **Notes et réunions associées** réunit les liens directs, les réunions d’origine des points concernant l’élément (même sans action), et celles des actions rattachées. Une réunion apparaît une seule fois, avec ses raisons d’association : lien direct, point(s) ou action(s). Les liens hérités de la hiérarchie sont également signalés.

Dans cette section, le dépliage n’affiche que les points et actions expliquant l’association à l’élément courant. Cliquer sur la réunion ouvre son compte rendu complet. Ces associations sont calculées depuis les liens existants, sans nouvelle colonne ni duplication de note. Les réunions archivées restent soumises au filtre d’affichage des archives.

## Filtres natifs, références et configuration des libellés

Les filtres natifs Grist transmis par `onRecords` s’appliquent désormais à la table source rattachée au widget lorsqu’elle correspond à une table mappée. Le widget conserve les ancêtres nécessaires à la lecture de la hiérarchie et limite les descendants liés. Un résultat Grist vide reste vide. Les filtres d’autres vues Grist non rattachées au widget ne sont pas transmis par cette API ; si la table source n’est pas mappée, un message l’indique.

Les champs Référence / Liste de références utilisent la colonne d’affichage configurée dans Grist (`visibleCol`, ou la colonne d’affichage calculée lorsqu’elle est disponible). Cela s’applique aux titres, responsables, métadonnées, sélections et filtres. Les valeurs enregistrées restent des identifiants Grist. Un champ référence sans colonne d’affichage configurée conserve l’affichage par ID choisi dans Grist. Les tables nécessaires à la résolution doivent être accessibles à l’utilisateur.

Le mapping enregistré, même incomplet, est conservé tel quel : rouvrir Mapping ou recharger le widget ne remplit plus les champs laissés vides. **Détecter les champs manquants** est une commande explicite ; elle peut remplir les cases vides, mais conserve les correspondances déjà choisies. Le tout premier démarrage sans configuration propose toujours une détection initiale.

Dans Mapping, **Nom du niveau / type** permet par exemple de nommer Projets « Sous-projet » et Chantiers « Jalons / Livrables ». Chaque champ peut également recevoir un libellé personnalisé. Ces noms sont enregistrés dans les options de cette instance du widget ; les tables et colonnes Grist ne sont pas renommées.

**DateFin** est une date précise, utilisée pour le calendrier et le calcul des retards. **Echeance** est un texte libre pour des indications comme « avant le Codir ». Ce ne sont pas deux dates de fin ; l’un des deux peut rester non mappé. Leurs libellés par défaut précisent désormais cette différence.

Le volet dépliable **Filtres par niveau** permet de choisir un type, n’importe quelle colonne de sa table (même non mappée) et une valeur « contient ». **Ajouter le filtre** permet de cumuler des critères sur plusieurs niveaux ; les critères sur un même niveau doivent être satisfaits par une même ligne. Les filtres utilisent les libellés des références et se combinent aux contrôles rapides ainsi qu’aux filtres natifs Grist. Les pastilles permettent de retirer un critère ; **Tout effacer** retire les filtres avancés. Ils sont conservés dans l’historique de navigation de la session.

Modifier, Faire évoluer, Archiver et Supprimer sont regroupés dans une même barre d’actions (avec retour à la ligne sur les écrans étroits). Le lien de navigation est nommé **Vue Table/Timeline**. Dans Notes et réunions, les trois niveaux Réunion → Point → Action utilisent les accents bleu / ocre / vert bleuté ; À faire reprend les couleurs de la hiérarchie Projets. Les libellés et l’indentation restent disponibles sans dépendre des couleurs.

## Largeur des volets et cartes enrichies

Sur écran large, faire glisser la séparation verticale entre la liste et le détail pour régler leurs largeurs. La séparation est accessible au clavier : flèches gauche/droite, Maj pour un pas plus grand, Début/Fin pour les limites. Un double-clic restaure la répartition initiale. La largeur est enregistrée dans les options de cette instance du widget (`workspacePaneLayoutV1`), indépendamment du mapping et des données. Des largeurs minimales évitent de rendre un volet inutilisable. Sur petit écran, la séparation est masquée et les volets restent empilés et défilables indépendamment.

Les cartes du volet gauche affichent les champs mappés lorsqu’ils sont renseignés : début et fin, échéance libre, nature, avancement en pourcentage et barre (y compris 0 %), et un court aperçu du point d’étape, commentaire ou contenu. Les réunions peuvent également afficher les participants. Les aperçus sont limités à 160 caractères et visuellement à une ligne ; le contenu complet reste dans le détail. Les valeurs restent du texte échappé. Les pourcentages utilisent toujours les valeurs Grist de 0 à 1.

Le sélecteur de projets se limite désormais aux projets concernés par les filtres natifs de la table Grist rattachée au widget. Les ancêtres pertinents sont inclus lorsque le filtre porte sur des tâches ou des actions. Si aucun projet n’est concerné, seul « Tous » reste proposé. Une sélection qui sort du périmètre du filtre natif est réinitialisée. Les choix Responsable et Statut suivent aussi ce périmètre.

## Reprise après veille et cartes compactes

Le widget redemande la vue filtrée native avec `viewApi.fetchSelectedTable` au démarrage, au retour au premier plan, au rétablissement du réseau et avec **Actualiser**. Une erreur temporaire ne supprime plus le dernier périmètre connu : il reste appliqué, y compris lorsqu’il ne contient aucune ligne. Si aucun périmètre n’a encore pu être récupéré, le widget attend la connexion au lieu d’afficher toutes les lignes. Les réponses de synchronisation devenues obsolètes sont ignorées. L’API `onRecords` reste utilisée pour les changements transmis par Grist ; les environnements sans méthode de lecture directe de la vue conservent leur dernier filtre en cas d’erreur.

Les cartes regroupent les informations renseignées sous forme **Champ : valeur ; Champ : valeur**, avec retour à la ligne selon la largeur disponible. Les noms personnalisés restent utilisés. Le titre et le type partagent une ligne dans la liste ; les dates, responsable, statut et avancement sont compacts, avec une petite barre de progression en ligne. Les aperçus et les valeurs longues sont tronqués à 160 caractères pour cet affichage ; le détail et les tables gardent leurs valeurs complètes. Le nom et la date de la réunion d’origine restent affichés sur les points de discussion.

## Sélection multiple et liste des valeurs

Les filtres rapides Projet, Responsable et Statut proposent chacun un champ de sélection éditable : tapez quelques lettres pour réduire les options (sans distinction de casse ni d’accents), puis cochez les choix souhaités. Entrée choisit le premier résultat, Flèche bas donne accès aux cases ; Échap ferme la liste. La recherche ne retire pas les choix déjà cochés. Le menu affiche le choix sélectionné ou le nombre de choix ; **Tous** retire la restriction du filtre. La touche Échap ou un clic à l’extérieur ferme le menu. Les choix d’un même filtre sont combinés par **OU** ; les différents filtres par **ET**. Le filtre Responsable propose les personnes présentes aux différents niveaux de la vue, avec les libellés des références. Pour une liste de responsables, choisir une personne suffit à retrouver les lignes où elle figure.

Dans **Filtres par niveau**, une liste de valeurs disponibles apparaît après sélection du champ. Plusieurs valeurs peuvent être cochées puis ajoutées comme un critère. La zone Contient sert à chercher dans les options ; sans case cochée, elle garde son filtrage textuel « contient ». Les champs sans valeur proposent « (Vide) ». Les valeurs sont calculées dans le périmètre natif Grist courant et utilisent les libellés des références, pas les identifiants. Les sélections multiples sont conservées dans l’historique de navigation de la session.

## Responsable externe et champs supplémentaires

Les quatre niveaux Projets, Chantiers, Taches et Actions proposent un champ ResponsableDiPSi, affiché « Responsable externe », en plus de Responsable. Chaque niveau permet d’ajouter des colonnes existantes comme champs supplémentaires dans le mapping. Voir [les consignes](imports/CHAMPS_SUPPLEMENTAIRES.md) pour préparer ces colonnes et les associer. Aucune colonne n’est créée automatiquement.

Dans le panneau droit, **Éléments dépendants**, **Notes et réunions associées** et **Actions associées** disposent d’une flèche de pliage/dépliage. Leur état est propre à l’élément et conservé pendant la navigation et les retours de la session. Le pliage reste possible en lecture seule.

## Rattachements dépendants pendant la saisie

En création comme en modification, le choix d’un projet limite les chantiers et tâches proposés à ce projet ; le choix d’un chantier limite les tâches à ce chantier. Sans parent sélectionné, la liste reste ouverte. Choisir un chantier renseigne son projet, et choisir une tâche renseigne son chantier et son projet, lorsque ces champs sont mappés et modifiables. Changer de parent retire les sélections inférieures incompatibles. Les liens existants restent visibles à l’ouverture, même s’ils sont incohérents, afin de pouvoir les vérifier sans les effacer silencieusement.

Pour les points de discussion, plusieurs projets ou chantiers sélectionnés ouvrent les options de l’ensemble de ces parents. Les parents déduits s’ajoutent aux choix multiples. Une note peut garder plusieurs chantiers de projets différents : son champ Projet unique n’est rempli automatiquement que si les rattachements désignent un seul projet. Pour élargir une liste, effacez le parent ou ajoutez les parents souhaités. Les colonnes calculées restent protégées ; aucun changement n’est écrit avant **Enregistrer**.

## Avancement des quatre niveaux

Projets, Chantiers, Tâches et Actions disposent chacun d’un champ **Avancement** facultatif à mapper. Dans le mapping, la case **Sur base 1** détermine l’unité propre à ce niveau : cochée, `0,1` ou `0.1` représente **10 %** ; décochée, la même valeur représente **0,1 %** (`10` représente alors 10 %). La base 1 reste la valeur par défaut pour préserver les configurations existantes. Changer cette option réinterprète les valeurs ; cela ne réécrit pas la table.

Si la colonne manque, activez Édition puis utilisez **Créer la colonne Avancement** dans le mapping du niveau concerné. Le widget crée une colonne de données numérique modifiable ; enregistrez ensuite le mapping. Une colonne existante peut être sélectionnée directement, y compris une formule en lecture seule.

La saisie accepte le point et la virgule, de 0 à 1 ou de 0 à 100 selon la base. Les cartes et le détail conservent les pourcentages décimaux. Le choix est transmis à la Vue Table/Timeline ; celle-ci édite les pourcentages affichés et les convertit dans l’unité de la colonne. Une transformation Action → Tâche ou Tâche → Chantier conserve le pourcentage lorsque les bases diffèrent et que le champ est compatible.

## Timeline du projet dans le suivi

Le bouton **Ouvrir la timeline du projet**, près d’**Éléments dépendants**, ouvre une fenêtre avec la table et la timeline du projet complet. Depuis un chantier ou une tâche, le projet parent, ses chantiers, ses tâches et ses actions sont affichés. Une action rattachée directement à un projet ou à un chantier apparaît sous ce parent. Les autres projets sont exclus. Les dates manquantes restent visibles dans la table.

La table et ses contrôles sont repliés à chaque ouverture ; **Afficher la table** permet de les déployer. Le bouton **Édition** de la fenêtre est indépendant du suivi principal et synchronise l’édition de la timeline et de sa table. Activez-le pour modifier les titres, dates, statuts, responsables et avancements. Les changements sont enregistrés dans les lignes Grist d’origine et répercutés dans le suivi. Les formules et droits Grist restent protégés. Cette fenêtre ne crée et ne supprime pas d’éléments. La fermeture conserve la sélection et rétablit la position des deux volets ; les réglages de la fenêtre sont séparés de ceux de la timeline principale.

## Rechercher dans les listes de saisie

En création et en modification dans le suivi, les listes de choix utilisent un seul champ **Choisir ou rechercher…**. Cliquez pour afficher les options ou tapez quelques lettres pour ne garder que les libellés contenant ce texte, sans distinction de casse ni d’accents. Les résultats respectent les projets et chantiers sélectionnés. Choisissez un résultat par clic, ou avec les flèches puis Entrée. Échap ou un clic extérieur ferme la liste en conservant la sélection.

Les listes multiples affichent les choix cochés ; un clic coche ou décoche une option. À la fermeture, le champ affiche les libellés sélectionnés. Rechercher ou saisir un texte libre ne modifie aucun rattachement : seul un choix dans la liste change la sélection, et **Enregistrer** valide les données.

## Présentation téléphone

Sur un écran tactile dont le petit côté mesure moins de 600 pixels CSS, et lorsque le widget dispose au plus de 1000 pixels de largeur, une présentation compacte s’active. La taille de l’écran physique en pixels CSS est utilisée en plus de la largeur du widget : un volet PC étroit ou une tablette de 600 pixels et plus conserve l’interface habituelle. Le mode téléphone reste actif en paysage.

Le téléphone démarre sur **Actions**, avec ajout d’action en haut de liste. Le menu unique permet de choisir **Projets**, **Chantiers** ou **Actions**. La recherche reste visible sous la navigation, à la place du message d’actualisation. **Filtres** rassemble les filtres rapides Projet, Responsable et Statut sur une ligne, puis les filtres avancés. Le contrôle Afficher les archivés est masqué sur téléphone ; les erreurs restent visibles. Le titre général, Mapping, Actualiser et les liens de timeline sont masqués. Le petit bouton **Édition** conserve le contrôle des modifications.

La liste occupe seule l’écran. Ouvrir un élément affiche uniquement le détail, avec une bande cliquable à gauche pour revenir à la liste et retrouver son défilement. Une modification en cours doit être enregistrée ou annulée avant ce retour. Les formulaires de création occupent la largeur disponible, avec saisie adaptée au tactile et commandes Enregistrer/Annuler regroupées. Ces règles sont limitées au mode téléphone ; les vues PC et tablette conservent leur présentation et leur fonctionnement.

## Responsable par défaut à la création

L’API publique du widget ne fournit pas l’identité de l’utilisateur connecté. L’affectation peut être confiée à une formule d’initialisation Grist sur la colonne de données Responsable : `user.Name` pour une colonne Texte, ou `Collaborateurs.lookupOne(Email=user.Email)` pour une référence (en adaptant les noms réels de table et de colonne). La formule doit s’appliquer aux nouvelles lignes, pas aux modifications ultérieures.

Le widget laisse Grist calculer cette valeur lorsqu’un nouvel élément est enregistré sans responsable choisi. Un responsable explicitement sélectionné reste prioritaire ; la modification d’un élément existant ne réaffecte pas son responsable. Ce mécanisme attribue la valeur à l’enregistrement : il ne permet pas d’afficher l’identité dans le formulaire avant sa création.

Dans **Filtres par niveau**, seuls les champs mappés pour le niveau sélectionné sont proposés, y compris les champs supplémentaires et les colonnes calculées mappées. Les libellés personnalisés sont repris. Retirer un champ du mapping retire également les filtres actifs qui utilisaient ce champ.

À l’ouverture, les branches du panneau gauche démarrent repliées dans chaque vue, sur téléphone, tablette et PC. Le pliage/dépliage manuel et les boutons Tout plier/Tout déplier restent disponibles. Les choix sont conservés pendant la session et l’historique de navigation ; un rechargement démarre de nouveau replié. Vérification dédiée : `node tests/initial-fold.cjs` (serveur local sur le port 8766).

## Tri hiérarchique commun

Le volet de suivi (**Filtres → Tri**), la table et la timeline proposent deux réglages : **Projets** (titre par défaut) et **Niveaux inférieurs** (date de fin croissante par défaut). Les autres critères sont la date de début, le titre, la priorité lorsqu’elle est mappée et l’ordre manuel. Le tri s’applique aux frères, sans séparer les éléments de leurs parents. Sans date propre, un parent utilise la dernière date de fin / première date de début de ses descendants actifs. Les dates absentes viennent en dernier ; les égalités de fin utilisent le début puis le titre. Le tri ne modifie aucune date ni relation.

Les choix sont mémorisés dans l’option Grist `hierarchySortV1`, commune au suivi et à sa fenêtre Table/Timeline. Les options des instances de widgets distinctes restent propres à chaque instance. Le widget dual autonome permet de mapper Priorité et Ordre manuel dans le mapping interne. L’avancement propose explicitement les bases 1, 100 ou le comportement automatique historique.

Le dépôt d’origine `potentini/dev_grist_3_level_dual_widget` utilise le même moteur `widget.js` et `hierarchy-sort.js`. Pour reporter les évolutions à venir : `python scripts/export-dual-widget.py /chemin/vers/dev_grist_3_level_dual_widget`. Le script génère les fichiers autonomes sans le pont spécifique à la fenêtre du suivi ; les changements sont ensuite à vérifier, committer et publier dans le dépôt cible. Vérification croisée : `node tests/hierarchy-sort.cjs`, avec les serveurs locaux du suivi sur 8766 et du dual sur 8767.

La recherche du suivi ouvre temporairement les branches du panneau gauche qui contiennent des résultats, même si elles étaient repliées. Le pliage de la recherche est indépendant : effacer la recherche rétablit le pliage précédent. Les résultats sans correspondance ne sont pas conservés comme cibles de déplacement en mode Édition. Vérification dédiée : `node tests/search-reveal.cjs`.

La feuille partagée `form-theme.css` impose un texte foncé sur fond blanc dans les champs natifs et les listes de choix, en mode jour comme en mode nuit, y compris le texte de saisie automatique des navigateurs WebKit. Elle doit être publiée avec les fichiers du widget.

En mode Modification, les champs mappés sont affichés même lorsqu’ils sont vides, à leur emplacement habituel. La section Autres champs est ouverte par défaut. Les champs calculés et les champs protégés restent visibles en lecture seule ; ils ne sont pas réécrits par le formulaire. L’affichage hors modification conserve ses règles de masquage des champs vides.

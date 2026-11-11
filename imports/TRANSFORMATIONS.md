# Activer les transformations

Ajouter ces colonnes dans les tables existantes (ne pas réimporter les tables complètes) :

| Table | Colonne | Type Grist |
| --- | --- | --- |
| Actions | Transforme | Booléen / Case à cocher, false par défaut |
| Taches | Transforme | Booléen / Case à cocher, false par défaut |
| Taches | ActionOrigine | Référence vers Actions, affichage Titre |
| Chantiers | TacheOrigine | Référence vers Taches, affichage Titre |

Ouvrir Mapping, détecter les champs manquants, vérifier ces colonnes et enregistrer (actualise aussi le mapping de la timeline). Les colonnes Code et Titre des destinations doivent être du texte modifiable ; les parents et les liens d’origine doivent être modifiables. Les codes doivent être uniques et stables. Les références d’origine peuvent aussi être du Texte avec les codes source si Code est mappé.

En mode Édition, ouvrir une action ou une tâche, cliquer **Faire évoluer en…**, choisir son chantier ou projet parent et lire l’aperçu avant confirmation. Aucune donnée n’est modifiée avec Annuler. Les informations non compatibles avec les colonnes cibles restent dans l’origine et sont signalées dans l’aperçu.

La destination est créée, les dépendances sont réaffectées et Transforme est coché dans une seule transaction Grist. Un refus d’écriture empêche la transformation. Une modification concurrente détectée actualise l’aperçu et impose de confirmer à nouveau ; une collision d’identifiant est rejetée par Grist sans suppression de l’origine.

Les origines ne sont jamais supprimées ni marquées Fait. Elles restent consultables depuis la destination et, pour les actions, depuis leurs notes/points d’origine. Les listes actives et la timeline excluent les origines transformées (les tables Grist natives peuvent utiliser un filtre Transforme=false). Les rattachements d’une action transformée restent historiques ; les actions actives d’une tâche transformée deviennent des actions du nouveau chantier. Les listes de références Taches des notes/points sont réaffectées vers Chantiers.

Les transformations inverses, l’annulation d’une transformation et le déplacement automatique de champs non mappés ne sont pas inclus. Les règles d’accès Grist continuent à s’appliquer. Les dépendances ne peuvent être réaffectées que si leurs colonnes sont mappées et modifiables : compléter le mapping avant toute transformation.

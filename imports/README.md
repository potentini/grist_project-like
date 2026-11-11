# Activer les points de discussion dans Grist

Les cinq tables actuelles restent utilisables. L’ajout ci-dessous ne modifie ni les anciennes notes ni les actions.

1. Importer `Points.csv` comme nouvelle table **Points**. Le fichier contient uniquement les en-têtes, sans donnée d’exemple à supprimer. Si l’importateur ne propose pas une table vide, créer manuellement la table avec ces colonnes.
2. Configurer les types :

| Colonne | Type Grist |
| --- | --- |
| Code | Texte, identifiant unique et stable |
| Titre | Texte |
| NoteOrigine | Référence vers Notes (affichage : Titre) |
| Contenu | Texte multiligne |
| Decision | Texte multiligne |
| Projets | Liste de références vers Projets |
| Chantiers | Liste de références vers Chantiers |
| Taches | Liste de références vers Taches |
| Ordre | Entier |

3. Dans **Actions**, ajouter une colonne **PointOrigine** de type **Référence vers Points**, affichant le Titre. Conserver la colonne NoteOrigine existante.
4. Dans le widget, ouvrir **Mapping**, choisir Points pour « Points de discussion », lancer la détection des champs manquants, puis vérifier les colonnes et enregistrer. Mapper également Actions.PointOrigine.
5. Activer **Édition**, ouvrir une réunion et cliquer **+ Point de discussion**. Saisir son sujet, ses notes/décisions, ses rattachements et enregistrer. Depuis ce point, créer une action : le point et sa réunion d’origine sont conservés automatiquement.

Les projets, chantiers et tâches affichent uniquement les points auxquels ils sont rattachés. Le point permet d’ouvrir le compte rendu complet. Une réunion peut conserver son texte général et ses actions directes, sans utiliser de points.

Les colonnes de liaison peuvent également rester en Texte avec les codes des CSV : plusieurs codes sont séparés par des virgules. Dans ce cas, mapper Code dans chaque table cible. Les références Grist sont recommandées pour leur intégrité et leur lisibilité native.

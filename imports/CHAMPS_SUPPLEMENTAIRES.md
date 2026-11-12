# Responsable DiPSi et champs supplémentaires

Dans Projets, Chantiers, Taches et Actions, créer si nécessaire une colonne de données **ResponsableDiPSi** (libellé : Responsable DiPSi). Elle peut être de type Texte, Référence ou Liste de références vers votre table d’équipe. Elle est indépendante du champ Responsable.

Ouvrir Mapping, utiliser **Détecter les champs manquants** si souhaité, puis vérifier et enregistrer chaque association ResponsableDiPSi. Les responsables DiPSi apparaissent dans les cartes, le détail et le formulaire. Pour les filtrer séparément, choisir le niveau et le champ Responsable DiPSi dans les filtres avancés.

Chaque niveau du mapping dispose de **+ Champ supplémentaire**. Choisir une colonne déjà présente dans Grist, définir son libellé et enregistrer. Pour ajouter une donnée qui n’existe pas encore dans Grist, créer d’abord sa colonne puis rouvrir Mapping. Le bouton ne crée ni ne supprime de colonne Grist.

Les champs supplémentaires mappés apparaissent dans le détail et les cartes. Les colonnes de données modifiables deviennent des contrôles adaptés dans le formulaire ; les colonnes calculées restent en lecture seule. Les références utilisent leur libellé Grist. Les booléens, nombres, dates, listes de choix et listes de références conservent leurs types à la sauvegarde. Une même colonne ne peut pas être ajoutée une seconde fois comme champ supplémentaire du même niveau : utiliser plutôt le libellé personnalisé du champ existant.

Retirer un champ supplémentaire du mapping retire uniquement son affichage dans le widget, pas sa colonne ni ses valeurs. Ces champs ne changent pas la hiérarchie : les liens parents continuent à utiliser les champs Projet, Chantier, Tâche déjà prévus.

# Archiver, restaurer et supprimer

## Préparer l’archivage

Ajouter dans chacune des tables où vous souhaitez archiver des lignes une colonne **Archive**, de type **Booléen / Case à cocher**, avec la nature **Colonne de données** (sans formule), décochée par défaut : Projets, Chantiers, Taches, Notes, Points, Actions. Le nom peut être différent si le mapping est choisi manuellement.

Dans le widget : ouvrir Mapping, détecter les champs manquants, vérifier chaque champ Archive et enregistrer. La colonne Transforme reste réservée aux transformations : ne pas la réutiliser pour l’archivage manuel.

## Utiliser les commandes

En mode **Édition**, sélectionner un élément puis **Archiver…**. L’aperçu montre ses références. Confirmer explicitement l’opération. Seule la ligne sélectionnée est archivée ; ses données et ses liens sont conservés, sans modifier son statut ni archiver ses dépendants. Un parent archivé reste visible comme contexte si des dépendants sont actifs.

Cocher **Afficher les archivés** pour retrouver les lignes archivées, puis **Restaurer…** pour les réintégrer. L’archivage se distingue d’une transformation : les origines transformées ne se restaurent pas ainsi.

**Supprimer…** affiche les références et exige une confirmation explicite. La suppression est bloquée si d’autres lignes référencent l’élément. Réaffecter ou retirer les liens listés avant de recommencer, ou préférer l’archivage. Aucune suppression en cascade n’est effectuée. La suppression ne requiert pas de colonne Archive.

L’aperçu examine les références Grist natives (y compris celles des tables non mappées) et les liens configurés dans le mapping, dont les codes texte. Les colonnes texte non mappées ne peuvent pas être interprétées automatiquement comme des liens. Les droits Grist sont appliqués ; si la vérification des références échoue, la suppression n’est pas proposée. Les liens sont vérifiés à nouveau juste avant la demande de suppression. Les références calculées peuvent également bloquer une suppression.

Les listes actives du widget excluent les archivés, sauf lorsqu’ils servent de contexte à des dépendants actifs. Pour les tables Grist natives, appliquer votre propre filtre Archive=false. Enregistrer le mapping transmet également cette colonne à la timeline. La navigation vers un élément supprimé dans l’historique affiche un détail vide ; aucune donnée métier n’est conservée dans cet historique.

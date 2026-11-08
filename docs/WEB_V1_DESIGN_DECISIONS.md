# Summarizer Web V1 — décisions visuelles

Status: DIRECTION SELECTED, IMPLEMENTATION AWAITING VISUAL QA

## Décision validée le 21 septembre 2026

L'utilisateur a choisi la direction 3, **Fluid Knowledge**, avec les modifications explicites suivantes :

- interface entièrement claire, inspirée des interfaces Apple ;
- fond blanc froid ou très légèrement grisé ;
- cartes visibles grâce à des blancs différents, une bordure froide, du blur et une ombre légère ;
- effet « liquid glass » discret, jamais décoratif au détriment de la lecture ;
- accent unique bleu Apple ;
- action `Garder` en bleu plein avec texte blanc ;
- action `Écarter` en blanc/translucide avec contour et texte bleus ;
- aucun bouton de décision vert ou rouge ;
- même composition centrée, même profondeur tactile et même continuité gestuelle que l'option 3 ;
- aucun changement des comportements Frozen : boutons visibles, flèches clavier, swipe, Undo, note, autosave et finalisation restent inchangés.

Cette décision remplace l'hypothèse de thème sombre mentionnée initialement pour la Phase 15. Le Web V1 est clair uniquement tant qu'une nouvelle décision utilisateur ne demande pas de thème sombre.

## Référence visuelle autoritaire

La cible mise à jour est [web-v1-review-fluid-light-reference.png](design/web-v1-review-fluid-light-reference.png).

Elle reprend la troisième proposition et applique les corrections de couleur demandées. Sa composition et sa hiérarchie sont la référence ; les données dynamiques et les comportements réels de l'application restent prioritaires sur le texte illustratif du mockup.

## Tokens retenus

| Rôle | Valeur de départ | Usage |
| --- | --- | --- |
| Canvas | `#f4f7fb` | fond général clair |
| Surface | blanc translucide à 72–84 % | header, cartes et panneaux |
| Texte | `#151c28` | titres et contenu principal |
| Texte secondaire | `#667085` | métadonnées et aide |
| Accent | `#007aff` | progression, focus et actions |
| Accent actif | `#0068dc` | hover/pressed |
| Bordure | bleu-gris à faible opacité | séparation des blancs |
| Avertissement | ambre | erreurs, sans concurrencer les actions bleu/blanc |

La typographie utilise d'abord la pile système Apple (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `SF Pro Text`) puis des fallbacks système libres. Aucun fichier de police propriétaire n'est embarqué.

## Principes de composant

- Le header est une surface translucide claire et compacte ; la navigation reste limitée à Home, Review et History.
- Review conserve une seule carte principale, avec profondeur de pile, miniature encadrée et deux actions séparées sous la carte.
- La progression est relative au nombre total de vidéos de la playlist, même si seules quelques vidéos sont déjà prêtes.
- Les états ne reposent jamais uniquement sur la couleur : libellés, structure et focus restent explicites.
- Le geste swipe suit le pointeur ; les boutons et le clavier restent les alternatives complètes.
- Les animations servent uniquement l'arrivée d'une carte, la progression, la manipulation directe et l'Undo.
- `prefers-reduced-motion` réduit toutes les animations sans supprimer d'information.

## Responsive retenu

- **Mac/desktop** : navigation centrée, carte Review jusqu'à 48 rem, actions côte à côte.
- **iPad** : même structure, marges et profondeur réduites ; les actions restent côte à côte.
- **iPhone** : header sur deux rangées, marges compactes, carte pleine largeur, raccourcis clavier masqués visuellement, boutons toujours visibles.
- Les safe areas iOS sont prises en compte dans le header, le contenu et les barres flottantes.

## Références futures

Des captures Apple, Linear, Arc, Things ou d'autres produits peuvent être ajoutées plus tard. Pour qu'une référence soit exploitable, indiquer idéalement :

1. la zone à reprendre (header, carte, bouton, motion, typographie, etc.) ;
2. ce qu'il faut précisément imiter ;
3. ce qu'il ne faut pas reprendre ;
4. sa priorité par rapport à la référence autoritaire ci-dessus.

Une nouvelle image complète la direction actuelle. Elle ne la remplace que si l'utilisateur le demande explicitement.

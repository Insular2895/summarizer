# Summarizer Web V1 — décisions visuelles

Status: PREMIUM REFINEMENT IMPLEMENTED, LATEST VISUAL QA AWAITING HUMAN REVIEW

## Test de carte Review unifiée — 15 novembre 2026

- La seconde direction générée est intégrée comme test desktop : miniature, résumé, **À retenir** et
  **Actions possibles** partagent une même grande surface, puis les décisions restent alignées juste
  en dessous.
- La progression actuelle `x sur y` et son pourcentage sont conservés. Les métriques décoratives de
  la proposition générée ne sont pas reprises.
- **Actions possibles** affiche les actions concrètes déjà présentes dans la section homonyme de la
  fiche, afin de connaître les suites applicables sans ouvrir le détail. Ce bloc ne sert pas à
  répéter Ouvrir, Écarter, Garder et Annuler.
- Tablette et mobile gardent la composition responsive existante. Le test est réversible côté
  desktop avec `?reviewLayout=legacy`, sans modifier la session, les décisions ni les notes.
- Cette direction reste à valider par usage réel avant de remplacer définitivement la composition
  précédente.

## Retour au fond local sans filigrane — 15 novembre 2026

- La revue utilisateur du rendu intégré a révélé un filigrane `Unicorn` répété sur toute la scène et
  un mouvement visuellement imperceptible. Le rendu publié à 0 et 10 secondes a confirmé les deux
  problèmes.
- L'embed Unicorn, son composant React et la dépendance `unicornstudio` sont retirés. Le fond actif
  revient aux deux plans CSS locaux basés sur `src/assets/summariz-pearl-ribbons.webp`, avec cycles de
  26/34 secondes, parallaxe borné et fallback statique sous `prefers-reduced-motion`.
- La scène Unicorn reste un essai historique non utilisé. Elle ne doit pas être réintégrée tant qu'un
  rendu sans filigrane, correctement licencié et visuellement validé n'est pas disponible.

## Fond Unicorn Studio natif — 15 novembre 2026

Statut : retiré après revue utilisateur ; historique uniquement.

- La condition posée le 14 novembre est satisfaite : un projet Unicorn Studio connecté a été créé,
  la scène `Summariz / Pearl Ribbons v1.0.0 LIVE` a été validée aux formats Desktop, Tablet et Mobile,
  puis publiée sous l'identifiant public `DOqliqCw4h0BKDqgFIEK`.
- La proposition 1 et `src/assets/summariz-pearl-ribbons.webp` restent la source visuelle. L'effet
  natif utilise cette image comme texture et applique dans une seule passe un morphing UV organique,
  une dérive diagonale lente et un parallaxe souris extrêmement discret. Unicorn classe la scène
  aplatie `Very Light`, avec un coût effectif estimé à 0,2.
- L'intégration utilise `unicornstudio@2.6.0`, une échelle de rendu de 0,75 et 30 fps. Le canvas est
  décoratif, fixe derrière toute l'application et ne reçoit aucun événement pointeur. La scène se met
  en pause quand le document est masqué.
- Le WebP local est conservé comme fallback immédiat et permanent en cas d'échec de chargement ou de
  WebGL. En mode `prefers-reduced-motion`, Unicorn n'est jamais monté et seul ce fallback statique est
  rendu.
- La publication avec seuils responsive personnalisés a rencontré une erreur interne Unicorn
  (`getPublishBreakpoints` absent). La scène a donc été publiée avec les seuils Unicorn par défaut ;
  son shader calcule néanmoins un cadrage `cover` à partir de la résolution réelle et l'embed occupe
  toujours le viewport complet.

## Fond ambiant nacré validé — 14 novembre 2026

- Parmi les trois directions proposées, l'utilisateur a choisi la proposition 1 : une composition
  presque blanche de grands rubans de soie nacrés, argent bleuté et lavande froide.
- L'image sélectionnée était d'abord utilisée directement comme matière visuelle, en deux plans fixes
  derrière l'application. Après retour utilisateur indiquant que le mouvement initial paraissait
  fixe, les cycles CSS étaient passés à 26 et 34 secondes avec une amplitude plus lisible et un
  parallaxe souris borné. Cette implémentation reste l'historique de la direction avant son
  remplacement par la scène Unicorn native du 15 novembre.
- Le cadrage est responsive. Sur mobile, les rubans sont agrandis et légèrement décentrés pour
  préserver la diagonale sans créer une petite texture répétée.
- `prefers-reduced-motion` figeait le plan principal et masquait l'écho secondaire.
- La décision conditionnelle de ne pas ajouter Unicorn sans projet/export connecté a été respectée,
  puis supersédée le 15 novembre après création, validation et publication d'une scène réelle.

## Système de surfaces resserré — 13 novembre 2026

- Les boutons de décision ne sont plus des capsules : leur rayon passe à 10 px.
- L'échelle commune devient 12 px pour les fenêtres, 10 px pour les cartes et actions majeures,
  8 px pour les panneaux, 6 px pour les contrôles et 5 px pour les éléments imbriqués.
- Les formes pilules restent réservées aux statuts et barres de progression qui en ont une vraie
  fonction sémantique.
- Le matériau Liquid Glass est partagé par la navigation active, la progression, les panneaux
  contextuels, les formulaires, History, les écrans de fin, les modales, les onglets et Note & IA.
- Les actions principales utilisent un verre teinté bleu, les actions dangereuses un verre teinté
  rouge et les actions secondaires un verre neutre. Aucun stroke coloré décoratif n'est ajouté.
- Le bouton de navigation `Review` actif devient la référence matérielle : point lumineux blanc
  légèrement décentré, gradient froid translucide, bord inférieur discret et halo court. Cette même
  construction lumineuse s'applique aux boutons neutres, bleus et rouges ; seule la teinte fonctionnelle
  change.
- Les cartes reprennent le même langage avec un reflet plus large et plus diffus, et une ombre plus
  profonde : carte Review, panneaux contextuels, Home, History, exports, modales, champs API,
  Note & IA et réponses assistant. La miniature YouTube reste sans filtre ni modification.
- `Clés API` utilise une grille stricte : trois cartes de même hauteur, champs de 44 px, titre puis
  description en pleine largeur, avec l'état de synchronisation intégré au champ. L'encart Google,
  les états et les notes de sécurité partagent le même matériau lumineux afin d'éviter le mélange
  de boîtes grises et de cartes glass.
- `Clés API` n'affiche plus de capsules **Configurée** ni de boutons **Retirer/Enregistrer** : chaque
  champ montre un état textuel discret et se synchronise automatiquement. Le pictogramme Gemini issu
  de la bibliothèque d'icônes remplace la baguette magique. Le texte distingue Gemini, actif
  aujourd'hui, des futurs connecteurs Web OpenAI (GPT) et Anthropic (Claude).
- Cette identité s'applique aussi à `Note & IA` : le véritable pictogramme Gemini identifie le
  contexte, l'état vide, les réponses et l'action d'envoi ; une coche cerclée représente
  l'autosauvegarde et une bulle système introduit la conversation.

## Ajustement validé le 13 novembre 2026 — carte plus éditoriale

Le retour utilisateur le plus récent remplace plusieurs choix du premier passage premium :

- la miniature reprend l'ancien grand format média. Elle remplit la colonne sur desktop et le haut
  de la carte sur mobile avec `object-fit: cover` et un centrage strict ; une coupe contrôlée est
  préférable à une petite vignette 16:9 entourée de marges ;
- toute la carte ouvre la fiche, tandis qu'un drag horizontal continue de déclencher la décision sans
  ouvrir accidentellement le détail ;
- `Garder` et `Écarter` sont des boutons Liquid Glass neutres à rayon contenu, sans contour coloré. Le swipe ne
  révèle plus de panneau coloré derrière la carte : un gradient noir vers vert ou rouge teinte
  directement la carte en mouvement selon la direction ;
- les strokes d'accent décoratifs disparaissent des panneaux Review ; les bordures structurelles
  restantes utilisent uniquement le gris du système ;
- les pictogrammes et keycaps décoratifs des raccourcis ne sont plus affichés dans les actions. Les
  raccourcis ArrowLeft, ArrowRight et Command/Ctrl+Z restent pleinement actifs.

Cet ajustement conserve Geist, la hiérarchie, le bleu de navigation/focus/IA, les panneaux mobiles,
le swipe, Undo, l'autosave et la conversation IA multi-tours.

## Ajustement d'interaction validé le 13 novembre 2026

- Entrée ouvre la fiche de la carte Review active hors contrôle interactif.
- La fiche ouverte accepte un swipe horizontal délibéré : droite pour Garder, gauche pour Écarter.
- Le geste suit le pointeur, revient sous le seuil et ferme la fiche après décision avant de passer à
  la vidéo suivante.
- Le geste peut désormais commencer partout dans la fiche, y compris sur le texte, les onglets, les
  liens, les boutons et Note & IA. Un clic simple et la saisie restent normaux ; le clic imbriqué est
  annulé seulement après verrouillage horizontal. Le scroll vertical reste prioritaire.
- Sur le texte, la sélection native lente est prioritaire. Un flick horizontal rapide reste un
  swipe. Dès que l'intention sélection, swipe ou scroll est reconnue, elle reste verrouillée jusqu'à
  la fin du geste afin d'éviter les bascules involontaires.
- Dans une fiche ouverte, Haut et Bas font défiler la zone de lecture interne. Ces touches restent
  natives dans la Note, les questions IA et les autres champs éditables.
- Les boutons Review, les flèches clavier et Undo restent des alternatives complètes.

## Ajustement liquid glass et grille validé le 13 novembre 2026

- Le panneau `Ensuite` est retiré pour éviter que la colonne contextuelle dépasse sous les actions.
- Sur desktop, `À retenir` et `Raccourcis` occupent deux rangées de même hauteur et leur colonne
  s'aligne sur la hauteur combinée de la carte et des boutons. Tablette utilise deux colonnes égales ;
  mobile conserve les deux panneaux empilés.
- `À retenir` utilise `BookmarkIcon` et `Raccourcis` `LightningBoltIcon` depuis Radix, déjà installé.
- Les boutons de décision et Undo utilisent un liquid glass neutre : gradient translucide, blur,
  reflet supérieur, bord inférieur plus dense et ombre courte, sans stroke coloré. Leur géométrie
  rectangulaire à rayon contenu et leur réponse lift/press reprennent la logique des contrôles Apple
  Liquid Glass sans produire un effet capsule ;
- Les sorties de swipe hors fiche et dans la fiche utilisent une accélération/décélération
  `ease-in-out`. Dans la fiche, les flèches clavier déclenchent la même translation avec rotation
  bornée à ±7° que le geste horizontal.
- Les miniatures ne reçoivent aucun zoom CSS supplémentaire. Le pipeline demande d'abord la source
  YouTube `maxresdefault`, retombe sur `hqdefault` si elle n'existe pas, puis conserve un centrage
  strict dans le slot média. La qualité de la source prime sur la suppression forcée de bandes.
- Le swipe teinte directement toute la carte, ou toute la fiche ouverte, avec un gradient noir vers
  vert à droite et rouge vers noir à gauche, synchronisé à la distance. Le noir occupe le bord opposé
  au mouvement et la couleur s'intensifie vers la sortie. Dans une fiche scrollable, le gradient reste
  fixé à toute la fenêtre visible, même après avoir descendu le résumé. Les anciennes sous-couches
  colorées derrière la carte sont supprimées.
- La source de la carte affiche directement le pictogramme YouTube rouge au format SVG issu de Simple
  Icons, sans bulle, fond, bordure ni ombre, à la place de l'abréviation `YT`. Le libellé textuel
  `YouTube · synthèse` reste affiché à côté.

## Révision validée le 13 novembre 2026

La direction **Fluid Knowledge** reste la base, mais le brief premium Summariz remplace explicitement
les choix de couleur et de typographie de septembre :

- Geist Sans devient la police d'interface auto-hébergée ; Geist Mono est réservé aux raccourcis et
  aux données techniques ;
- `Garder` utilisait initialement un vert expressif et `Écarter` un rouge contrôlé ; ce choix
  historique est remplacé par les contrôles Liquid Glass et le calque directionnel ci-dessus ;
- le bleu reste l'accent de navigation, de focus, de progression et d'IA ;
- la miniature authentique avait été cadrée en 16:9 ; ce choix est remplacé par le grand média centré
  et recadré ci-dessus ;
- les panneaux contextuels étaient initialement tous conservés sur mobile ; le dernier ajustement
  limite désormais la colonne à `À retenir` et `Raccourcis` sur tous les formats ;
- Note & IA devient une conversation Gemini multi-tours persistante, sans modifier le résumé canonique.

Cette révision remplace les règles « accent unique bleu », « aucun bouton vert ou rouge » et
« pile système Apple en premier ». Elle ne modifie aucun contrat Frozen : swipe, boutons, clavier,
Undo, autosave, exports et confidentialité restent inchangés.

## Décision validée le 21 septembre 2026

L'utilisateur a choisi la direction 3, **Fluid Knowledge**, avec les modifications explicites suivantes :

- interface entièrement claire, inspirée des interfaces Apple ;
- fond blanc froid ou très légèrement grisé ;
- cartes visibles grâce à des blancs différents, une bordure froide, du blur et une ombre légère ;
- effet « liquid glass » discret, jamais décoratif au détriment de la lecture ;
- accent bleu Apple pour la navigation et le focus (remplacé pour les décisions par la révision du
  13 novembre 2026) ;
- actions de décision initialement bleu/blanc (historique, remplacé par la sémantique vert/rouge) ;
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
| Accent | `#0969da` | navigation, progression, focus et IA |
| Accent actif | `#0068dc` | hover/pressed |
| Garder | Liquid Glass neutre ; teinte `#18854c` sur la carte | décision positive en mouvement |
| Écarter | Liquid Glass neutre ; teinte `#b94350` sur la carte | décision négative en mouvement |
| Bordure | bleu-gris à faible opacité | séparation des blancs |
| Avertissement | ambre | erreurs, sans concurrencer les actions bleu/blanc |

La typographie utilise Geist Sans Variable et Geist Mono Variable, auto-hébergées via Fontsource,
puis la pile système Apple en fallback. Aucune police propriétaire ni requête distante n'est embarquée.

## Principes de composant

- Le header est une surface translucide claire et compacte ; la navigation reste limitée à Home, Review et History.
- Review conserve une seule carte principale, avec profondeur de pile, miniature encadrée et deux actions séparées sous la carte.
- La progression est relative au nombre total de vidéos de la playlist, même si seules quelques vidéos sont déjà prêtes.
- Les états ne reposent jamais uniquement sur la couleur : libellés, mouvement de la carte,
  progression et annonce accessible restent explicites.
- Le geste swipe suit le pointeur ; les boutons et le clavier restent les alternatives complètes.
- Les animations servent uniquement l'arrivée d'une carte, la progression, la manipulation directe et l'Undo.
- `prefers-reduced-motion` réduit toutes les animations sans supprimer d'information.

## Responsive retenu

- **Mac/desktop** : navigation centrée, carte Review jusqu'à 48 rem, actions côte à côte.
- **iPad** : même structure, marges et profondeur réduites ; les actions restent côte à côte.
- **iPhone** : header compact, carte pleine largeur, `À retenir` et `Raccourcis` empilés sous la
  carte et trois actions de décision toujours accessibles dans la même rangée.
- Les safe areas iOS sont prises en compte dans le header, le contenu et les barres flottantes.

## Références futures

Des captures Apple, Linear, Arc, Things ou d'autres produits peuvent être ajoutées plus tard. Pour qu'une référence soit exploitable, indiquer idéalement :

1. la zone à reprendre (header, carte, bouton, motion, typographie, etc.) ;
2. ce qu'il faut précisément imiter ;
3. ce qu'il ne faut pas reprendre ;
4. sa priorité par rapport à la référence autoritaire ci-dessus.

Une nouvelle image complète la direction actuelle. Elle ne la remplace que si l'utilisateur le demande explicitement.

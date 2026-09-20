Status: UX FROZEN FOR V1

# Summarizer Web V1 — Spécification UX/UI

La logique UX décrite dans ce document constitue la référence produit pour Summarizer Web V1.

Les décisions d’architecture et d’implémentation sont documentées séparément.

## 1. Rôle et autorité du document

Ce document définit l’expérience visible et les comportements attendus du futur produit Web. Il doit permettre à un designer, un développeur frontend, un agent Codex ou une personne chargée d’une revue UX de comprendre le produit sans interpréter le fonctionnement du pipeline actuel.

Il fixe :

- le parcours utilisateur ;
- l’architecture de l’information visible ;
- les actions disponibles et leur ordre ;
- les comportements d’interaction obligatoires ;
- les adaptations iPhone, iPad et Mac ;
- les états, erreurs et retours utilisateur ;
- les limites fonctionnelles de la V1 ;
- les principes visuels à respecter ;
- les décisions déjà figées et les détails qui restent à prototyper.

Il ne fixe pas :

- l’architecture applicative ;
- le backend, la base de données ou les workers ;
- l’hébergement, le déploiement ou l’infrastructure ;
- les bibliothèques frontend ou motion ;
- les modèles, fournisseurs ou mécanismes internes de résumé ;
- la réécriture du pipeline Python ;
- les valeurs visuelles exactes qui doivent être comparées en prototype.

En cas de conflit sur le comportement visible de Summarizer Web V1, ce document prévaut sur les exemples historiques de l’interface en ligne de commande. Les documents techniques restent autoritatifs pour leur propre domaine.

## 2. Vision produit

Summarizer ne sert pas seulement à produire un résumé. Il transforme une source longue en connaissance exploitable, puis aide l’utilisateur à décider si cette connaissance mérite d’être conservée.

Le parcours fondamental est :

Source → traitement → compréhension → note → décision → fin.

Dans les mots de l’utilisateur :

> Je donne une source. Summarizer travaille. Je comprends ce qu’elle raconte. Je note ce qui m’intéresse. Je garde ou j’écarte. J’ai terminé.

Cette boucle est le centre du produit. Toute fonctionnalité visible doit la raccourcir, l’éclaircir ou la rendre plus fiable.

### 2.1 Promesse d’usage

L’utilisateur doit pouvoir :

1. coller une URL sans préparer la source ;
2. comprendre immédiatement que le traitement a commencé ;
3. commencer sa revue dès qu’une première vidéo est prête ;
4. lire un résumé et, si nécessaire, le transcript ;
5. ajouter un passage précis à une note unique ;
6. écrire sa propre réflexion dans cette note ;
7. garder ou écarter la vidéo ;
8. terminer la session sans rangement supplémentaire.

### 2.2 Complexité invisible

Les notions suivantes peuvent exister en interne, mais ne doivent pas structurer l’expérience principale :

- pipeline ;
- yt-dlp ;
- fournisseurs ou modèles d’IA ;
- workers et jobs ;
- caches ;
- manifests ;
- fichiers intermédiaires ;
- formats ou mécanismes d’extraction.

L’interface présente des états compréhensibles par l’utilisateur, pas l’état brut du système.

## 3. Périmètre V1

### 3.1 Sources prises en charge

Summarizer Web V1 accepte uniquement :

- une vidéo YouTube ;
- une playlist YouTube.

Le produit détecte automatiquement le type de l’URL. L’utilisateur ne choisit ni « Vidéo » ni « Playlist ».

### 3.2 Modèle conceptuel durable

Même si YouTube est l’unique type de source de la V1, l’expérience doit préserver cette logique générique :

Source → Contenu → Résumé → Note → Décision.

La terminologie principale ne doit donc pas enfermer tout le produit dans un vocabulaire technique propre à YouTube.

### 3.3 Hors périmètre

Ne font pas partie de la V1 :

- l’import PDF dans l’interface Web ;
- une bibliothèque complète de connaissances ;
- les collections, dossiers, tags et favoris ;
- un graphe de connaissances ;
- les workspaces ou projets ;
- le choix d’un modèle ou d’une méthode de résumé ;
- l’administration du traitement ;
- une configuration avancée avant lancement.

## 4. Principes directeurs

### 4.1 Réduire les décisions

Lorsque deux solutions fonctionnent, choisir celle qui demande le moins de décisions à l’utilisateur. Une capacité technique n’est pas une raison suffisante pour ajouter un contrôle visible.

### 4.2 Faire progresser sans tutoriel

L’action suivante doit être évidente grâce à la hiérarchie de la page, à la microcopy et à la continuité du parcours. Un tutoriel long ne doit pas être nécessaire.

### 4.3 Une source, une unité compréhensible

Pour la V1 :

- une vidéo correspond à une fiche ;
- une fiche contient un résumé, une note et un transcript ;
- une vidéo correspond à une seule note enrichie ;
- une playlist correspond à une session de traitement et de revue de plusieurs fiches.

### 4.4 Le contenu avant le chrome

Le résumé, la note personnelle et le transcript sont plus importants que les barres, cadres, menus, badges et décorations. L’interface doit donner une impression de lecture calme, pas de dashboard administratif.

### 4.5 Réversibilité plutôt que confirmation

Les actions fréquentes Garder et Écarter ne déclenchent pas une confirmation préalable. Elles sont suivies d’une possibilité claire d’Annuler pendant un temps court.

### 4.6 La session doit avoir une fin

Une playlist n’ouvre pas un travail de classement sans fin. Une fois la revue terminée, l’utilisateur voit un récapitulatif, appuie sur Terminer, puis quitte Review.

## 5. Architecture de l’information

### 5.1 Navigation principale

La navigation V1 contient au maximum :

- Home ;
- Review ;
- History.

Settings est une destination secondaire. Elle ne doit pas rivaliser visuellement avec les trois destinations principales.

### 5.2 Rôle des destinations

| Destination | Rôle | Ce qu’elle ne devient pas |
| --- | --- | --- |
| Home | Coller une nouvelle source et retrouver quelques éléments récents | Un dashboard de métriques ou un formulaire de configuration |
| Review | Comprendre, noter, garder ou écarter les vidéos prêtes | Une bibliothèque ou une file technique de jobs |
| History | Retrouver la trace légère des sessions terminées | Un second Brain Vault ou un outil de gestion documentaire |

### 5.3 Éléments interdits sans décision ultérieure

Ne pas ajouter à la navigation V1 : Library, Collections, Knowledge Graph, Tags, Folders, Favorites, Archive, Workspace ou Projects.

## 6. Parcours de référence

Le parcours nominal d’une vidéo est :

1. L’utilisateur colle une URL sur Home.
2. Summarizer détecte une vidéo.
3. Un retour immédiat confirme la prise en charge.
4. La vidéo passe par des états lisibles de traitement.
5. Lorsqu’elle est prête, elle apparaît dans Review.
6. L’utilisateur lit le résumé.
7. Il ouvre la fiche s’il veut approfondir.
8. Il sélectionne éventuellement un extrait du transcript et l’ajoute à la note.
9. Il ajoute éventuellement son propre texte.
10. Il revient dans Review et choisit Garder ou Écarter.
11. Il peut Annuler la décision pendant un court délai.

Le parcours nominal d’une playlist reprend cette boucle vidéo par vidéo, tandis que les vidéos restantes continuent d’être traitées.

## 7. Spécifications par écran

### 7.1 Home

#### Objectif

Commencer une session en une seule action dominante : coller une URL YouTube.

#### Contenu requis

- le nom Summarizer ;
- une proposition de valeur courte et factuelle ;
- un champ ou une zone de collage d’URL clairement prioritaire ;
- un retour immédiat après collage ;
- une section Récents légère si des sessions existent ;
- l’accès à la navigation principale.

Exemple de hiérarchie rédactionnelle :

> Summarizer
>
> Transformez une source en connaissance exploitable
>
> Coller une URL YouTube…

#### Comportements obligatoires

- Le collage déclenche la détection automatique de la source.
- Une URL de vidéo et une URL de playlist suivent le même point d’entrée.
- L’utilisateur reçoit immédiatement un accusé de prise en charge.
- Si l’URL n’est pas exploitable, le message indique quoi corriger ou quoi réessayer.

#### Interdits

- deux boutons « Vidéo » et « Playlist » ;
- un écran « Que voulez-vous faire ? » ;
- le choix du modèle, du fournisseur, de la langue technique ou du mode de traitement ;
- un dashboard complexe avant de pouvoir coller une URL ;
- plusieurs appels à l’action de poids égal.

### 7.2 Playlist en traitement

#### Objectif

Rendre l’attente compréhensible et permettre de commencer la revue avant la fin complète du traitement.

#### Contenu requis

- le titre de la playlist quand il est disponible ;
- le nombre total de vidéos quand il est connu ;
- un décompte global, par exemple « 4 sur 18 prêtes » ;
- une liste sobre des vidéos et de leur état lisible ;
- une entrée visible vers Review dès qu’au moins une vidéo est prête.

#### États visibles possibles

- En attente ;
- En cours ;
- Prête ;
- À réessayer.

Les libellés finaux peuvent être ajustés pendant le travail de microcopy, mais ils doivent rester orientés utilisateur. Les noms de processus, logs, étapes internes et fournisseurs ne sont jamais affichés comme états principaux.

#### Comportements obligatoires

- Les vidéos sont traitées une par une.
- L’échec d’une vidéo ne bloque pas toute la playlist.
- Une vidéo prête devient consultable sans attendre les suivantes.
- L’avancement global reste compréhensible pendant la revue.
- Le système évite l’impression d’un écran gelé.

#### Interdits

- un unique spinner sans contexte pendant toute la playlist ;
- une console ou du stdout ;
- des codes d’erreur bruts ;
- le nom du modèle utilisé ;
- bloquer Review jusqu’à la dernière vidéo.

### 7.3 Review

#### Objectif

Permettre une décision rapide et informée : Garder ou Écarter.

#### Carte de revue

Chaque carte de revue montre uniquement ce qui aide à décider :

- miniature ;
- titre ;
- durée ;
- mini-résumé ;
- indication discrète qu’une note existe ;
- état utile si le contenu n’est pas encore totalement prêt ;
- actions Garder et Écarter toujours visibles.

La carte peut ouvrir la fiche détaillée. Elle n’a pas à contenir le transcript complet ni des métadonnées secondaires.

#### Comportements obligatoires

- Une seule vidéo occupe le centre de la décision.
- La vidéo suivante apparaît après Garder ou Écarter.
- La progression dans la session reste visible sans dominer le contenu.
- La revue peut continuer pendant que les autres vidéos sont traitées.
- Un retour depuis la fiche ramène au même point de Review.

#### Interdits

- demander des tags, un dossier ou une catégorie avant la décision ;
- multiplier les décisions « peut-être », « favori », « archiver », « plus tard » ;
- transformer la carte en tableau de métadonnées ;
- faire du swipe la seule manière de décider.

### 7.4 Fiche vidéo

#### Objectif

Offrir un mode de lecture approfondi, sans pression de décision et sans rupture de contexte.

#### Contenu requis

1. titre et métadonnées essentielles de la source ;
2. Résumé ;
3. Note ;
4. Transcript horodaté.

La fiche est une unité éditoriale. Le contenu doit respirer, avec une largeur de lecture bornée sur desktop.

#### Comportements obligatoires

- La Note reste associée à cette seule vidéo.
- Les extraits ajoutés depuis le transcript apparaissent dans la Note.
- Le retour à Review conserve l’état de lecture et de décision.
- Aucun geste latéral dans la fiche ne déclenche Garder ou Écarter.

#### Interdits

- plusieurs types de notes séparés ;
- micro-cartes, highlights, annotations et extraits comme objets concurrents ;
- swipe décisionnel ;
- actions de traitement internes ;
- largeur de texte illimitée sur grand écran.

### 7.5 Note

#### Objectif

Réunir dans un même espace la réflexion personnelle de l’utilisateur et les preuves contextuelles qui l’ont déclenchée.

#### Contenu possible

- texte libre ;
- extraits sélectionnés dans le transcript ;
- timestamp de chaque extrait ;
- ordre lisible entre extraits et commentaires personnels.

Il n’existe qu’une Note par vidéo. « Extrait », « annotation » ou « highlight » décrit un contenu de la Note, pas une nouvelle entité que l’utilisateur doit gérer.

#### Autosave

- La sauvegarde est automatique.
- Aucun bouton Enregistrer n’est nécessaire.
- Un état discret peut signaler « Enregistrement… », « Enregistré » ou un problème de synchronisation.
- L’état de sauvegarde ne doit pas clignoter ni attirer l’attention à chaque frappe.
- Un changement d’écran ou une fermeture ne doit pas donner l’impression que le texte risque de disparaître.
- En cas de problème, le texte saisi reste visible et l’utilisateur peut réessayer.

### 7.6 Transcript

#### Objectif

Permettre de vérifier, approfondir et prélever un passage sans transformer la fiche en éditeur complexe.

#### Présentation

- Le transcript est découpé en blocs lisibles.
- Chaque bloc possède un timestamp discret.
- Les blocs doivent avoir une longueur compatible avec la lecture et la sélection.
- La typographie du transcript est secondaire par rapport au Résumé et à la Note, mais reste confortable.

#### Action unique sur une sélection

Lorsqu’un passage est sélectionné, l’action contextuelle spécifique à Summarizer est :

> Ajouter à la note

Cette action ajoute le texte et son timestamp à la Note. Elle ne déplace pas immédiatement l’utilisateur dans un autre système de classement.

### 7.7 Fin de playlist

#### Objectif

Fermer clairement la boucle de travail.

#### Contenu requis

Exemple :

> Playlist terminée
>
> 18 analysées
>
> 6 conservées
>
> 12 écartées

Une seule action principale est proposée :

> Terminer

#### Comportement

- Terminer retire la session de Review.
- Une trace légère de la session apparaît dans History.
- Aucun rangement supplémentaire n’est imposé.
- Les éventuelles vidéos en erreur restent identifiables sans invalider les résultats terminés.

### 7.8 History

#### Objectif

Fournir une trace légère des sessions passées et un moyen simple de retrouver leur résultat.

#### Contenu attendu

Une ligne ou unité d’historique peut présenter :

- la source ou le titre de session ;
- la date ;
- le type de source ;
- le nombre de vidéos analysées, conservées et écartées ;
- un accès à ce qui reste consultable.

History n’est pas un système de classement. Il ne requiert ni taxonomie, ni collections, ni arborescence.

## 8. Interactions détaillées

### 8.1 Collage et détection

Le collage est l’action dominante de Home. La détection vidéo ou playlist est automatique. Le retour doit être immédiat, même si l’analyse détaillée de la source prend plus de temps.

Cas à couvrir :

- URL valide de vidéo ;
- URL valide de playlist ;
- URL YouTube ambiguë mais exploitable ;
- URL non prise en charge ;
- URL inaccessible ou supprimée ;
- problème temporaire de connexion.

Le message décrit le résultat utilisateur, pas la cause interne supposée.

### 8.2 Review progressive

Review progressive signifie qu’une session devient utile dès le premier résultat prêt.

Exemple : une playlist contient 18 vidéos. La première est prête alors que les 17 autres sont en attente ou en cours. L’utilisateur peut ouvrir Review, lire la première fiche, noter et décider. Le traitement des autres vidéos continue indépendamment de cette interaction.

Une vidéo non prête ne doit jamais ressembler à une fiche prête mais vide. Son état est explicite.

### 8.3 Sélection du transcript sur Mac

La sélection de texte conserve le comportement natif du navigateur :

- cliquer-glisser pour sélectionner ;
- copier avec les commandes habituelles ;
- ajuster la sélection ;
- utiliser les fonctions d’accessibilité du système.

Après une sélection valide, un contrôle contextuel compact propose uniquement « Ajouter à la note ». Il doit rester proche de la sélection sans masquer le passage ni perturber la copie native.

La sélection ne doit pas :

- ouvrir un menu multifonction ;
- remplacer le menu natif de manière agressive ;
- déclencher l’ajout sans action explicite ;
- perdre la sélection avant la confirmation de l’ajout.

### 8.4 Sélection du transcript sur iPhone et iPad

La priorité est de préserver la sélection native iOS autant que possible. Les poignées, le copier-coller, le zoom de texte et les fonctions d’accessibilité doivent rester utilisables.

Une solution par blocs ou appui long peut être prototypée si la sélection native seule ne rend pas « Ajouter à la note » suffisamment fiable. Elle doit néanmoins :

- garder une action unique ;
- éviter le conflit avec le scroll vertical ;
- ne pas intercepter tous les appuis longs ;
- permettre de copier le texte normalement ;
- rester compréhensible sans tutoriel gestuel.

À éviter sur mobile : un menu flottant riche, de petites cibles, un glisser précis obligatoire, une sélection propriétaire qui casse les conventions iOS ou un geste caché sans alternative visible.

### 8.5 Ajout d’un extrait à la Note

L’ajout est optimiste : après « Ajouter à la note », l’extrait apparaît immédiatement dans la Note avec son timestamp. Un retour subtil confirme l’action.

Si la sauvegarde distante échoue, l’extrait et le texte local ne disparaissent pas. L’état signale le problème et propose Réessayer. Cette exigence décrit le résultat UX attendu, pas le mécanisme de persistance.

### 8.6 Timestamps

Chaque extrait ajouté conserve le timestamp de son passage d’origine. Le timestamp est visuellement discret mais identifiable.

L’interaction idéale permet de revenir au contexte correspondant dans la source ou dans le transcript. Le comportement exact de lecture vidéo et de navigation temporelle reste à préciser pendant la conception détaillée ; la conservation du timestamp, elle, est obligatoire.

### 8.7 Garder et Écarter sur mobile

Dans Review :

- swipe vers la gauche = Écarter ;
- swipe vers la droite = Garder.

La carte suit le doigt. Le retour visuel augmente progressivement avec l’intention du geste. Avant le seuil, relâcher ramène la carte à sa position initiale. Après le seuil, la décision est appliquée et la carte suivante prend sa place.

La dynamique recherchée comprend :

- manipulation directe ;
- mouvement interrompable ;
- seuil clair ;
- prise en compte raisonnable de la distance et de la vélocité ;
- retour naturel lorsque le geste est annulé ;
- continuité spatiale vers la carte suivante.

Les valeurs exactes de seuil, vélocité et ressort restent ouvertes jusqu’aux prototypes.

### 8.8 Indications du swipe

Le geste peut être suggéré de manière sobre par la position, une micro-indication ou un retour pendant le déplacement. L’interface ne doit pas ressembler à un clone de Tinder : pas de codes ludiques envahissants, tampons géants, rotation spectaculaire ou surenchère de couleurs.

Les boutons Garder et Écarter restent toujours visibles. Le geste accélère une action comprise ; il ne la révèle pas.

### 8.9 Review sur desktop

Sur Mac ou desktop :

- flèche gauche = Écarter ;
- flèche droite = Garder ;
- les boutons visibles accomplissent les mêmes actions ;
- l’ouverture de la fiche ne modifie pas la décision ;
- les raccourcis sont désactivés quand le focus se trouve dans un champ de texte ou quand ils pourraient détruire une sélection.

Les raccourcis doivent être découvrables, par exemple à travers un libellé secondaire ou une indication discrète, sans devenir un tutoriel permanent.

### 8.10 Boutons de décision

Garder et Écarter sont des actions sémantiques explicites. Leur compréhension ne dépend pas uniquement d’une couleur ou d’une icône. Les cibles tactiles sont généreuses et restent accessibles au clavier.

Le poids visuel doit éviter deux erreurs : présenter Écarter comme une action dangereuse nécessitant une modalité lourde, ou rendre Garder tellement dominant que la revue soit biaisée.

### 8.11 Aucun swipe décisionnel dans la fiche

La fiche est un espace de lecture verticale et de sélection. Un swipe latéral peut entrer en conflit avec la navigation système, la sélection de texte ou le scroll. Garder et Écarter sont donc déclenchés dans Review, jamais par swipe dans la fiche.

### 8.12 Undo

Après Garder ou Écarter, « Annuler » reste disponible quelques secondes. L’Undo indique clairement quelle décision sera restaurée. Il ne bloque pas l’accès à la vidéo suivante.

L’Undo est préférable à une confirmation préalable, car la décision est fréquente et réversible. Une décision ne doit pas devenir irréversible avant la fin raisonnable de cette fenêtre.

## 9. États, erreurs et feedback

### 9.1 Principes de message

Un message utile répond, si possible, à trois questions :

1. Que s’est-il passé ?
2. Qu’est-ce qui est préservé ?
3. Que peut faire l’utilisateur maintenant ?

Exemples de ton :

- « Cette URL ne semble pas être une vidéo ou une playlist YouTube. »
- « Cette vidéo n’a pas pu être analysée. Les autres continuent. »
- « Votre note est conservée sur cet appareil. Réessayer la synchronisation. »

Éviter les codes internes, stack traces, noms de fournisseurs, accusations envers l’utilisateur et messages génériques sans action.

### 9.2 Erreur sur une vidéo de playlist

Une erreur locale ne fait pas échouer toute la session.

- La vidéo concernée reçoit un état explicite.
- Les autres vidéos continuent.
- Réessayer est proposé quand l’action est pertinente.
- Le bilan final distingue les vidéos analysées des vidéos non terminées si nécessaire.
- Une vidéo en erreur ne produit pas une fiche vide présentée comme valide.

### 9.3 États vides

Les états vides sont sobres et orientés vers l’action suivante :

- Home sans récent : inviter à coller une première URL ;
- Review vide : expliquer qu’aucune vidéo n’est prête ou qu’aucune session n’est active ;
- History vide : indiquer que les sessions terminées apparaîtront ici ;
- Note vide : offrir un espace d’écriture sans tutoriel envahissant.

### 9.4 Chargement

Un chargement long doit montrer une progression ou un changement d’état intelligible. Pour une playlist, le décompte par vidéo remplace le spinner unique. Les éléments déjà utiles deviennent interactifs sans attendre la fin globale.

### 9.5 Optimistic UX

L’optimisme est approprié pour :

- ajouter un extrait à la Note ;
- afficher la frappe dans la Note ;
- avancer après une décision réversible.

Il ne doit jamais masquer durablement une erreur. En cas d’échec, le contenu saisi reste disponible et l’action corrective est claire.

## 10. Responsive et modes d’entrée

### 10.1 Principes communs

- Le même modèle mental existe sur iPhone, iPad et Mac.
- Les comportements s’adaptent à la taille et au mode d’entrée sans créer trois produits différents.
- Le contenu garde une largeur de lecture confortable.
- Les gestes disposent d’alternatives visibles.
- Le clavier logiciel, les safe areas et les variations de hauteur du viewport sont traités comme des contraintes de premier ordre.

### 10.2 iPhone

- Une colonne principale.
- Navigation adaptée au pouce, forme exacte encore ouverte.
- Fiche en plein écran ou sheet adaptée à la lecture.
- Cibles tactiles généreuses.
- Boutons de décision toujours accessibles.
- La Note reste utilisable quand le clavier est ouvert.
- Les contrôles ne sont pas masqués par les safe areas.
- Le scroll du transcript et le swipe de Review ne se disputent pas le même contexte.

### 10.3 iPad

L’iPad ne doit pas être traité comme un grand iPhone. Il peut exploiter une présentation à deux zones, par exemple Review et aperçu, ou contenu et Note. Cette organisation reste ouverte et doit être comparée dans les prototypes.

Exigences fixes :

- prise en charge du tactile, du clavier et du pointeur ;
- lecture confortable en portrait et paysage ;
- absence de grandes zones vides sans intention ;
- continuité de la sélection de texte ;
- accès évident à Review et au retour depuis une fiche.

### 10.4 Mac et desktop

- Largeur de lecture bornée.
- Utilisation efficace du clavier et de la souris.
- Raccourcis gauche/droite dans Review.
- Sélection native du transcript.
- États de focus visibles.
- Une éventuelle sidebar, ainsi que sa largeur, restent à prototyper.

### 10.5 Clavier mobile

Lorsque la Note prend le focus :

- le curseur et le texte en cours restent visibles ;
- l’interface ne saute pas de manière imprévisible ;
- les actions nécessaires ne sont pas coincées sous le clavier ;
- fermer le clavier ne provoque pas de perte de saisie ;
- le retour depuis la Note ne déclenche pas une décision involontaire.

## 11. Direction visuelle

### 11.1 Impression recherchée

Summarizer doit paraître :

- calme ;
- précis ;
- rapide ;
- léger ;
- premium sans ostentation ;
- natif dans ses interactions ;
- centré sur le contenu.

Il ne doit pas paraître :

- ludique au point de distraire ;
- rempli d’effets « IA » ;
- administratif ;
- dense comme un dashboard ;
- composé d’une grille de cartes génériques ;
- décoratif au détriment de la lecture.

### 11.2 Typographie

La typographie porte la hiérarchie avant les cadres et les couleurs. Elle doit distinguer clairement :

1. le contenu principal ;
2. le Résumé ;
3. la Note personnelle ;
4. le Transcript ;
5. les actions principales ;
6. les métadonnées ;
7. le chrome de navigation.

La police exacte reste ouverte. Le choix devra privilégier la lisibilité sur texte long, les caractères accentués, les chiffres de timestamps, les petits écrans et les deux thèmes.

### 11.3 Hiérarchie et densité

L’écran ne doit pas demander où regarder. Une seule action principale domine chaque étape. Les métadonnées se retirent visuellement quand elles ne servent pas la décision immédiate.

### 11.4 Usage des cards

Une card est justifiée quand elle matérialise une unité manipulable, notamment la vidéo courante dans Review. Elle n’est pas la structure par défaut de chaque paragraphe, métrique ou section de la fiche.

Éviter :

- une card imbriquée dans une card ;
- un cadre autour de chaque bloc de texte ;
- des ombres multiples pour fabriquer artificiellement une hiérarchie ;
- des tuiles de dashboard pour le Résumé, la Note et le Transcript quand une mise en page éditoriale suffit.

### 11.5 Couleurs

La base est neutre. La couleur d’accent est rare et sémantique : focus, action, progression ou état. Garder et Écarter ne reposent jamais uniquement sur le vert et le rouge.

La palette exacte reste ouverte. Elle devra conserver un contraste suffisant dans les thèmes clair et sombre.

### 11.6 Light et Dark

Les deux thèmes font partie de la V1. Le thème sombre n’est pas une inversion automatique : surfaces, séparateurs, texte secondaire, sélection de transcript et états de décision doivent être vérifiés séparément.

Le fonctionnement ne dépend jamais du thème. La préférence système peut guider l’état initial ; le comportement final de sélection du thème reste un détail secondaire.

### 11.7 Verre et transparence

Les effets de verre ou de transparence sont limités aux couches qui en tirent un bénéfice spatial : navigation flottante, contrôle contextuel ou sheet. Ils ne doivent pas réduire la lisibilité du contenu ni recouvrir de longues zones de texte.

## 12. Motion et manipulation directe

### 12.1 Rôle de la motion

La motion sert uniquement :

- le feedback ;
- le changement d’état ;
- la continuité spatiale ;
- la compréhension d’une manipulation directe ;
- la relation entre Review et la fiche.

Elle ne sert pas à décorer une action déjà claire.

### 12.2 Rythme

Les interactions fréquentes doivent paraître instantanées. Les transitions plus longues ne sont acceptables que lorsqu’elles expliquent un changement de contexte. Les durées exactes restent ouvertes jusqu’aux prototypes.

### 12.3 Propriétés et performance perçue

Le mouvement doit rester fluide pendant le swipe, le scroll et l’ouverture d’une fiche. Le feedback suit directement le geste. Une animation interrompue doit pouvoir repartir depuis son état actuel sans saut perceptible.

Ces exigences décrivent la qualité perçue ; elles ne prescrivent ni bibliothèque ni méthode d’implémentation.

### 12.4 Reduced motion

Lorsque l’utilisateur demande une réduction des animations :

- les grands déplacements et effets de ressort sont réduits ou remplacés ;
- les changements d’état restent compréhensibles ;
- aucun contenu ni aucune action ne disparaît ;
- le swipe conserve une alternative par boutons ;
- le feedback privilégie l’opacité, l’état ou un déplacement minimal.

## 13. Accessibilité

L’accessibilité est une contrainte produit, pas une finition.

Exigences :

- focus clavier visible ;
- ordre de navigation logique ;
- libellés textuels pour les actions importantes ;
- zones tactiles suffisamment grandes ;
- contraste vérifié dans les deux thèmes ;
- aucun état transmis par la couleur seule ;
- aucun comportement essentiel disponible uniquement au survol ;
- alternatives visibles aux gestes ;
- sélection et copie natives préservées ;
- zoom et taille de texte compatibles ;
- annonces compréhensibles des changements d’état ;
- raccourcis clavier neutralisés pendant la saisie ;
- reduced motion respecté.

Le swipe ne doit jamais être obligatoire. « Ajouter à la note » doit être utilisable autrement qu’avec une précision de pointeur parfaite.

## 14. Microcopy et terminologie

### 14.1 Vocabulaire principal

Employer de manière cohérente :

- Source ;
- Résumé ;
- Note ;
- Transcript ;
- Review ;
- History ;
- Garder ;
- Écarter ;
- Terminer ;
- Ajouter à la note ;
- Annuler ;
- Réessayer.

### 14.2 Règles rédactionnelles

- Employer des verbes directs.
- Décrire le résultat, pas le mécanisme.
- Préférer une phrase courte à un bloc d’explication.
- Garder les termes stables entre mobile et desktop.
- Éviter le jargon technique et les noms de fournisseurs.
- Ne pas personnifier l’IA ou surjouer la magie.
- Ne pas utiliser une terminologie différente pour le même objet selon l’écran.

### 14.3 Termes à ne pas exposer dans le parcours principal

Job, worker, cache, manifest, pipeline, modèle, provider, extraction, stdout et tout identifiant interne.

## 15. Risques UX et garde-fous

### 15.1 Autosave

Risques : course entre sauvegardes, connexion instable, fermeture de Safari, changement d’écran rapide et état « enregistré » affiché trop tôt.

Garde-fous UX :

- ne jamais effacer visuellement le texte saisi après une erreur ;
- distinguer discrètement l’enregistrement en cours, la réussite et l’échec ;
- offrir Réessayer ;
- vérifier les scénarios de fermeture et reprise ;
- éviter les notifications répétitives à chaque frappe.

### 15.2 Swipe

Risques : décision accidentelle, conflit avec le scroll, geste trop sensible, seuil imprévisible et absence de voie accessible.

Garde-fous UX :

- zones d’interaction séparées ;
- retour visuel progressif ;
- seuil à valider en prototype ;
- boutons visibles ;
- Undo ;
- aucun swipe décisionnel dans la fiche.

### 15.3 Sélection mobile

Risques : conflit avec l’appui long, menus iOS, scroll, handles de sélection et interface flottante masquant le passage.

Garde-fous UX :

- comportement natif prioritaire ;
- action unique ;
- test sur appareils réels ;
- aucune dépendance exclusive au hover ;
- alternative si la sélection native ne suffit pas.

### 15.4 Surcharge fonctionnelle

Risque : transformer progressivement Summarizer en gestionnaire de connaissances.

Garde-fous UX :

- conserver les trois destinations principales ;
- refuser les taxonomies et rangements avant décision explicite ;
- appliquer le test de simplicité à chaque ajout ;
- laisser la mémoire permanente au Brain Vault.

## 16. Anti-patterns

Sont incompatibles avec cette spécification :

- demander le type de source avant le collage ;
- afficher les choix de modèle ou de pipeline ;
- attendre la fin de toute une playlist avant Review ;
- utiliser un spinner unique pour un traitement long ;
- faire échouer toute la playlist pour une vidéo ;
- proposer plusieurs types de notes concurrents ;
- imposer un bouton Enregistrer ;
- rendre le swipe obligatoire ;
- décider par swipe dans la fiche ;
- demander confirmation avant chaque Garder ou Écarter ;
- ouvrir un menu multifonction sur la sélection du transcript ;
- créer un dashboard de métriques ;
- ajouter des tags, dossiers ou projets en V1 ;
- utiliser les cards comme unique langage de mise en page ;
- imiter Tinder ;
- remplacer les conventions du système sans gain démontré ;
- privilégier une animation spectaculaire à la continuité de lecture ;
- présenter History comme une bibliothèque permanente.

## 17. Pistes techniques UX non contraignantes

Cette section fournit des points de contrôle pour une future étude technique. Elle ne constitue aucune décision d’implémentation.

- Étudier les capacités natives de sélection de texte avant de fabriquer une sélection propriétaire.
- Vérifier la coexistence entre le menu de sélection du système, la copie et « Ajouter à la note ».
- Tester les hauteurs dynamiques de viewport, safe areas et claviers logiciels sur Safari iPhone et iPad.
- Privilégier, pour la manipulation directe, des propriétés qui conservent une animation fluide et interrompable.
- Prévoir des états séparés pour contenu prêt, contenu en cours et contenu à réessayer.
- Valider l’Undo face à toute suppression ou décision irréversible.
- Choisir une bibliothèque UI ou motion seulement après définition des besoins réels et vérification de son accessibilité, de sa maintenance et de son poids.
- Tester les raccourcis clavier face aux champs de texte, à la sélection et aux technologies d’assistance.

## 18. Relation avec le Brain Vault

Summarizer prend en charge :

- la capture d’une source ;
- son traitement ;
- sa compréhension ;
- l’annotation légère ;
- la décision de conserver ou d’écarter.

Le Brain Vault prend en charge la mémoire permanente et l’organisation durable de la connaissance.

Summarizer ne doit donc pas reconstruire une seconde base de connaissance. La destination technique exacte des contenus gardés et les mécanismes d’export sont hors de cette spécification UX et seront documentés séparément.

## 19. Extension future au PDF

Le PDF n’est pas une source disponible dans Summarizer Web V1. L’extension future doit néanmoins pouvoir reprendre le même modèle :

Source → Contenu → Résumé → Note → Décision.

Équivalences prévisibles :

- une source PDF = une fiche = une note ;
- la page remplace le timestamp comme repère contextuel ;
- la sélection d’un passage mène à « Ajouter à la note » ;
- Garder ou Écarter conserve la même signification.

Ces équivalences ne constituent pas une spécification complète du PDF.

## 20. Prototypes obligatoires avant le design final

Trois directions doivent être prototypées avec les mêmes données, les mêmes comportements et les mêmes états. Leur différence porte sur la hiérarchie, la densité, la composition et le langage visuel, pas sur les capacités produit.

### 20.1 Variante A — Quiet Knowledge

Direction éditoriale et contemplative : beaucoup d’air, lecture centrale, chrome discret, Note intégrée naturellement au contenu. La priorité est le calme et la compréhension.

Risque à surveiller : devenir trop contemplative ou cacher les actions fréquentes.

### 20.2 Variante B — Productivity Workspace

Direction plus dense et opérationnelle : navigation et progression très explicites, raccourcis mieux exposés, utilisation efficace de l’espace desktop. La priorité est la vitesse de revue.

Risque à surveiller : glisser vers le dashboard et surcharger l’écran.

### 20.3 Variante C — Fluid Knowledge

Direction plus spatiale et tactile : continuité forte entre carte, fiche, sélection et Note ; manipulation directe particulièrement soignée. La priorité est la sensation de fluidité.

Risque à surveiller : ajouter de la motion ou des gestes au détriment de la lisibilité et de l’accessibilité.

### 20.4 Écrans à produire pour chaque variante

Chaque prototype doit montrer en taille réelle :

1. Home ;
2. playlist en traitement ;
3. Review ;
4. fiche vidéo ;
5. Note avec Transcript ;
6. fin de playlist ;
7. History.

Les prototypes doivent inclure au minimum un format iPhone, un format iPad et un format desktop sur les écrans où le layout change réellement. Les états de focus, clavier, sélection, swipe, Undo, erreur et reduced motion doivent être évalués, pas seulement l’écran idéal statique.

### 20.5 Décision humaine

La direction A, B ou C ne doit pas être choisie automatiquement. Les prototypes sont comparés, les compromis explicités, puis le choix final est validé par l’utilisateur avant l’implémentation visuelle.

## 21. Références de design

Les références servent à évaluer la qualité et les principes, jamais à copier une identité visuelle.

- [Linear](https://linear.app/) : efficacité, réduction du bruit et rythme des workflows.
- [Geist Design System](https://vercel.com/geist/introduction) et [typographie Geist](https://vercel.com/geist/typography) : discipline de hiérarchie, cohérence et lisibilité des systèmes Web.
- [Apple Human Interface Guidelines — Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) : familiarité des gestes et alternatives visibles.
- [Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion) : continuité, feedback et respect des préférences utilisateur.
- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) : accessibilité intégrée à la conception.
- [Emil Kowalski — Skills for Designers and Engineers](https://github.com/emilkowalski/skills) : méthode de prototypage, design engineering, animation utile, expérience mobile native, revue et amélioration.

Les méthodes à mobiliser lors des étapes futures comprennent notamment : prototype, emil-design-eng, apple-design, animate, mobile-native, pick-ui-library, review-animations, improve-animations et find-animation-opportunities. Elles sont des outils de conception et de revue, pas une bibliothèque visuelle imposée.

## 22. Alignement avec la documentation existante

### 22.1 PDF présent dans le produit local, absent du Web V1

Le README documente aujourd’hui un outil local capable de traiter YouTube et les PDF. La présente spécification limite uniquement l’interface Web V1 à YouTube. Elle ne retire pas la capacité PDF du pipeline local et ne demande aucune modification de celui-ci.

Conclusion UX : différence de périmètre entre surfaces, pas contradiction bloquante. La communication future devra distinguer clairement « produit local actuel » et « interface Web V1 ».

### 22.2 Commandes et réglages techniques visibles dans la CLI

Le README et les documents techniques exposent légitimement les commandes, fournisseurs, variables et étapes nécessaires au fonctionnement local. La Web V1 doit les masquer dans le parcours principal.

Conclusion UX : différence d’audience et de surface, pas contradiction. La documentation technique reste disponible sans devenir la navigation produit.

### 22.3 Traitement séquentiel et Review progressive

La documentation du pipeline décrit un traitement playlist vidéo par vidéo et une isolation des échecs, ce qui s’aligne avec la présente UX. Elle ne documente pas encore l’exposition progressive des premières vidéos prêtes dans une interface Web.

Conclusion UX : aucun conflit de principe, mais une capacité visible à prendre en compte lors d’une future étape d’architecture et d’implémentation.

### 22.4 Suppression et Undo

La documentation de sécurité encadre la suppression du Markdown de la vidéo courante. La présente UX impose une fenêtre d’Undo après Écarter.

Conclusion UX : la décision d’écarter ne devra pas devenir irréversible avant l’expiration de l’Undo. Le mécanisme correspondant appartient à l’étape d’architecture ; aucune modification n’est décidée ici.

### 22.5 Terminologie

Les documents existants sont majoritairement orientés pipeline et CLI, tandis que cette spécification emploie Source, Résumé, Note, Transcript, Review et History.

Conclusion UX : la terminologie utilisateur doit rester stable dans le Web. Les termes techniques peuvent continuer d’exister dans la documentation développeur.

## FROZEN UX DECISIONS

Les décisions suivantes sont figées pour Summarizer Web V1 :

- V1 limitée aux sources YouTube : vidéo et playlist ;
- détection automatique vidéo ou playlist après collage de l’URL ;
- navigation principale limitée à Home, Review et History ;
- Settings secondaire ;
- aucun dashboard complexe ;
- aucune Library, Collection, Knowledge Graph, Tag, Folder, Favorite, Archive, Workspace ou Project en V1 ;
- traitement des playlists vidéo par vidéo ;
- l’échec d’une vidéo ne bloque pas les autres ;
- Review progressive dès qu’une première vidéo est prête ;
- une vidéo = une fiche ;
- une vidéo = une Note unique ;
- une fiche contient Résumé, Note et Transcript ;
- la Note réunit texte libre, extraits et timestamps ;
- sélection du transcript suivie de l’action unique « Ajouter à la note » ;
- sélection et copie natives préservées autant que possible ;
- timestamp conservé avec chaque extrait ;
- autosave sans bouton Enregistrer ;
- conservation locale visible du contenu en cas d’échec de sauvegarde ;
- swipe gauche = Écarter dans Review mobile ;
- swipe droite = Garder dans Review mobile ;
- manipulation directe de la carte avec seuil et retour naturel ;
- boutons Garder et Écarter toujours visibles ;
- flèche gauche = Écarter et flèche droite = Garder sur desktop ;
- Undo après Garder ou Écarter ;
- aucune confirmation préalable pour une décision fréquente et réversible ;
- aucun swipe décisionnel dans la fiche ;
- écran « Playlist terminée » avec bilan et CTA principal Terminer ;
- Terminer retire la session de Review ;
- History reste un journal léger ;
- Summarizer n’est pas une base de connaissance permanente ;
- le Brain Vault reste le lieu de mémoire durable ;
- direction calme, simple, premium, précise, légère et centrée sur le contenu ;
- contenu et typographie prioritaires sur le chrome ;
- usage limité des cards, du verre et de la transparence ;
- interface responsive pour iPhone, iPad et Mac ;
- thèmes clair et sombre ;
- accessibilité intégrée ;
- alternatives visibles aux gestes ;
- reduced motion pris en charge ;
- erreurs formulées pour l’utilisateur, sans détails internes ;
- aucun long chargement réduit à un spinner unique ;
- prototypes A, B et C obligatoires avant le choix visuel final ;
- décision humaine explicite avant l’implémentation de la direction visuelle finale.

## OPEN VISUAL / UX IMPLEMENTATION DETAILS

Les éléments suivants restent volontairement ouverts jusqu’aux prototypes et aux validations associées :

- police exacte ;
- palette exacte ;
- valeurs précises de spacing ;
- radii exacts ;
- style exact des boutons ;
- taille exacte de la navigation ;
- présence ou non d’une sidebar desktop ;
- bottom navigation mobile ou autre forme de navigation ;
- layout exact de l’iPad ;
- Note fixe ou non à droite sur desktop ;
- composants UI exacts ;
- bibliothèque motion exacte ;
- seuil exact du swipe ;
- pondération exacte entre distance et vélocité ;
- valeurs de spring ;
- durées et courbes exactes ;
- micro-animations exactes ;
- présentation exacte du statut d’autosave ;
- comportement exact du timestamp interactif ;
- forme exacte du contrôle « Ajouter à la note » sur iOS ;
- durée exacte de disponibilité de l’Undo ;
- design final A, B ou C.

Ces points ne doivent pas être inventés ou figés avant comparaison des prototypes. Une décision ouverte ne remet pas en question les comportements obligatoires décrits plus haut.

## Scénario de référence

Lucas ouvre Summarizer sur iPad.

Il colle une playlist YouTube. Summarizer reconnaît automatiquement la playlist et commence le traitement. La playlist contient 18 vidéos. L’écran indique l’avancement vidéo par vidéo sans afficher le pipeline interne.

La première vidéo devient prête. Lucas ouvre Review sans attendre les 17 autres. Il lit le mini-résumé de la première carte et ouvre la fiche parce que le sujet l’intéresse.

Dans la fiche, il lit le Résumé puis descend dans le Transcript. Il sélectionne un passage à 12:41 et choisit « Ajouter à la note ». L’extrait et le timestamp apparaissent immédiatement dans la Note. Il écrit dessous : « À tester plus tard. » La Note est sauvegardée automatiquement ; l’état reste discret.

Lucas revient dans Review. Il swipe la carte vers la droite : la vidéo est gardée. La suivante apparaît. Il la swipe vers la gauche : elle est écartée. « Annuler » reste disponible pendant quelques secondes. Pendant ce temps, les autres vidéos continuent d’être traitées.

Il arrive à la dernière vidéo. Summarizer affiche :

> Playlist terminée
>
> 18 analysées
>
> 6 conservées
>
> 12 écartées

Lucas appuie sur « Terminer ». La playlist quitte Review. History conserve une ligne légère correspondant à la session. Le workflow est terminé.

## Test de simplicité

Pour chaque future décision UX, demander si la fonctionnalité aide directement à :

1. comprendre la source ;
2. prendre une note ;
3. décider de la garder.

Si la réponse est non aux trois questions, elle ne devrait probablement pas être visible dans la V1.

L’utilisateur doit pouvoir résumer Summarizer ainsi :

> Je colle une vidéo. Je vois ce qu’elle raconte. Si quelque chose m’intéresse, je l’ajoute à ma note. J’écris éventuellement ce que j’en pense. Je garde ou j’écarte. Je passe à la suivante.

Si l’interface devient plus difficile à expliquer que cela, elle est devenue trop complexe.

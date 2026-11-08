# Web V1 — Spécification UI/UX

> Statut : contrat fonctionnel reconstruit le 2026-11-01 à partir du brief Web V1 validé.
> Direction visuelle C **Fluid Knowledge** choisie explicitement par l'utilisateur le 2026-11-06.
> Les anciennes maquettes restent introuvables ; la nouvelle référence approuvée est conservée dans
> [`docs/assets/web-v1-fluid-knowledge-review-mobile.png`](assets/web-v1-fluid-knowledge-review-mobile.png).
> Ce choix visuel ne modifie pas les comportements ci-dessous.

## 1. Rôle du document

Ce document fixe l'expérience Web V1 de Summarizer. Il complète
[l'architecture Web V1](WEB_V1_ARCHITECTURE.md) et le
[plan d'implémentation](WEB_V1_IMPLEMENTATION_PLAN.md).

Il fait autorité pour les comportements produit. **Fluid Knowledge** est la cible visuelle ; sa
fidélité responsive, ses états et sa motion restent à valider sur un prototype interactif.

## 2. Principes figés

- V1 accepte uniquement une URL YouTube : vidéo ou playlist.
- La détection vidéo/playlist est automatique.
- Une vidéo correspond à une carte de Review, une fiche détaillée et une Note unique.
- Une vidéo prête devient consultable sans attendre la fin de la playlist.
- La fiche réunit le résumé, la Note et le transcript.
- Une sélection du transcript peut être ajoutée à la Note avec son timestamp.
- La Note est autosauvegardée.
- Garder et Écarter sont des décisions réversibles ; Écarter ne supprime rien immédiatement.
- Le geste de décision existe dans Review, jamais dans la fiche détaillée.
- Les actions critiques restent visibles : le swipe et les raccourcis clavier sont des accélérateurs,
  pas les seuls moyens d'agir.
- L'interface doit rester calme, lisible et utilisable sur iPhone, iPad et Mac.

## 3. Navigation

La navigation principale contient exactement trois destinations :

1. **Home** : soumettre une source et suivre son démarrage ;
2. **Review** : examiner progressivement les vidéos prêtes et décider ;
3. **History** : retrouver la session active et un historique léger des traitements terminés.

La fiche vidéo est un détail de Review, pas une quatrième destination principale.

## 4. Home

### Entrée principale

- Un champ reçoit une URL YouTube.
- Une seule action principale lance le traitement.
- L'application détecte si l'URL désigne une vidéo ou une playlist.
- Une URL invalide produit un message utilisateur simple, sans détail technique ni trace serveur.
- Aucun upload PDF n'apparaît en V1.

### Après soumission

- La source créée et son état courant sont visibles.
- La progression est issue d'un contrat structuré, jamais de logs ou de `stdout` parsés.
- Dès qu'une première vidéo passe à `READY`, l'utilisateur peut ouvrir Review.
- Une erreur sur une vidéo de playlist ne transforme pas automatiquement toute la source en échec.

## 5. Review

### File progressive

- Review présente les vidéos `READY` qui n'ont pas encore de décision définitive pour la session.
- L'ordre de playlist est préservé.
- Chaque vidéo est représentée par une carte unique.
- Une carte conserve le lien vers sa source et sa playlist éventuelle.
- Les états de chargement, d'échec isolé et de fin de file sont explicites.

La composition de référence de la carte est donnée par la maquette **Fluid Knowledge** approuvée.
Les champs exacts, les limites de contenu et les états responsive doivent encore être validés pendant
la phase de prototype. Aucun champ décoratif supplémentaire ne doit être considéré comme figé.

### Décisions

Les deux actions visibles sont :

- **Garder** ;
- **Écarter**.

Accélérateurs :

- mobile : swipe droite pour Garder, swipe gauche pour Écarter ;
- desktop : flèches clavier selon le mapping rendu visible par l'interface ;
- tous supports : boutons visibles et accessibles.

Après une décision :

- la carte suivante devient active ;
- une action **Undo** permet d'annuler la dernière décision ;
- les données de la vidéo, sa Note et ses artefacts ne sont pas supprimés.

### Interdiction dans la fiche

La fiche détaillée ne déclenche jamais Garder ou Écarter par swipe. Le geste horizontal dans cette
vue ne doit pas pouvoir provoquer une décision accidentelle.

## 6. Fiche vidéo

La fiche donne accès aux trois contenus de la même vidéo :

- résumé ;
- Note ;
- transcript.

Sur desktop et tablette, le résumé ou transcript occupe la colonne de lecture et la Note reste
visible dans un panneau latéral persistant afin de faciliter le copier-coller. Sur mobile, ce même
panneau devient une bottom sheet **Note & IA**. Ces trois contenus restent clairement reliés à une
seule vidéo.

### Résumé

- Afficher le résultat produit par le pipeline Python.
- Conserver la provenance : titre, URL, chaîne si disponible, playlist si disponible et date.
- Ne pas afficher de détail diagnostic ou de secret provider.

### Note

- Une seule Note existe par vidéo.
- Elle accepte du texte libre et des extraits du transcript.
- Un extrait ajouté conserve son texte et son timestamp.
- L'état de sauvegarde doit être compréhensible : en cours, enregistré ou à resynchroniser.
- Une ancienne réponse réseau ne peut jamais écraser une version plus récente.
- La Note est incluse avec la vidéo dans les exports ZIP Markdown, PDF et Maxi Brain.

### Transcript vers Note

Parcours obligatoire :

1. sélectionner un passage ;
2. choisir **Ajouter à la note** ;
3. insérer le texte et son timestamp dans la Note unique ;
4. autosauvegarder la nouvelle version.

Desktop utilise la sélection native. Mobile doit suivre l'interaction validée par les prototypes,
sans introduire un système de highlights ou de cartes parallèle.

### Approfondissement contextuel par IA

- Une sélection du résumé — puis du transcript quand celui-ci est disponible — devient le contexte
  prioritaire d'une question d'approfondissement.
- Sans sélection, l'action utilise le résumé courant comme contexte et le signale clairement.
- L'appel Gemini est déclenché explicitement par l'utilisateur et passe uniquement par le serveur ;
  aucune clé ou requête provider directe ne part du bundle frontend.
- La réponse IA est visuellement séparée de la source, porte le modèle utilisé et rappelle qu'elle
  doit être vérifiée.
- Une réponse n'entre dans la Note qu'après l'action explicite **Ajouter à la Note**. Elle ne modifie
  jamais le résumé canonique.
- Le fallback ChatGPT copie le prompt borné dans le presse-papiers puis ouvre `chatgpt.com`. Il ne
  prétend pas préremplir automatiquement une conversation sans contrat officiel documenté.
- L'interface ne propose pas de sélecteur de provider ou de modèle en V1.

### Clés API et quotas

- Le réglage porte le nom générique **Clés API** afin d'accueillir d'autres fournisseurs sans
  renommer l'architecture de navigation.
- Google Gemini est le fournisseur actif en V1. L'interface précise que Google fournit des clés
  gratuites sous quotas et relie le guide officiel de création.
- Deux emplacements distincts existent : **Résumés vidéo** et **Approfondissements**. Une même clé
  peut alimenter les deux ; deux clés d'un même projet Google ne sont pas présentées comme doublant
  le quota.
- Au premier usage Gemini sans clé, une fenêtre Clés API s'ouvre avant tout envoi de contenu.
- Une installation propriétaire déjà configurée dans le Trousseau macOS ne revoit pas cet onboarding.
- Quand le backend signale un quota épuisé, un popup explique que les nouveaux résumés et les
  approfondissements liés au même projet peuvent être bloqués, puis propose **Ouvrir Clés API**.
- Une clé saisie n'est jamais relue, affichée en clair, conservée dans `localStorage` ou renvoyée par
  une réponse API.
- Le prototype local conserve les clés dans le Trousseau macOS. Une clé Gemini legacy trouvée dans
  `.env` déclenche une proposition de migration ; la ligne en clair n'est supprimée qu'après écriture
  et vérification dans le Trousseau.
- Chaque emplacement configuré propose **Retirer**. L'interface ne journalise jamais la valeur et ne
  connaît que son état `configured`.
- La production multi-utilisateur exige un coffre chiffré par utilisateur et une autorisation stricte ;
  le Trousseau local ne constitue pas le stockage SaaS.

## 7. Autosave

L'autosave est une fonction de fiabilité, pas seulement un debounce visuel.

- Une Note possède une version serveur monotone.
- Une mise à jour envoie la version connue et reçoit la nouvelle version.
- Un conflit conserve le brouillon local et propose une resynchronisation ; il ne l'efface pas.
- Les requêtes sont ordonnées ou annulées côté client afin qu'une réponse ancienne soit ignorée.
- Une sauvegarde est tentée avant un changement de route lorsque le navigateur le permet.
- Le brouillon local peut couvrir une perte réseau, une fermeture Safari ou une reprise ultérieure.
- La reconnexion resynchronise explicitement l'état local et l'état serveur.

Les mécanismes navigateur de dernier recours ne remplacent pas le contrôle de version serveur.

## 8. Fin de source et finalisation

Quand toutes les vidéos traitables ont reçu une décision, Review affiche un état simple
**Playlist terminée** — ou l'équivalent pour une vidéo unique — avec l'action **Terminer**.

Le parcours visible respecte cet ordre :

1. sélection confirmée ;
2. export des vidéos gardées ;
3. confirmation d'export ;
4. cleanup ciblé ;
5. retrait de la session active ;
6. création de l'entrée History.

Un échec d'export laisse les contenus gardés récupérables et propose une reprise.

### Destinations d'export

- Le format universel par défaut est un ZIP Markdown contenant un `README.md`, un manifeste et un
  fichier par vidéo gardée.
- Un PDF propre est proposé comme alternative de lecture et de partage.
- Les connecteurs privés sont conditionnels à l'environnement. L'installation locale du propriétaire
  peut proposer **Envoyer vers Maxi Brain** ; cette destination n'apparaît jamais aux autres
  utilisateurs et n'est pas codée en dur dans le produit public.
- Une destination réussie produit un reçu durable avant la création de l'entrée History.
- Si aucune vidéo n'est gardée, l'utilisateur peut terminer sans créer de fichier.

## 9. History

History n'est pas une bibliothèque de connaissances. La session courante peut y apparaître dans une
section **En cours** afin d'être consultée ou reprise. Une entrée terminée indique au minimum :

- la source traitée ;
- la date ;
- le nombre de vidéos ;
- le nombre gardé ;
- le statut final ;
- le statut d'export.

Une ligne ouvre un bilan en lecture seule : comptes, décisions et reçu d'export. Une entrée terminée
peut être retirée de History après confirmation ; cette action ne supprime jamais les exports,
résumés, transcripts, sources ou éléments de la bibliothèque canonique. Une session active ne peut
pas être retirée depuis History.

Aucune seconde interface de lecture/annotation complète ne doit être construite dans History V1.

## 10. États et retours utilisateur

- Les états produit communs sont `QUEUED`, `PROCESSING`, `READY`, `DONE` et `FAILED`.
- Les messages utilisateur sont courts et actionnables.
- Les détails diagnostics restent côté serveur/worker, avec un identifiant de corrélation.
- Un retry ne doit pas dupliquer silencieusement une source, un résumé ou une décision.
- Une vidéo sans transcript reste visible comme échec isolé avec possibilité de reprise si le backend
  le permet.

## 11. Responsive et accès

- Respecter les safe areas iOS et les changements de viewport liés au clavier.
- Ne pas masquer la Note ou son état de sauvegarde derrière le clavier mobile.
- Sur desktop et tablette, conserver la Note visible pendant le scroll de la colonne de lecture.
- Conserver une cible tactile suffisante pour les boutons de décision et Undo.
- Toutes les actions au swipe ou au clavier possèdent une alternative visible.
- Le focus clavier, le contraste, les libellés accessibles et `prefers-reduced-motion` font partie des
  critères d'acceptation.
- Tester le scroll, la sélection de transcript, l'orientation, le retour navigateur et `pageshow`.

## 12. Direction visuelle validée

Trois directions statiques ont été comparées avec les mêmes données et comportements :

- A. **Quiet Knowledge** ;
- B. **Productivity Workspace** ;
- C. **Fluid Knowledge**.

Le choix humain du 2026-11-06 retient **C. Fluid Knowledge** comme cible officielle. La référence
mobile est [`web-v1-fluid-knowledge-review-mobile.png`](assets/web-v1-fluid-knowledge-review-mobile.png).
A et B restent des explorations non retenues et ne doivent pas être implémentées en parallèle.

Cette validation porte sur la direction visuelle : carte physique en pile, révélation sémantique de
la destination, chrome léger et actions visibles. Elle ne valide pas encore les seuils de geste, les
springs, le comportement réseau, les états erreur/chargement, ni les déclinaisons iPad et Mac.

Prototypes locaux :

- mobile natif simulé : `prototypes/fluid-knowledge/` ;
- Web/PC responsive : `prototypes/fluid-knowledge-web/`.

La version Web/PC conserve le même contrat produit. Elle utilise un rail de navigation et un panneau
contextuel sur grand écran, un rail compact sur tablette, puis une navigation basse en vue mobile.

## 13. Hors périmètre V1

- PDF, OCR, Marker et MinerU dans le Web ;
- bibliothèque de connaissances complète ;
- highlights, annotations ou cartes multiples par vidéo ;
- appel LLM direct depuis le navigateur ;
- choix de provider ou de modèle dans l'interface publique ;
- polish de motion avant fiabilité fonctionnelle.

## 14. Critères d'acceptation UX

Le happy path doit permettre :

```text
Home → URL playlist → progression → première vidéo READY → Review → fiche
→ sélection résumé/transcript → question Gemini → Ajouter la réponse à la Note
→ texte personnel → autosave
→ retour Review → Garder → vidéo suivante → Écarter → Undo
→ Playlist terminée → Terminer → export confirmé → cleanup → History
```

Ce parcours doit rester utilisable avec boutons seuls, clavier desktop et interactions tactiles
mobiles, sans exposer de secret ni perdre une Note lors d'une coupure réseau raisonnable.

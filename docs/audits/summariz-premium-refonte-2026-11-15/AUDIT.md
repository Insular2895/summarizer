# Audit UI/UX premium — Summariz

Date : 15 novembre 2026

Surface : Web app responsive locale
Parcours capturé : Review → fiche vidéo, History, Home, Clés API, Review mobile → fiche mobile.

## Verdict

La structure produit est cohérente et les fonctions essentielles sont déjà visibles. La principale
faiblesse n'est pas fonctionnelle : trop de surfaces utilisent simultanément gradient, reflet,
bordure et ombre. Cette accumulation affaiblit la hiérarchie et donne une apparence plus « UI générée »
que produit Apple calme. La prochaine passe doit simplifier les matériaux, clarifier les compteurs et
réorganiser la fiche sans modifier les flux métier.

## Étapes capturées

1. **Review desktop — santé moyenne**
   Preuve : [01-review-desktop.png](01-review-desktop.png)
   La vidéo, les décisions et les points clés sont immédiatement accessibles. En revanche, les
   compteurs `342/363`, `75/363` et `21 %` se répètent sans distinguer assez clairement vidéos prêtes,
   examinées et gardées. La carte, les actions et les deux panneaux emploient le même niveau de verre.

2. **Fiche vidéo desktop — santé moyenne**
   Preuve : [02-video-detail-desktop.png](02-video-detail-desktop.png)
   La lecture et Note & IA coexistent bien. Le chemin `output/videos/...md` occupe toutefois une place
   forte dans la zone éditoriale. Le panneau latéral est dense, sa partie conversation est peu
   identifiable et ses actions inférieures sont partiellement hors du premier viewport.

3. **History desktop — bonne base, densité faible**
   Preuve : [03-history-desktop.png](03-history-desktop.png)
   La session active et les exports sont correctement séparés. L'état vide prend beaucoup de hauteur
   et l'entrée active pourrait mieux nommer ses métriques plutôt que compter sur les en-têtes éloignés.

4. **Home desktop — bonne base, surface surdimensionnée**
   Preuve : [04-home-desktop.png](04-home-desktop.png)
   L'action principale est claire. Le conteneur, le champ et le message de succès cumulent plusieurs
   matériaux alors que l'écran ne contient qu'une seule tâche.

5. **Clés API desktop — fonctionnel mais répétitif**
   Preuve : [05-api-keys-desktop.png](05-api-keys-desktop.png)
   Les valeurs restent masquées et les états de synchronisation sont présents. Les trois champs
   répètent une aide identique, la hiérarchie Configuré/Vérifié/Erreur n'est pas encore complète et
   le bas du dialogue nécessite un scroll peu apparent.

6. **Review mobile — santé moyenne**
   Preuve : [06-review-mobile.png](06-review-mobile.png)
   La miniature et les décisions restent accessibles. La métadonnée est tronquée, le compteur colle
   visuellement au pourcentage (`75 sur 36321%`) et le titre occupe une grande part de la carte.

7. **Fiche vidéo mobile — risque d'encombrement**
   Preuve : [07-video-detail-mobile.png](07-video-detail-mobile.png)
   La lecture reste possible, mais le chemin technique prend deux lignes, le bouton flottant Note & IA
   recouvre le texte et le panneau de travail n'est pas visible sans action supplémentaire.

## Changements prioritaires

- **P1 — Compteurs et états** : séparer explicitement `prêtes`, `examinées` et `gardées`, puis supprimer
  les répétitions entre header et sidebar.
- **P1 — Fiche vidéo** : retirer le chemin technique de la lecture principale et structurer Note & IA
  en deux espaces stables, sans action flottante qui recouvre le contenu.
- **P1 — Responsive Review** : corriger la collision compteur/pourcentage et préserver une métadonnée
  utile à 320–375 px.
- **P2 — Matériaux** : réserver le verre à la navigation et aux contrôles ; utiliser des surfaces
  majoritairement opaques pour la lecture, les formulaires et les cartes principales.
- **P2 — Actions** : conserver Écarter/Garder/Annuler, avec Garder légèrement accentué et Annuler
  clairement tertiaire sans réduire les cibles tactiles.
- **P2 — Clés API** : factoriser l'aide, renforcer les états réels et conserver les secrets côté
  serveur sans nouvelle action fictive.
- **P2 — Icônes** : conserver Radix déjà installé pour les contrôles système et les véritables icônes
  de marque pour YouTube/Gemini ; ne pas ajouter Lucide uniquement pour changer de famille.

## Plan d'exécution proposé

1. Harmoniser tokens, surfaces, ombres, radius, typographie et états interactifs.
2. Recomposer Review sans toucher au moteur de décision ou au swipe.
3. Recomposer la fiche et Note & IA en préservant sélection, autosave et conversation multi-tours.
4. Harmoniser Home, History et Clés API avec les mêmes primitives.
5. Vérifier 320, 375, 768, 1024 et 1440 px, clavier, mouvement réduit, tests et build.

## Limites de l'audit

- Les captures prouvent la hiérarchie visuelle et les états visibles, pas la conformité WCAG complète.
- Les raccourcis, annonces lecteur d'écran, erreurs réseau, quotas et performances longues devront être
  vérifiés pendant l'implémentation avec les tests existants et des contrôles dédiés.
- Les captures utilisent le mode mouvement réduit pour stabiliser les preuves ; elles ne permettent
  pas de juger la qualité temporelle du fond et du swipe.

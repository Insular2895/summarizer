# Golden set PDF evidence

Ce dossier versionne uniquement le manifeste et les attentes de test. Les PDF, captures et
crops provenant des livres restent locaux, hors Git.

Chaque cas doit recevoir :

- un chemin local ou un identifiant de source froide ;
- la page PDF et, si connue, la page imprimée ;
- une annotation humaine de référence ;
- les erreurs qui doivent obligatoirement déclencher une alerte ;
- un statut `to_review`, `annotated` ou `validated`.

La métrique principale est le nombre d'erreurs quantitatives dangereuses acceptées sans
alerte. Elle est calculée dès qu'un sidecar correspond au SHA-256 d'une annotation humaine.

Deux résultats restent volontairement séparés :

- `dangerous_quantitative_errors_accepted_without_alert` doit rester à zéro ;
- `trusted_coverage` mesure la part des assertions effectivement confirmées par un statut
  de confiance. Une valeur bloquée n'est pas une erreur silencieuse, mais elle ne compte pas
  comme une extraction validée.

Le premier corpus annoté couvre les Greeks signés, un calcul de gamma scalping, un payoff
diagram et un graphique IV/RV de Passarelli. Les difficultés encore marquées `to_review`
doivent être ajoutées progressivement sans commiter les pages ou les crops des livres.

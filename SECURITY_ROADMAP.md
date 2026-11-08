# Roadmap de sécurité Transcript

> Statut : `draft_to_validate` — aucune correction n'a été appliquée.
> Principe : corriger les expositions et établir les frontières avant d'ajouter des scanners.

## P0 — Immédiat, avant toute nouvelle publication

### P0.1 Invalider l'ancien cookie public

- Révoquer les sessions YouTube concernées et régénérer le cookie local si cet usage reste requis.
- Ne pas tester le cookie historique contre YouTube.
- Conserver une preuve de rotation sans conserver la valeur.

**Acceptation :** le propriétaire confirme la révocation ; le cookie courant n'est jamais affiché,
commité ou envoyé dans un artefact CI.

### P0.2 Retirer les données privées des références publiques

- Geler temporairement les merges/publications de branches contenant `library/`.
- Classifier la branche `bibliotheque-de-babbel` sans recopier ses contenus.
- Après validation explicite : supprimer la branche distante et réécrire tous les historiques
  publics contenant `cookies.txt`, transcripts ou métadonnées.
- Faire re-cloner ou rebaser les copies des collaborateurs après la réécriture.

**Acceptation :** une recherche par chemin et un scan Gitleaks complet ne retrouvent plus les blobs ;
les secrets potentiels ont été révoqués indépendamment de la purge Git.

### P0.3 Mettre un vrai gate secret

- Supprimer le step CI qui génère sa propre baseline et ignore l'échec.
- Ajouter Gitleaks sur historique complet et sur PR.
- Activer secret scanning et push protection GitHub si disponibles.
- Ajouter un test canari non secret pour vérifier que le scanner échoue réellement.

**Acceptation :** un faux token de test contrôlé fait échouer le job ; un résultat est redacted ;
aucune valeur complète n'apparaît dans logs, annotations ou artefacts.

## P1 — Obligatoire avant un SaaS accessible

### P1.1 Figer le threat model et les décisions d'infrastructure

- Valider mono-tenant ou multi-tenant ; white-label reste une décision séparée.
- Choisir IdP, topologie Cloudflare, DB, stockage d'artefacts et KMS.
- Définir les rôles, objets, opérations sensibles et matrice d'autorisation.
- Identifier le sixième projet attendu ou corriger la mission à cinq outils.

**Acceptation :** décision écrite, propriétaire et date ; aucune hypothèse présentée comme validée.

### P1.2 Construire le control plane fail-closed

- Session serveur sécurisée ; cookies `HttpOnly`, `Secure`, `SameSite` adaptés.
- Tenant dérivé de l'identité serveur.
- Autorisation objet sur Source, Job, Video, Note, décision, export et clé API.
- Tests négatifs systématiques : autre utilisateur, autre tenant, rôle inférieur, objet inexistant.
- Identité machine distincte et claims de jobs courts/idempotents.

**Acceptation :** aucun endpoint sensible sans test d'autorisation ; accès croisé toujours refusé.

### P1.3 Finaliser la garde des clés

- Étendre le coffre local à Anthropic/OpenAI-compatible.
- Mettre les fichiers sensibles locaux en `0600`.
- Pour le SaaS, chiffrer les clés BYOK par enveloppe KMS et ne jamais exposer de fonction reveal.
- Rotation, révocation, suppression, version et audit des métadonnées.

**Acceptation :** aucun secret dans navigateur, DB en clair, logs, erreurs, arguments, bundle ou
artefacts ; tests de non-fuite automatisés.

### P1.4 Rendre la chaîne de build reproductible

- Créer un lock Python avec hashes ; garder les deux `package-lock.json`.
- Verrouiller `yt-dlp` et `yt-dlp-ejs` à des versions compatibles ; retirer `ejs:github` du runtime
  de production.
- Épingler l'image Python par digest et exécuter en non-root.
- Générer un SBOM pour l'artefact réellement déployé.

**Acceptation :** build propre reproductible ; SBOM relié au digest ; Trivy analyse le même artefact.

### P1.5 Corriger les fuites de diagnostic

- Normaliser les erreurs OpenAI-compatible et Anthropic comme Gemini.
- Séparer message public, code stable et diagnostic interne redacted.
- Ajouter corrélation, taille maximale et politique de rétention.

**Acceptation :** tests avec réponses provider contenant de faux secrets ; aucune valeur ne sort.

### P1.6 Quotas IA et protection d'abus

- Limites par utilisateur, tenant, IP de secours, usage et modèle.
- Budget mensuel et coupure atomique ; concurrence et payload bornés.
- Idempotence pour éviter la double facturation lors des retries.
- Alertes quota et UX de dégradation.

**Acceptation :** tests de course, dépassement et retry ; aucune limite contrôlée par le navigateur.

### P1.7 Headers et stockage navigateur

- CSP, anti-framing, `nosniff`, Referrer/Permissions Policy au Worker réel.
- `localStorage` réduit à un brouillon sans token, avec TTL et effacement.
- DB autorisée comme source de vérité des notes, décisions et historique.

**Acceptation :** headers testés sur preview ; déconnexion/effacement supprime les données locales.

## P2 — Automatisation et durcissement

- Semgrep CE sur PR/main avec règles Python, JS/TS, Docker et GitHub Actions.
- Trivy dépôt sur PR, image + SBOM sur main/predeploy, scanner secret désactivé pour éviter le
  doublon avec Gitleaks.
- Vibe Security comme revue de diff obligatoire pour les chemins sensibles, mais validation humaine
  du résultat.
- Build et tests des deux prototypes dans la CI.
- Protection `main`, reviews obligatoires, CODEOWNERS sécurité, checks requis et historique linéaire
  selon préférence projet.
- Permissions GitHub minimales, Actions allow-listées et épinglées par SHA complet.
- OIDC pour le déploiement ; aucun credential cloud longue durée.
- ZAP baseline passif sur preview ; full scan uniquement sur préproduction autorisée.
- Backups chiffrés et exercice de restauration.

**Acceptation :** nouveau risque critique/haut confirmé bloque ; exceptions datées et propriétaires ;
durée PR compatible avec le rythme de développement.

## P3 — Amélioration continue

- Scan programmé avec bases CVE fraîches et triage des nouvelles vulnérabilités.
- Pentest manuel avant lancement puis après changement majeur d'identité/paiement/tenant.
- Exercices d'incident : fuite de clé, coût IA, perte worker, restauration DB.
- Revue trimestrielle des rôles, accès cloud, secrets, rétention et règles WAF.
- VEX pour justifier proprement les CVE non exploitables dans l'artefact.
- Mesures : délai de correction, taux de faux positifs, couverture des endpoints sensibles, réussite
  de restauration, dépenses IA anormales.

## Ordre de déploiement progressif

1. **Stop the bleeding** : cookies, branches publiques, secret gate.
2. **Rendre le build déterministe** : locks, EJS local, image et SBOM.
3. **Créer les frontières SaaS** : identité, tenant, autorisation objet, secrets, quotas.
4. **Ajouter les gates rapides PR** : Gitleaks, Semgrep, Trivy ciblé, tests.
5. **Créer preview/staging** : ZAP passif puis actif autorisé.
6. **Préparer l'exploitation** : logs redacted, alertes, backups/restore, réponse à incident.
7. **Revue humaine de lancement** : threat model, authz, données, coûts, fournisseurs et limites.

## Points nécessitant validation humaine

- Réécriture d'historique Git et suppression de branches publiques.
- Rotation/révocation des sessions et secrets concernés.
- Choix IdP, KMS, DB, topologie Cloudflare et conservation des données.
- Modèle multi-tenant et éventuelle offre white-label.
- Sévérité acceptée des alertes et durée maximale des exceptions.
- Autorisation écrite et cible exacte de tout ZAP actif.
- Choix du sixième projet open source absent de la mission.

# Audit de sécurité du projet Transcript

> Statut : audit manuel en lecture seule
> Date : 2026-11-08
> Aucun scanner tiers installé ou exécuté ; aucune valeur de secret ou donnée de transcript affichée.

## 1. Niveau de sécurité actuel

**Niveau global : insuffisant pour une mise en production SaaS.**

Le mode local comporte de bons contrôles récents autour des clés Gemini et des routes loopback.
Cependant, deux expositions Git publiques exigent une action immédiate, la CI laisse passer les
secrets, la chaîne Python n'est pas verrouillée et les contrôles d'identité/multi-tenant nécessaires
au SaaS n'existent pas encore.

L'audit n'a identifié aucune preuve d'une base clients, d'un paiement ou d'un backend SaaS déjà
exposé. Il ne conclut donc pas à un bypass d'authentification actif. Il conclut qu'un déploiement
public dynamique doit rester bloqué jusqu'à implémentation et test de ces contrôles.

## 2. Méthode et limites

- Lecture des README, documents, arborescence, code Python, prototypes, Workers, Docker et CI.
- Vérification en lecture seule de la visibilité GitHub, des branches, protections, rulesets,
  permissions Actions et fonctions de secret scanning.
- Vérification des documentations officielles des outils demandés.
- Aucun appel de production, aucune attaque, aucun ZAP actif, aucun test de validité des cookies.
- Aucun Semgrep, Gitleaks, Trivy ou Vibe Security exécuté localement.
- Aucun inventaire CVE fiable tant que Trivy n'a pas été exécuté sur des versions verrouillées.
- L'arbre local est sale et contient des fichiers non commités ; il ne correspond pas exactement à
  `origin/main` ni à `origin/feat/web-v1`.
- L'absence d'alerte dans cet audit manuel ne garantit jamais l'absence de vulnérabilité.

## 3. Synthèse des constats

| ID | Sévérité | Statut | Constat |
| --- | --- | --- | --- |
| SEC-001 | Critique potentielle / P0 | Exposition confirmée, validité inconnue | Ancien `cookies.txt` de 930 octets dans l'historique du dépôt public |
| SEC-002 | Haute / P0 | Confirmé | Branche publique contenant 896 transcripts et 896 métadonnées |
| SEC-003 | Haute / P0 | Confirmé | Secret scan CI régénéré puis ignoré ; secret scanning GitHub désactivé |
| SEC-004 | Haute / P1 | Blocage d'architecture, non exploitable à ce stade | Auth, tenant, rôles, DB et autorisation objet absents |
| SEC-005 | Haute / P1 | Confirmé | Dépendances Python non verrouillées et image de base mutable |
| SEC-006 | Haute / P1 | Confirmé | Téléchargement runtime de composants EJS depuis GitHub |
| SEC-007 | Moyenne / P1 | Confirmé | Erreurs/réponses brutes de certains providers persistables dans les manifests |
| SEC-008 | Moyenne / P1 | Confirmé | Notes, décisions et historique conservés durablement en `localStorage` |
| SEC-009 | Moyenne / P1 | Confirmé | Absence de quotas/budgets IA serveur réellement bloquants |
| SEC-010 | Moyenne / P1 | Confirmé | Secrets locaux en clair pour providers non Gemini ; fichiers sensibles en mode `0644` |
| SEC-011 | Moyenne / P2 | Confirmé | CI non durcie, branche principale non protégée, Actions non épinglées par SHA |
| SEC-012 | Moyenne / P2 | Confirmé | Conteneur exécuté en root et sans durcissement explicite |
| SEC-013 | Moyenne / P2 | Confirmé | Headers de sécurité HTTP non configurés dans les Workers statiques |
| SEC-014 | Moyenne conditionnelle | Suspicion si exposé en SaaS | `LLM_BASE_URL` arbitraire pourrait devenir un SSRF/egress abuse |
| SEC-015 | Faible / P2 | Confirmé | Documentation et état d'implémentation divergent |

## 4. Détails et preuves

### SEC-001 — Cookie YouTube dans l'historique public

**Preuve.** Le dépôt GitHub est public. `git log --all -- cookies.txt` montre que le fichier a été
ajouté dans le commit initial puis retiré par `e52029a`. Le blob parent mesurait 930 octets et reste
accessible dans l'historique de `origin/main` et des branches distantes. Son contenu n'a pas été
affiché. Le `cookies.txt` local actuel ne correspond pas octet pour octet à ce blob historique.

**Impact.** Si le cookie historique est encore accepté, il peut donner accès à une session YouTube.
Même invalide aujourd'hui, sa publication prouve qu'un contrôle de secret n'a pas bloqué le commit.

**Reproduction sûre.** Vérifier uniquement l'existence et la taille avec les commandes Git de
métadonnées ; ne jamais imprimer le blob dans les logs ou rapports.

**Correction proposée.** Invalider toutes les sessions/cookies associés au compte concerné, puis
réécrire l'historique public avec un outil adapté après sauvegarde et validation explicite. Prévenir
les collaborateurs du changement d'historique. Ajouter Gitleaks bloquant et la push protection.

### SEC-002 — Transcripts et métadonnées sur une branche publique

**Preuve.** `origin/bibliotheque-de-babbel` contient 896 `transcript.txt` et 896 `metadata.json`.
Le contenu n'a pas été lu. `.gitignore:30-31` dit que la bibliothèque est locale, mais
`.gitignore:63-64` réautorise précisément ces fichiers. `docs/SAFETY.md:20-28` interdit de committer
les transcripts.

**Impact.** Exposition de contenus, titres, URLs ou métadonnées potentiellement personnels ; impact
réel dépendant du contenu. Une branche distante publique est accessible même si `main` est propre.

**Correction proposée.** Geler la publication, classifier la sensibilité sans recopier les données,
supprimer la branche distante et purger les blobs de tout l'historique après validation explicite.
Retirer les règles de réinclusion et ajouter un test CI de chemins interdits.

### SEC-003 — Secret gate inefficace

**Preuve.** `.github/workflows/ci.yml:45-48` crée une baseline à partir de l'état courant puis exécute
l'audit avec `|| true`. Une fuite devient donc la nouvelle baseline et ne bloque jamais la CI.
L'API GitHub indique que secret scanning, non-provider patterns, validity checks et push protection
sont désactivés.

**Impact.** Une nouvelle clé ou un cookie peut être fusionné sans échec CI.

**Correction proposée.** Remplacer ce step par Gitleaks avec historique complet, baseline revue et
exit code bloquant. Activer les contrôles GitHub disponibles. Toute fuite confirmée impose rotation,
pas seulement suppression du fichier.

### SEC-004 — Backend SaaS et autorisations non implémentés

**Preuve.** Les seuls endpoints sont des plugins Vite locaux. Les Workers servent les assets. Les
fichiers `.openai/hosting.json` déclarent `d1: null` et `r2: null`. Aucun modèle tenant, middleware
d'authentification, session, rôle, admin, paiement ou webhook n'a été trouvé. Le futur control plane
reste une phase documentaire (`docs/WEB_V1_IMPLEMENTATION_PLAN.md:197-245`).

**Impact.** Toute exposition directe des routes locales ou toute création rapide d'API sans modèle
d'autorisation produirait des risques IDOR, escalade de privilège et fuite inter-tenant.

**Correction proposée.** Construire d'abord identité, tenant, matrice de rôles, autorisation objet,
tests négatifs et journaux. Ne jamais utiliser les checks loopback/origine comme auth publique.

### SEC-005 — Dépendances et builds non reproductibles

**Preuve.** `requirements.txt:1-11` ne fixe aucune version ; PyMuPDF n'a qu'une plage
(`requirements.txt:12`). `Dockerfile:1` utilise `python:3.11-slim` sans digest et
`Dockerfile:9-10` installe ces dépendances mutables.

**Impact.** Deux builds peuvent recevoir des versions différentes ; compromission ou régression
amont non contrôlée ; SBOM et analyse CVE imprécises.

**Correction proposée.** Introduire un lock Python avec hashes, mises à jour automatisées et tests,
puis épingler l'image de base par digest avec procédure de renouvellement.

### SEC-006 — Composant JavaScript distant au runtime

**Preuve.** `src/extractors/youtube.py:86-94` active `remote_components: ["ejs:github"]`. La
documentation officielle yt-dlp confirme que cette option télécharge automatiquement les scripts
EJS depuis GitHub ; le comportement par défaut de yt-dlp est de refuser les composants distants.

**Impact.** Code récupéré au runtime hors lockfile et hors SBOM principal ; dépendance à la sécurité
du dépôt, du réseau et du runtime JavaScript.

**Correction proposée.** Utiliser le package compagnon `yt-dlp-ejs` dont la version correspond
exactement à yt-dlp, verrouiller les deux, vérifier les artefacts et désactiver les remote components
en production. Si une exception est nécessaire, l'autoriser explicitement et tracer son digest.

### SEC-007 — Erreurs provider trop bavardes

**Preuve.** `src/llm/openai_compatible_client.py:108-130` incorpore des corps HTTP et réponses
complètes dans les exceptions. `src/llm/anthropic_client.py:93-114` incorpore l'exception ou la
réponse. `src/pipeline.py:75-76`, `140-147` et `224-231` persiste `str(exc)` dans les manifests.

**Impact.** Corps provider, contenu envoyé, identifiants internes ou détails de compte peuvent
finir dans le cache, la console ou un artefact.

**Correction proposée.** Codes d'erreur stables, message public neutre, diagnostic interne borné et
redacted, identifiant de corrélation, tests de non-fuite. Le client Gemini suit déjà en partie ce
modèle et peut servir de référence.

### SEC-008 — Données personnelles dans `localStorage`

**Preuve.** `prototypes/fluid-knowledge-web/src/App.jsx:59-80` définit les clés et les helpers ; les
notes, décisions, historique et finalisation sont persistés aux lignes 150-159 et 191-194.

**Impact.** Toute XSS ou autre utilisateur du même profil navigateur peut lire ces données. Il n'y a
ni TTL, ni effacement global, ni chiffrement applicatif.

**Correction proposée.** En production, la DB autorisée devient la source de vérité. Ne conserver
qu'un brouillon minimal avec TTL, effacement explicite et sans secret/token. Une CSP stricte reste
nécessaire ; chiffrer avec une clé stockée dans le même JavaScript ne résout pas l'XSS.

### SEC-009 — Abus et coûts IA

**Preuve.** `src/llm/rate_limiter.py:7-17` désactive la limite par défaut. Le budget mensuel est
`null` dans `config/settings.yaml:39-48`. La route Gemini locale borne le corps et le timeout mais ne
possède pas de quota utilisateur atomique.

**Impact.** Une future route publique pourrait vider un quota ou générer des coûts importants.

**Correction proposée.** Quotas par identité/tenant/finalité, compteur atomique, limites de taille,
concurrence et fréquence, idempotence, alertes budgétaires, coupure fail-closed et procédure de
dégradation produit.

### SEC-010 — Garde locale incomplète

**Preuve.** Gemini utilise le Trousseau, mais OpenAI-compatible et Anthropic chargent encore une clé
depuis `.env` (`src/llm/openai_compatible_client.py:22-33`, `src/llm/anthropic_client.py:20-26`). Les
fichiers locaux `.env` et `cookies.txt` ont été observés en mode `0644`. L'audit n'a trouvé aucune
variable de clé non vide dans `.env` au moment de la vérification ; il n'a pas affiché les valeurs.

**Impact.** Un autre compte local peut lire les cookies et tout secret futur placé dans ces fichiers
sur une machine multi-utilisateur.

**Correction proposée.** Passer les fichiers sensibles en `0600`, étendre l'abstraction de coffre à
tous les providers, conserver `.env` uniquement pour le mode headless contrôlé et documenter la
rotation.

### SEC-011 — CI et gouvernance GitHub faibles

**Preuve.** `ci.yml:20,23` utilise des tags d'Actions, aucune permission n'est définie dans le
workflow, mypy est non bloquant (`:41-43`) et les prototypes frontend ne sont pas buildés/testés.
GitHub : `main` sans protection, aucune ruleset, toutes les Actions autorisées, pin SHA non exigé.
Le token par défaut est heureusement en lecture seule.

**Impact.** Merge sans revue/gates, dérive supply chain des Actions et absence de vérification UI.

**Correction proposée.** Protection de branche, reviews, checks requis, `permissions: contents:
read`, allow-list Actions, SHA complet, CI frontend et séparation stricte entre PR non fiable et
déploiement privilégié.

### SEC-012 — Conteneur peu durci

**Preuve.** Aucun `USER` non-root dans `Dockerfile`; Compose ne déclare ni filesystem read-only, ni
capability drop, ni limites. Le conteneur est un CLI et non un serveur réseau, ce qui limite le
risque actuel.

**Correction proposée.** Utilisateur non-root, image digest-pinnée, filesystem read-only avec mounts
ciblés, `no-new-privileges`, capacités supprimées et limites CPU/mémoire quand le worker sera défini.

### SEC-013 — Headers HTTP absents du Worker

**Preuve.** Les deux `worker/index.js:1-15` retournent directement les assets, sans CSP,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ni `frame-ancestors` explicites.

**Impact.** Défense navigateur incomplète, surtout quand des données utilisateur seront affichées.

**Correction proposée.** Ajouter et tester les headers au point de réponse réel. Configurer HSTS au
niveau de l'hébergement HTTPS, CSP avec nonces/hashes si nécessaire et politique de framing.

### SEC-014 — Base URL provider arbitraire, risque conditionnel

**Preuve.** `src/llm/openai_compatible_client.py:34-46` accepte `LLM_BASE_URL`. C'est actuellement une
configuration locale de confiance, donc aucune SSRF distante n'est confirmée.

**Impact conditionnel.** Si ce champ devient un réglage utilisateur SaaS, il peut viser un service
interne ou détourner des données.

**Correction proposée.** Providers allow-listés, URL canonique côté serveur, blocage des plages
privées/métadonnées et politique egress. Les endpoints personnalisés doivent être une fonction
administrée séparée.

### SEC-015 — Documentation en dérive

**Preuve.** La documentation d'architecture décrit encore certains composants comme non créés alors
que deux prototypes existent ; elle affirme qu'aucune donnée privée n'entre dans Git alors que la
branche locale et une branche distante suivent la bibliothèque.

**Impact.** Revue de risque basée sur un modèle obsolète et confusion entre prototype local et
service de production.

**Correction proposée.** Mettre à jour la cartographie à chaque phase et exiger un diff du threat
model pour toute nouvelle frontière.

## 5. Contrôles positifs à préserver

- Trousseau macOS pour Gemini, migration vérifiée avant suppression du fallback.
- Statut de clé limité à des booléens ; aucune route de révélation.
- Loopback + origine correspondante sur les routes privées locales.
- Limites de taille, validations de contexte et timeout Gemini.
- Environnement enfant nettoyé et clé transmise par stdin.
- Aucun `shell=True` trouvé dans les chemins inspectés.
- Workers statiques fail-closed pour les méthodes et routes API inconnues.
- `ReactMarkdown` utilisé sans activation de HTML brut dans le prototype inspecté.
- Suppression programmatique limitée aux racines autorisées.

## 6. Points non vérifiables maintenant

- CVE des versions réellement installées et de l'image finale.
- Isolation tenant, IDOR, rôles, admin, sessions, récupération de compte.
- Stripe et signatures webhook, car Stripe n'existe pas dans le dépôt.
- Sauvegardes/restauration et audit runtime, car la DB de production n'existe pas.
- Headers et règles réels de l'hébergement Cloudflare final.
- Validité des anciens cookies ou présence de clés historiques supplémentaires sans scan Gitleaks.
- Sécurité dynamique authentifiée, faute d'environnement de préproduction autorisé.

## 7. Sources externes principales

- [GitHub Actions : permissions minimales et SHA complets](https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats)
- [Gitleaks Action : historique complet, rotation et limites du SARIF](https://github.com/gitleaks/gitleaks-action)
- [Trivy : scanners de dépôt et SBOM](https://trivy.dev/docs/latest/target/repository/)
- [ZAP : limite des scans automatiques et autorisations métier](https://www.zaproxy.org/docs/api/)
- [yt-dlp : installation et téléchargement des scripts EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS)

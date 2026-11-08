# Plan de déploiement SaaS de Transcript

Statut : `draft_to_validate`
Décision actuelle : conserver l'application en local. Aucun déploiement public n'est autorisé par ce document.

## Réponse courte

Le prototype peut être lancé aujourd'hui sur `http://127.0.0.1:4175/`, mais il ne doit pas être
présenté comme un SaaS. L'interface React fonctionne, tandis que la génération des résumés, la garde
des clés Gemini, les exports Maxi Brain et une partie des routes privées reposent encore sur la
machine locale. Avant une mise en ligne, il faut séparer clairement le navigateur, l'API, les workers
Python et les données de chaque utilisateur.

## Lancer l'interface locale

Première installation :

```bash
cd prototypes/fluid-knowledge-web
npm install
cd ../..
```

Puis, depuis la racine du dépôt :

```bash
./runweb
```

Ouvrir ensuite `http://127.0.0.1:4175/`. Pour changer le port :

```bash
TRANSCRIPT_WEB_PORT=5173 ./runweb
```

Le serveur reste lié à `127.0.0.1`. Il n'est pas exposé au réseau local. Si
`output/videos/playlist-32/` n'existe pas, trois cartes de démonstration neutres sont utilisées ; aucun
transcript ni résumé personnel n'est ajouté au dépôt.

## État actuel

Déjà disponible :

- interface responsive desktop/mobile, cartes et gestes garder/écarter ;
- lecture longue, notes locales, approfondissement Gemini et ouverture contextualisée de ChatGPT ;
- historique consultable, suppression du reçu local et exports Markdown ZIP/PDF ;
- export privé vers Maxi Brain sur la machine du propriétaire ;
- clés Gemini locales placées dans le Trousseau macOS, avec séparation résumé/approfondissement ;
- garde-fous de quota et messages de récupération ;
- pipeline Python local YouTube/PDF avec caches et sorties privées.

Manque pour un SaaS :

- identité utilisateur vérifiée, organisations et isolation multi-tenant ;
- API serveur authentifiée et autorisations par objet ;
- stockage cloud chiffré des sources, résumés, notes et exports ;
- file de tâches durable pour les traitements longs ;
- workers isolés capables d'exécuter le pipeline Python ;
- coffre de secrets serveur et modèle sûr pour les clés fournies par les utilisateurs ;
- quotas, facturation, journal d'audit, sauvegardes et restauration ;
- environnement de staging, migrations contrôlées et chaîne CI de sécurité.

## Architecture cible proposée

Cette architecture est une proposition, pas une décision finale :

```text
Navigateur
  -> CDN + frontend statique
  -> API / control plane authentifié
       -> base relationnelle (users, orgs, jobs, notes, history, billing)
       -> stockage objet (PDF, transcripts, exports)
       -> file de tâches
            -> workers Python isolés
                 -> YouTube / extraction PDF / fournisseur IA
       -> coffre de secrets et KMS
       -> journaux d'audit, métriques et alertes
```

Le navigateur ne reçoit jamais une clé serveur, une clé d'un autre utilisateur, un chemin Maxi Brain
ou une donnée appartenant à un autre tenant. Les workers reçoivent un jeton de tâche court et limité,
lisent uniquement les objets nécessaires, puis écrivent des résultats idempotents.

## Déploiement progressif

### Phase 0 — Assainir le dépôt public (P0)

Avant toute connexion à Cloudflare, Vercel ou un autre hébergeur :

1. retirer de l'historique Git les anciens transcripts, métadonnées et cookies publiés ;
2. révoquer ou faire expirer toute donnée d'authentification qui aurait été commitée ;
3. vérifier que `.env`, `cookies.txt`, `input/`, `output/`, `cache/`, la bibliothèque YouTube et les
   jeux générés restent ignorés ;
4. activer la protection de branche et les scans décrits dans `SECURITY_CI_PLAN.md` ;
5. repasser Gitleaks/detect-secrets sur l'historique nettoyé avant de le rendre public.

Condition de sortie : aucun fichier utilisateur ni secret exploitable dans la branche et son
historique. Une absence d'alerte ne constitue pas une garantie de sécurité.

### Phase 1 — Frontend publiable sans données privées (P1)

- ne livrer qu'un jeu de démonstration synthétique et neutre ;
- supprimer ou désactiver les routes locales (`/api/local-*`, Maxi Brain, Trousseau) du build cloud ;
- ajouter des en-têtes CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` et une politique
  restrictive de permissions ;
- publier d'abord en preview privée, puis faire un test fonctionnel et un contrôle ZAP passif ;
- ne pas promettre résumé, synchronisation ou persistance cloud tant que le backend n'existe pas.

Pour une simple démo statique Cloudflare Pages :

| Réglage | Valeur |
|---|---|
| Racine du projet | `prototypes/fluid-knowledge-web` |
| Commande de build | `npm run build` |
| Dossier de sortie | `dist/client` |
| Branche de production | branche explicitement approuvée |

Ne connecter l'auto-déploiement GitHub qu'après la phase 0.

### Phase 2 — Identité et isolation multi-tenant (P1)

- choisir un fournisseur d'identité compatible OIDC et MFA ;
- modéliser `users`, `organizations`, `memberships`, rôles et invitations ;
- dériver le tenant de la session serveur, jamais d'un identifiant accepté aveuglément du client ;
- vérifier l'autorisation sur chaque ressource : playlist, vidéo, note, job, export et clé ;
- ajouter des tests négatifs d'accès horizontal et vertical ;
- réserver les opérations d'administration à des rôles séparés et journalisés.

Condition de sortie : les tests prouvent qu'un utilisateur ne peut ni lire, ni modifier, ni deviner
les objets d'un autre tenant.

### Phase 3 — Control plane et données (P1)

- utiliser une base relationnelle pour les métadonnées et un stockage objet privé pour les fichiers ;
- chiffrer en transit et au repos ; utiliser des URL signées à courte durée ;
- appliquer migrations versionnées, contraintes, suppression différée et politique de rétention ;
- maintenir un journal d'audit append-only pour les actions sensibles ;
- sauvegarder la base et les objets, puis tester réellement la restauration.

Cloudflare D1/R2 peuvent convenir à un premier produit si leurs limites correspondent aux traitements
et à la résidence des données. Une base PostgreSQL managée reste à comparer avant validation.

### Phase 4 — Traitements asynchrones (P1)

- soumettre chaque vidéo/PDF comme tâche durable et idempotente ;
- utiliser une file avec tentatives bornées, backoff, dead-letter queue et annulation ;
- exécuter le pipeline Python dans des workers ou conteneurs isolés du frontend ;
- limiter CPU, mémoire, durée, taille d'entrée et accès réseau ;
- scanner les fichiers entrants et refuser les formats/archives dangereux ;
- ne jamais supprimer les sorties globales lors du traitement d'une playlist.

Cloudflare Queues peut porter l'orchestration, mais le worker Python lourd devra probablement tourner
sur un service de conteneurs séparé. Ce choix doit être validé par un test de charge et de coût.

### Phase 5 — Clés IA, abus et coûts (P1)

- proposer deux modes explicites : clé gérée par le service ou clé fournie par l'utilisateur (BYOK) ;
- conserver les clés serveur dans un secret manager/KMS, jamais en base en clair ni dans les logs ;
- pour BYOK, chiffrer par enveloppe avec une clé KMS et limiter le déchiffrement au worker concerné ;
- séparer clé de résumé et clé d'approfondissement si l'utilisateur le souhaite ;
- masquer les valeurs, permettre rotation/suppression et ne jamais les renvoyer à l'interface ;
- appliquer quotas par utilisateur, organisation, IP, modèle et type de tâche ;
- avertir avant épuisement, bloquer proprement et empêcher les relances en boucle ;
- journaliser usage et coût sans enregistrer prompts ou données privées par défaut.

L'offre gratuite Google peut être signalée, avec un lien vers la documentation officielle, mais elle
ne doit jamais être présentée comme garantie ou illimitée.

### Phase 6 — Notes, historique et exports (P1)

- stocker les notes côté serveur avec version et propriétaire ;
- séparer l'historique de session des reçus d'export ;
- rendre les exports ZIP Markdown et PDF disponibles via URL signée et expiration ;
- pour le propriétaire, garder Maxi Brain comme connecteur privé ;
- pour les autres utilisateurs, proposer d'abord téléchargement ZIP/PDF, puis connecteurs Obsidian,
  Notion ou Drive seulement après consentement OAuth explicite ;
- documenter suppression, portabilité et durée de conservation.

### Phase 7 — CI, staging et mise en production (P1/P2)

- Pull request : tests, lint, Semgrep, Gitleaks et analyse des dépendances modifiées ;
- branche principale : build reproductible, Trivy complet, SBOM et artefacts signés ;
- staging : migrations, tests end-to-end authentifiés, tests d'isolation et ZAP passif ;
- avant production : approbation humaine, sauvegarde, plan de retour arrière et migrations compatibles ;
- production : déploiement progressif, health checks, alertes et rollback automatique borné.

Les conditions de blocage, exceptions temporaires et permissions GitHub minimales sont détaillées dans
`SECURITY_CI_PLAN.md`.

### Phase 8 — Exploitation (P2/P3)

- supervision disponibilité, latence, files, erreurs, coûts IA et anomalies d'autorisation ;
- alertes sur pics d'usage, échecs de webhook et élévations de privilèges ;
- rotation des secrets et revue périodique des accès ;
- procédure d'incident, contact sécurité et journal des violations ;
- exercices de restauration et revue de la rétention ;
- pentest humain avant ouverture large ou traitement de données sensibles.

## Paiement éventuel

Stripe n'est utile qu'au moment de monétiser. Son ajout devra inclure : validation de signature sur le
corps brut, idempotence, anti-rejeu, séparation des environnements, source de vérité serveur pour les
droits et rapprochement périodique. Le succès d'une redirection client ne doit jamais accorder un plan.

## Choix à valider avant implémentation

- hébergeur du frontend et de l'API ;
- fournisseur d'identité et politique MFA ;
- D1 ou PostgreSQL pour les données relationnelles ;
- lieu d'exécution des workers Python ;
- stockage et région des données ;
- modèle de clés IA : service, BYOK ou hybride ;
- rétention, suppression de compte et exigences RGPD ;
- paiement, plans, quotas et limites de coût ;
- statut public/privé du dépôt après nettoyage de l'historique.

## Documentation liée

- [`SECURITY_ARCHITECTURE.md`](../SECURITY_ARCHITECTURE.md)
- [`SECURITY_AUDIT.md`](../SECURITY_AUDIT.md)
- [`SECURITY_ROADMAP.md`](../SECURITY_ROADMAP.md)
- [`SECURITY_CI_PLAN.md`](../SECURITY_CI_PLAN.md)
- [Cloudflare Pages — React](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Cloudflare Pages — Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Workers — Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/get-started/)
- [Cloudflare D1 — Data security](https://developers.cloudflare.com/d1/reference/data-security/)

Ces liens servent de sources techniques actuelles au 8 novembre 2026. Les limites, prix et produits
devront être vérifiés à nouveau au moment de la décision de déploiement.

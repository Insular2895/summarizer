# Summarizer Web V1 — Plan d'implémentation

> Baseline : 2026-11-01 sur la branche `feat/web-v1`.
> Ce plan exécute [WEB_V1_ARCHITECTURE.md](WEB_V1_ARCHITECTURE.md) et
> [UI_UX_SPEC.md](UI_UX_SPEC.md). Il ne remplace pas ces contrats.

## Règles d'exécution

- Exécuter les phases dans l'ordre et ne franchir un gate qu'après réussite de ses critères.
- Un échec préexistant est documenté séparément ; il n'est pas attribué à Web V1.
- Garder les changements petits, réversibles et testés.
- Ne jamais modifier le pipeline PDF pour faire avancer Web V1.
- Ne jamais utiliser `stdout` comme API de progression.
- Ne jamais exposer une variable secrète au bundle Vite.
- Ne jamais supprimer de données gardées avant confirmation durable de l'export.
- Ne pas créer de commit tant que les changements locaux antérieurs n'ont pas été séparés ou validés.

## Convention de structure cible

La structure de travail prévue est :

```text
web/                    frontend React + TypeScript + Vite
control-plane/          API et persistance Cloudflare
contracts/web-v1/       schemas échangés entre les composants
src/web_adapter/        frontière Python autour du pipeline existant
tests/web_adapter/      tests Python de cette frontière
```

La topologie Cloudflare historique doit être restituée en Phase 1. Si elle impose un packaging
différent, seule cette convention de dossiers est ajustée ; les frontières fonctionnelles restent
inchangées.

## Phase 0 — Baseline

**OBJECTIF**

Établir un état de référence reproductible avant toute modification du code métier.

**FICHIERS CONCERNÉS**

- `AGENTS.md`, `AI_MAINTENANCE.md`, `Readme.md` ;
- `docs/ARCHITECTURE.md`, `docs/PIPELINE.md`, `docs/SAFETY.md` ;
- `.env.example`, `.gitignore`, `pyproject.toml`, requirements et CI ;
- `src/pipeline.py`, `src/storage/manifest.py`, extracteur YouTube, summarizer et LLM ;
- tests existants.

**DÉPENDANCES**

- dépôt local et environnement `.venv` Python 3.11 ;
- aucune dépendance Web requise.

**CHANGEMENTS**

- branche `feat/web-v1` créée, aucune branche Web V1 antérieure trouvée ;
- aucune modification métier effectuée ;
- état sale préexistant conservé et identifié ;
- absence de `docs/UI_UX_SPEC.md` et des anciennes maquettes documentée ;
- dette de confidentialité des fichiers `library/youtube/` déjà suivis documentée.

Changements présents avant cette phase et à ne pas attribuer à Web V1 : `.gitignore`, `COMMANDS.md`,
`Readme.md`, `input/youtube/urls.example.txt`, `prompts/video_summary.md`, `runyoutube`, `src/cli.py`,
`src/llm/usage.py`, `src/pipeline.py`, `src/summarizers/video_summarizer.py`,
`tests/test_playlist_logic.py`, plus trois fichiers non suivis de prompt/tests/bibliothèque.

**CRITÈRES D'ACCEPTATION**

- [x] branche distincte de `main` ;
- [x] état Git compris sans écraser les changements existants ;
- [x] pipeline et comportement playlist inspectés ;
- [x] configuration secrets/retention inspectée ;
- [x] baseline de tests enregistrée.

**TESTS**

- `pytest -q` : 103 réussis, 5 warnings SWIG ;
- `black --check src tests` : réussi ;
- `ruff check src tests` : réussi ;
- `mypy src` : 20 erreurs dans 9 fichiers, préexistantes et non bloquantes dans la CI ;
- `detect-secrets scan` : 638 alertes d'entropie, dont 637 sous `library/` et une fixture ;
- recherche manuelle de signatures de clés connues : aucune correspondance ;
- test YouTube live non exécuté : aucune fixture réseau stable, et le dry-run actuel crée un manifeste.

**RISQUES**

- 896 transcripts et 896 métadonnées YouTube sont déjà suivis par Git ;
- la branche porte aussi des changements de travail antérieurs ;
- le typage statique ne fournit pas encore une baseline verte.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Baseline consignée dans ce document et aucun changement antérieur perdu. Condition satisfaite.

## Phase 1 — Documentation et contrats

**OBJECTIF**

Geler les décisions récupérables et définir des contrats minimaux avant toute implémentation.

**FICHIERS CONCERNÉS**

- `docs/UI_UX_SPEC.md` ;
- `docs/WEB_V1_ARCHITECTURE.md` ;
- `docs/WEB_V1_IMPLEMENTATION_PLAN.md` ;
- `contracts/web-v1/*.schema.json` à créer après restitution de la topologie ;
- fixtures de contrat sous `contracts/web-v1/examples/`.

**DÉPENDANCES**

- Phase 0 ;
- décision Cloudflare historique et anciennes maquettes si disponibles.

**CHANGEMENTS**

- documenter Source, Playlist, Video, Job, Progress, Note, ReviewDecision et Finalize ;
- figer les transitions `QUEUED/PROCESSING/READY/DONE/FAILED` ;
- ajouter des schemas JSON bornés sans générateur de code obligatoire ;
- restituer précisément Pages/Static Assets, Worker(s), D1, Tunnel éventuel, routes, domaines et
  Access ;
- rapprocher les anciennes maquettes de la spécification fonctionnelle reconstruite.

**CRITÈRES D'ACCEPTATION**

- chaque donnée échangée possède propriétaire, identifiant, version et provenance ;
- aucune décision ouverte n'est présentée comme figée ;
- le statut `READY` d'une vidéo pendant un Job `PROCESSING` est représentable ;
- Note et ReviewDecision ont une contrainte d'unicité par vidéo ;
- l'ordre export → confirmation → cleanup est testable dans le contrat.

**TESTS**

- validation des exemples contre les schemas JSON ;
- tests de transitions valides et invalides ;
- vérification des liens Markdown et rendu Mermaid ;
- revue manuelle de cohérence avec les trois docs sources.

**RISQUES**

- inventer une ancienne décision absente ;
- transformer le manifeste CLI en contrat Web sans clarifier la sémantique de `done` ;
- figer des détails visuels avant récupération des maquettes.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Topologie Cloudflare exacte et référence UI historique consignées, ou validation humaine explicite
des éléments manquants. Aucun code Web ne commence avant ce gate.

## Phase 2 — Squelette Web

**OBJECTIF**

Démarrer l'application React/TypeScript/Vite avec Home, Review et History, sans logique métier
dupliquée.

**FICHIERS CONCERNÉS**

- `web/package.json`, `web/tsconfig*.json`, `web/vite.config.ts` ;
- `web/src/main.tsx`, `web/src/app/router.tsx` ;
- `web/src/pages/HomePage.tsx`, `ReviewPage.tsx`, `HistoryPage.tsx` ;
- `web/src/lib/config.ts`, styles et tests de shell ;
- CI pour install/lint/test/build frontend.

**DÉPENDANCES**

- Phase 1 validée ; runtime Node et package manager versions fixées.

**CHANGEMENTS**

- créer le shell et la navigation responsive ;
- ajouter un client API typé mais mocké par contrats ;
- allow-lister les seules variables publiques ;
- afficher des états vides, chargement et erreur sans provider spécifique.

**CRITÈRES D'ACCEPTATION**

- les trois routes se chargent directement et après refresh ;
- aucune clé ni logique Python/LLM dans le bundle ;
- build de production reproductible ;
- navigation utilisable au clavier et sur viewport mobile.

**TESTS**

- test de rendu de chaque route ;
- lint/typecheck/build ;
- scan du bundle pour noms de secrets et clés ;
- contrôle responsive local Chromium/Safari si disponible.

**RISQUES**

- confondre mock d'interface et seconde logique métier ;
- choisir des composants visuels définitifs avant la phase prototypes.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Shell vert en CI, aucun secret frontend, aucune dépendance au worker physique.

## Phase 3 — Control plane

**OBJECTIF**

Créer la couche Cloudflare minimale pour état, jobs, Review, Note et History.

**FICHIERS CONCERNÉS**

- `control-plane/package.json`, configuration Cloudflare restituée ;
- `control-plane/src/index.ts`, `routes/`, `domain/`, `storage/` ;
- migrations D1 si D1 est confirmé ;
- tests runtime et contrats ;
- `contracts/web-v1/`.

**DÉPENDANCES**

- topologie et auth Phase 1 ; schemas de contrat ; shell Phase 2.

**CHANGEMENTS**

- endpoints de création Source/Job et lecture progression ;
- persistance Source, Playlist, Video, Job, Note, décision et HistoryEntry ;
- transitions d'état centralisées ;
- validation de schéma, autorisation ressource et erreurs publiques/diagnostics séparés ;
- idempotency key sur créations et mutations importantes.

**CRITÈRES D'ACCEPTATION**

- une requête répétée ne duplique pas la Source ou le Job ;
- toute ressource est autorisée côté serveur ;
- état durable après redémarrage de l'isolate ;
- aucune donnée critique uniquement en mémoire.

**TESTS**

- tests unitaires transitions/validation ;
- tests d'intégration migrations et API ;
- accès croisé refusé ;
- requêtes concurrentes et idempotence.

**RISQUES**

- ajouter un ORM lourd ;
- dépendre de mémoire d'isolate ;
- divergence entre schema TypeScript et Python.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

API contractuelle testée localement, migrations non destructives et auth fail-closed.

## Phase 4 — Adaptateur Python

**OBJECTIF**

Traduire un Job Web en appel du pipeline Python existant et publier des événements structurés.

**FICHIERS CONCERNÉS**

- `src/web_adapter/contracts.py`, `events.py`, `youtube.py`, `artifacts.py` ;
- points d'extension minimaux dans `src/pipeline.py` ;
- `tests/web_adapter/` ;
- aucun changement fonctionnel PDF.

**DÉPENDANCES**

- contrats Phase 1 et API Phase 3.

**CHANGEMENTS**

- injecter un event sink optionnel dans les étapes YouTube ;
- mapper les états CLI vers états Web ;
- retourner références de transcript, résumé, modèle et provenance ;
- préserver les fonctions CLI publiques et leur comportement par défaut.

**CRITÈRES D'ACCEPTATION**

- aucun parsing de Rich/stdout ;
- CLI sans event sink inchangé ;
- une vidéo produit une séquence d'événements ordonnée ;
- une exception devient un résultat structuré sans secret.

**TESTS**

- tests unitaires de mapping et événements ;
- régression complète Python ;
- test de non-régression PDF ;
- simulation extraction et LLM sans réseau.

**RISQUES**

- refactor massif du pipeline ;
- double écriture artefact/manifeste ;
- fuite du message provider brut.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Adaptateur vert, CLI préservé et événement `READY` produit sans dépendre du terminal.

## Phase 5 — Worker

**OBJECTIF**

Relier un runner remplaçable au control plane avec claim, heartbeat et idempotence raisonnable.

**FICHIERS CONCERNÉS**

- `src/web_adapter/worker.py`, `control_plane_client.py` ;
- scripts/configuration de lancement non secrets ;
- tests worker et API claim.

**DÉPENDANCES**

- Phases 3 et 4 ; identité machine Cloudflare configurée.

**CHANGEMENTS**

- claim atomique avec expiration ;
- heartbeat et abandon propre ;
- publication d'événements avec sequence/event_id ;
- retry borné ;
- arrêt gracieux sans marquer un résultat fictif.

**CRITÈRES D'ACCEPTATION**

- deux workers ne traitent pas simultanément le même job ;
- un worker mort libère le travail après expiration ;
- un événement tardif d'un ancien claim est refusé ;
- le worker ne reçoit que les secrets dont il a besoin.

**TESTS**

- concurrence de claims ;
- expiration/reprise ;
- doublons et ordre d'événements ;
- SIGTERM/arrêt simulé.

**RISQUES**

- lease trop courte pendant un appel LLM ;
- retry non borné ;
- credentials machine trop larges.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Cycle claim → traitement simulé → résultat confirmé fonctionne deux fois sans duplication.

## Phase 6 — YouTube vidéo unique

**OBJECTIF**

Valider une URL vidéo de bout en bout avant la playlist.

**FICHIERS CONCERNÉS**

- intégration Home/API/worker/adaptateur ;
- tests E2E vidéo ;
- fixtures d'erreurs YouTube/LLM.

**DÉPENDANCES**

- Phases 2 à 5 ; secrets worker disponibles dans un environnement de test autorisé.

**CHANGEMENTS**

- validation/canonicalisation URL ;
- création Source/Job ;
- extraction transcript et résumé ;
- publication Video `READY` ;
- retry ciblé.

**CRITÈRES D'ACCEPTATION**

- happy path URL → fiche consultable ;
- URL invalide refusée ;
- transcript absent, extraction et LLM échoués produisent des erreurs distinctes ;
- retry ne duplique pas la vidéo.

**TESTS**

- tests déterministes mockés pour tous les échecs ;
- un smoke test live contrôlé si cookies/quota le permettent ;
- vérification provenance et modèle.

**RISQUES**

- dépendance réseau/flakiness ;
- erreur provider exposée ;
- URL avec playlist interprétée comme vidéo.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Happy path et cinq scénarios d'échec passent, données récupérables après retry.

## Phase 7 — Playlist

**OBJECTIF**

Étendre le flux à une playlist progressive sans régresser le séquentiel existant.

**FICHIERS CONCERNÉS**

- adaptateur playlist et orchestration worker ;
- endpoints de progression/vidéos prêtes ;
- Review progressive ;
- tests playlist.

**DÉPENDANCES**

- Phase 6.

**CHANGEMENTS**

- découverte ordonnée ;
- sous-état par vidéo ;
- publication immédiate de chaque Video `READY` ;
- poursuite après échec isolé ;
- progression globale à compteurs.

**CRITÈRES D'ACCEPTATION**

- première vidéo reviewable avant la fin globale ;
- ordre et occurrences dupliquées préservés ;
- une erreur n'arrête pas les suivantes ;
- reprise ignore uniquement les résultats réellement valides.

**TESTS**

- playlist mixte succès/échec ;
- doublon d'URL ;
- interruption/reprise ;
- état global avec total connu puis terminé.

**RISQUES**

- faire attendre Review jusqu'à la fin ;
- confondre `READY` vidéo et `READY` Job ;
- retraiter un succès après reprise.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Test progressif prouve qu'une première carte apparaît pendant `PROCESSING`.

## Phase 8 — Note et autosave

**OBJECTIF**

Implémenter une Note unique fiable par vidéo.

**FICHIERS CONCERNÉS**

- table/route Note du control plane ;
- `web/src/features/note/` ;
- migration et tests concurrence/réseau.

**DÉPENDANCES**

- vidéo `READY` Phase 6 ; contrat Note Phase 1.

**CHANGEMENTS**

- éditeur de texte ;
- debounce contrôlé ;
- version optimiste serveur ;
- file locale et brouillon de reprise ;
- flush navigation/visibilité quand possible.

**CRITÈRES D'ACCEPTATION**

- contrainte unique `video_id` ;
- ancienne requête incapable d'écraser la nouvelle ;
- fermeture/reconnexion restaure le brouillon ;
- état de sauvegarde visible.

**TESTS**

- réponses réseau inversées ;
- conflit 409/version ;
- offline/reconnect ;
- changement rapide de route et `pageshow`.

**RISQUES**

- double source de vérité local/serveur ;
- `sendBeacon` considéré à tort comme garantie ;
- perte silencieuse de brouillon.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Suite de concurrence et reprise verte sur Chromium, puis contrôle Safari disponible.

## Phase 9 — Transcript vers Note

**OBJECTIF**

Ajouter une sélection transcript à la Note avec timestamp, sans créer de highlights.

**FICHIERS CONCERNÉS**

- `web/src/features/transcript/` ;
- modèle interne de citation Note ;
- tests desktop/mobile.

**DÉPENDANCES**

- Phase 8 ; transcript horodaté exploitable.

**CHANGEMENTS**

- sélection native desktop ;
- action **Ajouter à la note** ;
- insertion texte + timestamp ;
- interaction mobile conforme à la maquette choisie.

**CRITÈRES D'ACCEPTATION**

- provenance temporelle conservée ;
- ajout idempotent pendant un double tap raisonnable ;
- aucune entité Card/Highlight/Annotation supplémentaire.

**TESTS**

- sélection multi-segments et bornes ;
- timestamp exact ;
- autosave après insertion ;
- Safari mobile manuel.

**RISQUES**

- API Selection différente sur iOS ;
- transcript sans timestamps structurés ;
- duplication d'extrait.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Extrait et timestamp persistent après refresh et reconnexion.

## Phase 9 bis — Approfondissement contextuel par IA

**OBJECTIF**

Permettre une question Gemini à partir d'un passage sélectionné sans exposer la clé, altérer la
source canonique ou créer une seconde application de chat.

**FICHIERS CONCERNÉS**

- panneau latéral/bottom sheet de la fiche sous `web/src/features/note/` ;
- route authentifiée du control plane et service Python réutilisant `LLMClient`/`ModelRouter` ;
- contrats et tests sécurité/coût.

**DÉPENDANCES**

- Phase 8 ; résumé `READY` ; Phase 9 pour le transcript horodaté ; auth et contrôle de ressource.

**CHANGEMENTS**

- sélection native du résumé ou transcript et contexte de repli explicite ;
- question libre bornée et action **Approfondir avec Gemini** ;
- appel provider exclusivement côté serveur avec timeout, limite de fréquence et journal d'usage ;
- réponse distincte de la source, provenance de modèle et action explicite **Ajouter à la Note** ;
- fallback local **Copier et ouvrir ChatGPT** sans URL de préremplissage inventée.
- réglage générique **Clés API**, onboarding au premier usage et récupération après quota épuisé ;
- clés logiques distinctes pour résumés et approfondissements, jamais renvoyées au client.

**CRITÈRES D'ACCEPTATION**

- aucune clé ou configuration privée dans le bundle ou les réponses API ;
- un utilisateur ne peut pas envoyer le résumé d'une vidéo qu'il n'est pas autorisé à lire ;
- extrait, résumé, question et sortie ont des limites de taille ;
- l'échec Gemini ne modifie ni la Note ni le résumé et laisse le copier/ouvrir disponible ;
- une réponse IA n'est persistée et exportée qu'après ajout volontaire à la Note ;
- instructions hostiles dans le contenu source ne déclenchent ni outil, ni décision, ni export.
- une clé existante côté serveur évite l'onboarding ; une absence ouvre Clés API avant l'appel ;
- le quota épuisé utilise un code produit stable et conserve Note, question et état du job.

**TESTS**

- sélection → question → réponse simulée → ajout à la Note → refresh → export ;
- origine étrangère, accès croisé, payload surdimensionné, quota et timeout refusés proprement ;
- formulaire Clés API responsive, secrets absents des réponses et stockage local dans le Trousseau
  macOS ; test d'intégration sur un service Trousseau isolé avec nettoyage systématique ;
- migration `.env` testée avec écriture, relecture, vérification puis suppression atomique des seules
  variables Gemini ; backend mémoire uniquement pour les tests UI ;
- vérification du bundle et secret scan ;
- panneau latéral desktop/tablette et bottom sheet mobile.

**RISQUES**

- fuite de clé par appel direct frontend ;
- prompt injection issue du transcript ou du résumé ;
- coût sans limite, réponse présentée comme source et envoi implicite à un tiers ;
- confusion entre prototype local et route de production authentifiée.
- croire que le Trousseau local remplace le coffre chiffré par utilisateur/KMS requis en production.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Flux complet vert avec provider simulé, contrôles serveur en place et aucune mutation sans action
explicite de l'utilisateur.

## Phase 10 — Review

**OBJECTIF**

Implémenter Garder, Écarter et Undo sur boutons, clavier et swipe.

**FICHIERS CONCERNÉS**

- `web/src/features/review/` ;
- routes/mutations ReviewDecision ;
- tests gestes/raccourcis/idempotence.

**DÉPENDANCES**

- Phase 7 ; direction d'interaction de `UI_UX_SPEC.md`.

**CHANGEMENTS**

- file progressive ;
- boutons accessibles ;
- flèches desktop ;
- swipe mobile uniquement dans Review ;
- journal minimal de dernière décision pour Undo.

**CRITÈRES D'ACCEPTATION**

- même résultat via trois moyens d'entrée ;
- fiche détaillée sans décision au swipe ;
- Undo restaure serveur et UI ;
- Écarter ne supprime aucun artefact.

**TESTS**

- clavier avec focus dans un champ ;
- seuil/annulation swipe ;
- double action concurrente ;
- Undo après reconnexion.

**RISQUES**

- décision accidentelle pendant scroll ;
- raccourci actif dans l'éditeur ;
- animation masquant un échec serveur.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Décisions et Undo restent cohérents après refresh, offline court et navigation fiche/Review.

## Phase 11 — Finalize

**OBJECTIF**

Orchestrer une finalisation sûre à partir des décisions courantes.

**FICHIERS CONCERNÉS**

- domaine/route Finalize ;
- écran **Playlist terminée** ;
- tests machine d'état.

**DÉPENDANCES**

- toutes les vidéos traitables ont une décision ; Phase 10.

**CHANGEMENTS**

- snapshot de sélection versionné ;
- demande idempotente de finalisation ;
- état export en cours/confirmé/échoué ;
- reprise sans nouvelle sélection implicite.

**CRITÈRES D'ACCEPTATION**

- impossible de nettoyer avant confirmation ;
- double clic ne crée pas deux exports ;
- changement de décision concurrent détecté ;
- erreur laisse les contenus gardés disponibles.

**TESTS**

- export réussi/échoué/timeout ;
- double soumission ;
- décision modifiée pendant finalisation ;
- reprise après crash.

**RISQUES**

- transaction trop large autour d'un appel externe ;
- état `DONE` prématuré ;
- snapshot et décisions divergents.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

La machine d'état prouve qu'aucun chemin ne mène au cleanup avant confirmation.

## Phase 12 — Exports universels et Brain Vault

**OBJECTIF**

Exporter les contenus gardés dans un format portable, puis utiliser un connecteur Vault privé quand
l'environnement l'autorise, sans réimplémenter son organisation.

**FICHIERS CONCERNÉS**

- frontière export/outbox ;
- générateurs ZIP Markdown et PDF propre ;
- extension ciblée de `src/exporters/graphipy.py` ou nouvel exporteur si justifié ;
- schemas/fixtures de paquet ;
- tests de confirmation.

**DÉPENDANCES**

- Phase 11 ; chemin inbox/confirmation Brain Vault restitué.

**CHANGEMENTS**

- paquet avec résumé, Note, transcript/référence, timestamps et provenance ;
- ZIP Markdown universel avec README, manifeste et un fichier par vidéo gardée ;
- PDF propre comme alternative de lecture ;
- connecteur Maxi Brain visible uniquement si la capacité locale est disponible ;
- dépôt Maxi Brain atomique dans `inbox/to_process/` avec statut `to_process` ;
- écriture atomique ou API idempotente ;
- reçu de confirmation durable ;
- aucune connaissance des dossiers internes non validés.

**CRITÈRES D'ACCEPTATION**

- toutes les vidéos `KEPT` et aucune `DISCARDED` exportées ;
- ZIP et PDF téléchargeables sans dépendre d'Obsidian ;
- absence du bouton Maxi Brain sur un hébergement sans connecteur ;
- modèle/provenance conservés ;
- retry ne duplique pas ;
- confirmation vérifiable avant cleanup.

**TESTS**

- golden files Markdown/JSON ;
- caractères spéciaux et gros transcript ;
- échec partiel puis reprise ;
- validation contre workflow Vault réel.

**RISQUES**

- inventer l'arborescence du vault ;
- paquet incomplet ;
- confirmation basée seulement sur absence d'erreur.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Un export test est confirmé par le consommateur réel et reste idempotent.

## Phase 13 — Cleanup et History

**OBJECTIF**

Nettoyer uniquement le job confirmé et créer un historique léger.

**FICHIERS CONCERNÉS**

- registre d'artefacts et cleanup ;
- `src/storage/retention.py` uniquement si extension nécessaire ;
- routes/UI History ;
- tests sécurité chemins.

**DÉPENDANCES**

- reçu d'export Phase 12.

**CHANGEMENTS**

- allow-list des artefacts du job ;
- cleanup idempotent par étape ;
- retrait de la session Review ;
- HistoryEntry sans artefacts lourds.
- session active consultable et reprenable dans une section distincte ;
- bilan terminé consultable en lecture seule ;
- retrait d'une entrée History sans suppression des exports ou sources.

**CRITÈRES D'ACCEPTATION**

- aucune suppression globale ;
- `input/` et bibliothèque canonique intacts ;
- reprise d'un cleanup partiel ;
- History affiche source/date/comptes/statuts.
- une session active ne peut pas être supprimée depuis History ;
- retirer un reçu ne supprime aucun fichier ;

**TESTS**

- traversal et chemin hors racine refusés ;
- export non confirmé bloque ;
- deux cleanups donnent le même résultat ;
- History ne devient pas une bibliothèque.

**RISQUES**

- registre d'artefacts incomplet ;
- suppression de transcript canonique ;
- entrée History créée avant état stable.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Test destructif isolé en répertoire temporaire prouve le ciblage exact.

## Phase 14 — Prototypes design

> État au 2026-11-06 : prototype local créé dans `prototypes/fluid-knowledge/`. Build, runtime,
> interactions et packaging passent. Le gate de fidélité visuelle reste bloqué car le navigateur
> intégré Codex n'était pas disponible pour capturer et comparer le rendu à la maquette source.
> Une adaptation Web/PC responsive existe aussi dans `prototypes/fluid-knowledge-web/` : navigation
> latérale desktop, contexte adjacent, rail compact tablette et navigation basse mobile. Les 12 tests
> responsive, le build et le packaging passent ; sa QA visuelle reste bloquée pour la même raison.

**OBJECTIF**

Transformer la direction C **Fluid Knowledge**, choisie par l'utilisateur le 2026-11-06, en
prototype interactif fidèle utilisant le même backend et les mêmes contrats produit.

**FICHIERS CONCERNÉS**

- prototypes isolés du code métier ;
- documentation/captures de comparaison ;
- tokens visuels provisoires.

**DÉPENDANCES**

- comportements Phases 2 à 13 fiables ; référence sélectionnée conservée dans
  `docs/assets/web-v1-fluid-knowledge-review-mobile.png` ; skills pertinents de
  `emilkowalski/skills` lus avant usage.

**CHANGEMENTS**

- une composition **Fluid Knowledge** sur les mêmes données et interactions ;
- aucun fork d'API ou de logique Review ;
- déclinaisons contrôlées iPhone, iPad et Mac à partir de la même direction.

**CRITÈRES D'ACCEPTATION**

- parité fonctionnelle ;
- responsive iPhone/iPad/Mac ;
- fidélité à la référence approuvée sans masquer les actions ou états critiques.

**TESTS**

- comparaison référence/implémentation aux mêmes données et au même viewport mobile ;
- parcours critique sur le prototype sélectionné ;
- audit contraste/focus.

**RISQUES**

- divergence fonctionnelle sous prétexte de fidélité visuelle ;
- extrapolation arbitraire sur iPad/Mac ;
- travail visuel avant fiabilité.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Validation humaine du prototype interactif **Fluid Knowledge**. Le choix visuel C est déjà acquis ;
la sensation du geste et les déclinaisons responsive restent obligatoirement à valider.

## Phase 15 — Design final

**OBJECTIF**

Intégrer la direction choisie sans modifier les contrats produit.

**FICHIERS CONCERNÉS**

- composants/styles/tokens `web/` ;
- tests visuels et accessibilité.

**DÉPENDANCES**

- choix Phase 14 ; skills design prévus lus au moment de l'exécution.

**CHANGEMENTS**

- consolidation composants et tokens ;
- états responsive/erreur/chargement complets ;
- suppression du code prototype non retenu.

**CRITÈRES D'ACCEPTATION**

- direction choisie fidèle ;
- aucun changement backend ;
- boutons et états critiques restent visibles.

**TESTS**

- régression visuelle ;
- accessibilité automatisée et clavier ;
- build production.

**RISQUES**

- régression UX sous effet du polish ;
- CSS spécifique à un appareil.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Parcours Phase 22 toujours vert avec le design final.

## Phase 16 — Motion review

**OBJECTIF**

Auditer puis améliorer les animations une fois les interactions fiables.

**FICHIERS CONCERNÉS**

- animations Review/navigation ;
- tests reduced-motion et gestes.

**DÉPENDANCES**

- Phase 15.

**CHANGEMENTS**

- revue des animations existantes ;
- amélioration ciblée ;
- nouvelles opportunités seulement après audit.

**CRITÈRES D'ACCEPTATION**

- animation ne masque ni attente réseau ni erreur ;
- reduced motion respecté ;
- swipe reste annulable et prévisible.

**TESTS**

- timing lent/réseau échoué ;
- `prefers-reduced-motion` ;
- interruption d'animation.

**RISQUES**

- état visuel en avance sur état serveur ;
- motion gênant lecture ou sélection.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Review animation validée sans régression fonctionnelle ou accessibilité.

## Phase 17 — Mobile QA

**OBJECTIF**

Valider réellement iPhone Safari, iPad Safari et desktop Safari/Chromium.

**FICHIERS CONCERNÉS**

- plan/rapport QA ;
- correctifs frontend ciblés ;
- tests E2E quand automatisables.

**DÉPENDANCES**

- design et motion finalisés.

**CHANGEMENTS**

- contrôler safe area, clavier, viewport, scroll, sélection, autosave, swipe, Undo, orientation,
  changement d'onglet et retour navigateur.

**CRITÈRES D'ACCEPTATION**

- aucun contenu/action critique masqué ;
- pas de perte de Note ;
- bfcache restaure un état interactif valide.

**TESTS**

- matrice appareils réelle et simulations complémentaires ;
- offline/reconnect ;
- rotation avec clavier ;
- navigation avant/arrière.

**RISQUES**

- croire l'émulation équivalente à Safari réel ;
- bugs Selection/viewport propres à iOS.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Matrice critique verte ou limitations explicites acceptées.

## Phase 18 — Security QA

**OBJECTIF**

Vérifier secrets, auth, autorisation, validation, données privées et erreurs.

**FICHIERS CONCERNÉS**

- frontend, control plane, worker, CI, configs, docs sécurité.

**DÉPENDANCES**

- flux complet déployable en environnement de test.

**CHANGEMENTS**

- revue des boundaries et permissions ;
- tests Access/CSRF/CORS/IDOR ;
- redaction logs ;
- plan de remédiation des 1 792 fichiers YouTube déjà suivis.

**CRITÈRES D'ACCEPTATION**

- aucune clé/cookie dans Git, bundle, DB, logs ou réponse ;
- worker et humain ont des identités distinctes ;
- inputs strictement validés ;
- erreurs publiques neutres.

**TESTS**

- accès croisé ;
- mutation sans CSRF si cookies ;
- token expiré/révoqué ;
- inspection bundle et logs ;
- secret scan complet sur checkout propre.

**RISQUES**

- historique Git contenant déjà des données privées ;
- politique Access permissive ;
- diagnostic trop bavard.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Aucun finding critique/haut ouvert ; remédiation historique décidée avant publication.

## Phase 19 — Tests complets

**OBJECTIF**

Exécuter tous les contrôles réellement déclarés par les packages et la CI.

**FICHIERS CONCERNÉS**

- `pyproject.toml`, package manifests, CI, suites Python/TypeScript/E2E.

**DÉPENDANCES**

- fonctionnalités terminées.

**CHANGEMENTS**

- compléter la CI avec frontend/control plane ;
- rendre le typecheck bloquant après correction de la baseline ;
- documenter les tests live séparément des tests déterministes.

**CRITÈRES D'ACCEPTATION**

- format, lint, types, unitaires, intégration et build verts ;
- tests réseau non nécessaires au succès déterministe ;
- couverture des gates critiques.

**TESTS**

- Python : pytest, Black, Ruff, mypy ;
- Web/control plane : commandes exactes déclarées dans leurs manifests ;
- build production et E2E critique.

**RISQUES**

- laisser mypy non bloquant indéfiniment ;
- faux vert par mocks trop larges.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

CI complète verte sur checkout propre.

## Phase 20 — Secret scan

**OBJECTIF**

Vérifier le diff, le dépôt propre et les artefacts de build sans exposer de valeur.

**FICHIERS CONCERNÉS**

- tous fichiers suivis et bundle produit ; `.gitignore` ; CI.

**DÉPENDANCES**

- Phase 19.

**CHANGEMENTS**

- audit detect-secrets ;
- revue des faux positifs sans allow-list large ;
- recherche de `.env`, cookies, outputs, transcripts et URLs privées ;
- revue manuelle du diff.

**CRITÈRES D'ACCEPTATION**

- zéro secret confirmé ;
- aucun fichier utilisateur nouveau suivi ;
- faux positifs expliqués par type, sans publier leur valeur.

**TESTS**

- secret scan de CI sur checkout propre ;
- scan du bundle statique ;
- `git diff --check` et inventaire des fichiers suivis sensibles.

**RISQUES**

- ignorer un secret parce que la bibliothèque produit beaucoup de faux positifs ;
- scanner puis imprimer la valeur sensible dans les logs.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Scan vert et revue humaine du diff sensible.

## Phase 21 — Documentation finale

**OBJECTIF**

Documenter le lancement, les environnements et la reprise sans surcharger le README.

**FICHIERS CONCERNÉS**

- `Readme.md`, `COMMANDS.md`, docs Web/architecture/sécurité ;
- `.env.example` ou exemples séparés frontend/control plane/worker sans valeurs.

**DÉPENDANCES**

- architecture réellement implémentée.

**CHANGEMENTS**

- commandes développement ;
- variables publiques et secrets par zone ;
- workflow jobs/worker/retry ;
- limitations V1 et frontière PDF V2 ;
- procédure d'export/cleanup et diagnostics.

**CRITÈRES D'ACCEPTATION**

- un nouvel agent peut lancer et diagnostiquer sans deviner ;
- README reste orienté utilisateur ;
- aucune valeur privée dans les exemples.

**TESTS**

- exécution des commandes documentées sur checkout propre ;
- liens Markdown ;
- revue croisée docs/config.

**RISQUES**

- docs divergentes ;
- exposer noms internes inutiles ou URL privée.

**CONDITION POUR PASSER À LA PHASE SUIVANTE**

Runbook vérifié par une installation neuve ou équivalent CI.

## Phase 22 — Validation finale

**OBJECTIF**

Prouver le happy path complet et la récupération des échecs essentiels.

**FICHIERS CONCERNÉS**

- tests E2E, rapport final, éventuels correctifs ciblés.

**DÉPENDANCES**

- Phases 0 à 21 vertes.

**CHANGEMENTS**

- exécuter exactement le parcours défini dans `UI_UX_SPEC.md` ;
- vérifier première vidéo prête avant fin ;
- vérifier Note, extrait, Garder/Écarter, Undo, export, cleanup et History ;
- contrôler diagnostics et reprise.

**CRITÈRES D'ACCEPTATION**

- tous les points de la Definition of Done V1 sont observés ;
- aucun secret frontend ;
- aucun contenu gardé perdu ;
- mobile utilisable ;
- documentation et CI vertes.

**TESTS**

- E2E happy path ;
- export échoué puis reprise ;
- worker interrompu ;
- conflit autosave ;
- vidéo playlist en échec isolé ;
- contrôle manuel iPhone/iPad/Mac.

**RISQUES**

- valider uniquement le happy path mocké ;
- cleanup irréversible pendant une validation ;
- confondre design choisi et UX complète.

**CONDITION POUR PASSER À LA SUITE**

Rapport de validation signé, merge final selon les règles du dépôt, puis déploiement distinctement
autorisé. La phase documentaire actuelle n'autorise ni merge ni déploiement.

## Prochaine action autorisée

Rester en Phase 1 tant que le dernier élément d'architecture absent n'est pas récupéré ou revalidé :

1. le détail exact de la topologie Cloudflare antérieure ;

La référence visuelle mobile n'est plus bloquante : **Fluid Knowledge** a été choisie le 2026-11-06
et conservée dans `docs/assets/web-v1-fluid-knowledge-review-mobile.png`.

En attendant, les documents fonctionnels peuvent être relus et les contrats JSON préparés, mais la
Phase 2 ne doit pas commencer.

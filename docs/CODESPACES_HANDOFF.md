# Summarizer Web V1 — reprise dans GitHub Codespaces

Status: READY TO RESUME ON `feat/web-v1`

Ce document est le point d'entrée opérationnel si le Mac local n'est plus disponible. Il décrit l'état exact du Web V1, le démarrage dans Codespaces et les validations restantes.

## 1. État à reprendre

- Repository : `Insular2895/summarizer`.
- Branche de travail : `feat/web-v1`.
- Base : branche propre issue de `origin/main`, distincte du checkout local historique.
- Phases 0 à 13 : implémentées, testées et poussées.
- Phase 14 : terminée par choix humain de l'option 3 modifiée.
- Phase 15 : code du design final implémenté ; comparaison visuelle dans un navigateur encore requise.
- Phases 16 à 22 : à terminer selon la checklist ci-dessous.
- Baseline connue : Mypy signale 17 erreurs préexistantes dans 9 fichiers ; aucune nouvelle erreur ne doit être ajoutée.

Lire dans cet ordre avant de modifier le code :

1. `AGENTS.md` ;
2. `AI_MAINTENANCE.md` ;
3. `docs/UI_UX_SPEC.md` ;
4. `docs/WEB_V1_ARCHITECTURE.md` ;
5. `docs/WEB_V1_IMPLEMENTATION_PLAN.md` ;
6. `docs/WEB_V1_DESIGN_DECISIONS.md` ;
7. `design-qa.md`.

## 2. Créer le Codespace

Depuis GitHub :

1. ouvrir le repository ;
2. choisir **Code → Codespaces → New with options** ;
3. sélectionner la branche `feat/web-v1` ;
4. créer le Codespace et attendre la fin de `postCreateCommand`.

La configuration `.devcontainer/devcontainer.json` installe Python 3.11, Node 24, les dépendances Python, les dépendances Web et celles du control plane. Les ports 4173 et 8787 sont préparés pour le frontend et l'API locale.

Vérifier ensuite :

```bash
git branch --show-current
git status --short
python --version
node --version
```

La branche doit être `feat/web-v1` et le working tree doit être propre avant toute nouvelle modification.

## 3. Lancer une démonstration Review déterministe

Cette démonstration ne nécessite ni YouTube, ni fournisseur LLM, ni données privées.

Terminal 1 — control plane et fixture locale :

```bash
cd cloudflare
npm run db:migrate:local
npm run db:seed:review
npm run dev -- --ip 0.0.0.0 --port 8787
```

`db:seed:review` remet uniquement la source locale `demo_source_review` à zéro, puis crée quatre fiches prêtes sur une playlist de dix-huit vidéos. Review doit afficher `4 sur 18` et la fiche « Construire des agents IA fiables ».

Terminal 2 — frontend :

```bash
cd web
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

Ouvrir le port **4173** proposé par Codespaces, puis aller sur `/review`. Le proxy Vite relaie `/api` vers le port 8787 dans le conteneur.

Pour remettre la fixture à zéro après un test Garder/Écarter :

```bash
cd cloudflare
npm run db:seed:review
```

## 4. Lancer le flux réel avec le worker

Cette étape nécessite des secrets. Ne jamais les écrire dans un fichier suivi.

1. Copier les exemples locaux :

```bash
cp .env.example .env
cp cloudflare/.dev.vars.example cloudflare/.dev.vars
```

2. Générer un token local long et placer la même valeur dans :

- `.env` → `SUMMARIZER_WORKER_TOKEN` ;
- `cloudflare/.dev.vars` → `WORKER_API_TOKEN`.

3. Dans `.env`, définir :

```text
SUMMARIZER_CONTROL_PLANE_URL=http://127.0.0.1:8787
```

4. Ajouter la clé du fournisseur LLM dans les **Codespaces secrets** ou dans `.env` local, jamais dans Git.
5. Démarrer le control plane et le frontend comme dans la section précédente.
6. Démarrer le worker depuis la racine :

```bash
python -m src.cli web-worker
```

Le worker est outbound-only. Une playlist est traitée vidéo par vidéo. Une vidéo en erreur ne doit pas bloquer les suivantes. Ne jamais supprimer globalement `input/`, `output/`, `cache/` ou `playlists/`.

## 5. Choix design à ne pas redécouvrir

- Direction sélectionnée : option 3, **Fluid Knowledge**.
- Adaptation demandée : interface blanche Apple-like, liquid glass discret.
- Cartes : blancs différenciés, bordures froides, blur et ombres faibles.
- Accent : bleu `#007aff`.
- `Garder` : bleu plein / texte blanc.
- `Écarter` : blanc / contour et texte bleus.
- Aucun bouton de décision vert ou rouge.
- Pas de thème sombre pour le Web V1 actuel.
- Référence : `docs/design/web-v1-review-fluid-light-reference.png`.
- Document autoritaire : `docs/WEB_V1_DESIGN_DECISIONS.md`.

Si de nouvelles références visuelles sont jointes, les traiter comme compléments tant que l'utilisateur ne demande pas explicitement de remplacer cette direction.

## 6. Étapes restantes, dans l'ordre

### Phase 15 — fermer la QA visuelle

1. Charger la fixture Review.
2. Capturer le rendu desktop à une taille proche de 1440 × 1024.
3. Comparer dans une même vue la capture et `docs/design/web-v1-review-fluid-light-reference.png`.
4. Vérifier précisément typographie, marges, hauteur du header, largeur de carte, rayon, ombres, blancs, progression, boutons et texte.
5. Corriger tous les écarts P0/P1/P2.
6. Refaire la capture et la comparaison.
7. Mettre `design-qa.md` à `final result: passed` seulement avec preuve navigateur.

Sortie attendue : aucun problème visuel P0/P1/P2 et aucune erreur console.

### Phase 16 — revue motion

1. Tester changement de carte, hover, pressed, progression, swipe et Undo.
2. Vérifier qu'un swipe suit le doigt, peut changer de direction et revient à l'origine sous le seuil.
3. Vérifier les flèches clavier hors champs éditables.
4. Activer `prefers-reduced-motion: reduce` et confirmer que toute l'information reste visible.
5. Éviter toute animation nouvelle sans fonction de feedback, d'état ou de continuité.

Sortie attendue : aucun mouvement gratuit ou bloquant ; gestes interrompables.

### Phase 17 — mobile et navigateurs

Valider au minimum :

- iPhone Safari autour de 390 × 844 ;
- iPad Safari autour de 1024 × 1366 ;
- Safari desktop ;
- Chromium desktop.

Tester Home → traitement → fiche → sélection transcript → ajout Note → autosave → retour Review → Garder/Écarter → Undo. Vérifier safe areas, clavier logiciel, rotation, scroll, sélection de texte et retour navigateur. Une émulation seule ne clôt pas le contrôle iOS réel.

### Phase 18 — sécurité

Rejouer les tests d'authentification navigateur et worker, lease invalide, payloads trop gros, URL invalide et traversal. Vérifier qu'aucun secret, transcript privé ou contenu de Note n'est ajouté aux logs ou au bundle frontend. Aucun problème haut/critique ne peut rester ouvert.

### Phase 19 — suite qualité complète

Depuis la racine :

```bash
python -m pytest -q
python -m black --check src tests
python -m ruff check src tests
python -m mypy src
```

Dans `web/` :

```bash
npm test
npm run lint
npm run build
```

Dans `cloudflare/` :

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Mypy doit rester à la baseline documentée de 17 erreurs ou être corrigé séparément ; ne pas masquer une régression avec `|| true`.

### Phase 20 — secrets et confidentialité

1. Inspecter `git status --short` et le diff complet.
2. Stager uniquement des chemins explicites, jamais `git add .`.
3. Lancer `detect-secrets` uniquement sur les fichiers modifiés/suivis concernés.
4. Vérifier explicitement l'absence de `.env`, `.dev.vars`, cookies, PDF, outputs, caches, playlists et transcripts locaux.
5. Vérifier que le bundle Vite ne contient aucune clé ou valeur privée.

### Phase 21 — documentation opératoire

Tester à froid toutes les commandes de ce runbook. Garder le README public concis. Documenter les variables par nom, sans valeur. Décrire le démarrage/arrêt du worker, la reprise de lease et les limites V1. Le PDF Web reste V2.

### Phase 22 — validation finale

Exécuter le parcours complet listé dans `docs/WEB_V1_IMPLEMENTATION_PLAN.md`, y compris export confirmé avant cleanup et entrée History. Corriger uniquement les défauts révélés. Toute modification de l'UX Frozen ou de l'architecture exige une nouvelle validation explicite.

## 7. Discipline Git et push

Avant chaque commit :

```bash
git status --short
git diff --check
git diff --stat
```

Stager les chemins concernés explicitement, lancer les tests proportionnés, scanner les secrets, puis :

```bash
git commit -m "type(scope): description"
git push origin feat/web-v1
```

Interdits : `git reset --hard`, `git clean -fd`, `git push --force`, suppression globale de données et commit de fichiers privés.

## 8. Critère de reprise réussie

La reprise est réussie lorsque la fixture Review s'affiche dans Codespaces, que les trois suites Web/Python/Cloudflare passent sans nouvelle régression et que `design-qa.md` contient des captures navigateur avec `final result: passed`.

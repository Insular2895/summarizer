<div align="center">

# 🎙️ Transcripts

**Téléchargeur automatique de sous-titres YouTube**

[![yt-dlp](https://img.shields.io/badge/powered%20by-yt--dlp-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![Shell](https://img.shields.io/badge/Shell-Bash-4EAA25?style=for-the-badge&logo=gnubash&logoColor=white)](https://www.gnu.org/software/bash/)
[![Platform](https://img.shields.io/badge/Platform-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://www.apple.com/macos/)

</div>

---

## ✨ Ce que ça fait

Télécharge automatiquement les sous-titres de playlists YouTube par batch, gère les rate limits, et convertit les `.srt` en `.txt` prêts à importer dans ChatGPT.

---

## 📁 Structure

```
transcripts/
├── run/
│   ├── run_transcripts.sh           ← script principal (usage général)
│   ├── run_transcripts_playlist2.sh ← variante playlist fixe
│   └── yt_transcribe_fallback.sh    ← fallback si pas de sous-titres
├── playlists/                       ← dossiers de sortie auto-générés
│   └── <Nom de la playlist>/        ← un dossier par playlist
└── cookies.txt                      ← authentification YouTube (⚠️ privé)
```

> **Note :** Le chemin exact des dossiers de sortie dépend de ta configuration. Dans cette installation, les playlists sont rangées dans `transcripts/playlists/<Nom de la playlist>/`. Si tu as une autre organisation, adapte les chemins en conséquence.

---

## 🚀 Utilisation

### 1. Prérequis

```bash
# Installer yt-dlp
brew install yt-dlp

# Exporter les cookies YouTube depuis le navigateur → cookies.txt
```

### 2. Lancer le téléchargement

Depuis le dossier du projet :

```bash
cd /Users/insular/transcripts
bash ./run/run_transcripts.sh "https://youtube.com/playlist?list=VOTRE_PLAYLIST_ID"
```

Le script télécharge les sous-titres par **batch de 20 vidéos** avec des pauses pour éviter les bans.

### 3. Convertir les SRT en TXT

> **Important :** Adapte `DIR` à ton propre chemin. Dans cette installation, les playlists sont dans `transcripts/playlists/<Nom de la playlist>`. Chez toi, le chemin peut être différent — vérifie avec `ls` où tes fichiers ont été téléchargés.

```bash
# Exemple avec cette installation :
DIR="/Users/insular/transcripts/playlists/Playlist 38"

# Adapte ce chemin selon ta propre structure, par exemple :
# DIR="/chemin/vers/tes/playlists/<Nom de la playlist>"

find "$DIR" -type f -name "*.srt" -exec sh -c '
for f do
  txt="${f%.srt}.txt"
  tmp="$txt.tmp"

  if sed -E "/^[0-9]+$/d;/-->/d;/^[[:space:]]*$/d" "$f" > "$tmp"; then
    mv "$tmp" "$txt" && rm "$f"
    echo "Converti : $f"
  else
    rm -f "$tmp"
    echo "Erreur : $f" >&2
  fi
done
' sh {} +
```

Cette commande supprime les numéros de séquence, les timestamps et les lignes vides, puis remplace chaque `.srt` par un `.txt` propre (le `.srt` n'est supprimé que si la conversion réussit).

---

## ⚙️ Workflow complet

```
📱 Partage de connexion iPhone
        ↓
🎬 Playlist YouTube créée
        ↓
🖥️  run_transcripts.sh <URL>
        ↓
📄 Fichiers .srt téléchargés dans playlists/<Nom>/
        ↓
🔄 Conversion SRT → TXT
        ↓
🤖 Import dans ChatGPT
```

---

## 🛠️ Dépannage

### 1. `yt-dlp` est installé mais Homebrew affiche une erreur de link

**Problème :**

```
Error: The `brew link` step did not complete successfully
Could not symlink bin/yt-dlp
Target /opt/homebrew/bin/yt-dlp already exists
```

**Cause :** Un ancien fichier `yt-dlp` existe déjà dans `/opt/homebrew/bin` ou dans un autre dossier prioritaire du `PATH`.

Vérifier quelle version est utilisée :

```bash
which -a yt-dlp
yt-dlp --version
```

Si le terminal affiche `/Users/insular/bin/yt-dlp`, ce n'est pas la version Homebrew qui est prioritaire.

**Correction :**

```bash
mv ~/bin/yt-dlp ~/bin/yt-dlp.old
brew link --overwrite yt-dlp
hash -r
which yt-dlp
```

Résultat attendu : `/opt/homebrew/bin/yt-dlp`

---

### 2. Ne pas réinstaller yt-dlp à chaque nouveau terminal

Il n'est pas nécessaire de refaire `brew install yt-dlp` à chaque ouverture de terminal. L'installation Homebrew est globale sur le Mac.

Dans un nouveau terminal, vérifier simplement :

```bash
which yt-dlp
yt-dlp --version
```

Si le résultat est `/opt/homebrew/bin/yt-dlp`, tout est bon.

Pour mettre à jour yt-dlp plus tard :

```bash
brew update
brew upgrade yt-dlp
```

---

### 3. Message macOS sur zsh

**Problème :**

```
The default interactive shell is now zsh.
To update your account to use zsh, please run `chsh -s /bin/zsh`.
```

Ce n'est pas une erreur. Ce message apparaît quand on lance manuellement `bash`. macOS indique simplement que le shell par défaut moderne est zsh.

Pour lancer le script, ne pas taper seulement `bash`. Utiliser :

```bash
bash ./run/run_transcripts.sh "URL_DE_LA_PLAYLIST"
```

ou rendre le script exécutable :

```bash
chmod +x ./run/run_transcripts.sh
./run/run_transcripts.sh "URL_DE_LA_PLAYLIST"
```

---

### 4. Erreur `No such file or directory`

**Problème :**

```
find: /Users/insular/transcripts/Playlist 38: No such file or directory
```

**Cause :** Les playlists ne sont pas directement dans `transcripts/` — elles sont dans le sous-dossier `playlists/`.

Vérifier les dossiers disponibles :

```bash
ls -la /Users/insular/transcripts/playlists
```

Puis définir le bon chemin :

```bash
DIR="/Users/insular/transcripts/playlists/Playlist 38"
```

> Le chemin exact dépend de ta structure. Utilise `ls` pour trouver où tes fichiers ont été téléchargés avant de lancer la conversion.

---

### 5. Ne pas garder les chevrons `< >` dans les chemins

Les chevrons sont des placeholders dans les exemples — ils indiquent ce qu'il faut remplacer par le vrai nom.

| | Exemple |
|---|---|
| ❌ Mauvais | `DIR="/Users/insular/transcripts/<Playlist 38>"` |
| ✓ Bon | `DIR="/Users/insular/transcripts/playlists/Playlist 38"` |

---

### 6. Autres problèmes courants

| Problème | Solution |
|---|---|
| 🔴 Téléchargement bloqué | `yt-dlp -U` puis relancer |
| 🔑 Cookies expirés | Réexporter `cookies.txt` depuis le navigateur |
| 🔇 Pas de sous-titres `.en` | Utiliser `yt_transcribe_fallback.sh` |
| ⚠️ Erreur 429 | Augmenter `--sleep-interval` dans le script |

---

<div align="center">

Made with ☕ — propulsé par [yt-dlp](https://github.com/yt-dlp/yt-dlp)

</div>

#!/usr/bin/env bash
set -euo pipefail

select_system_python() {
  if command -v python3.11 >/dev/null 2>&1; then
    printf '%s\n' "python3.11"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    if python3 - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY
    then
      printf '%s\n' "python3"
      return
    fi
  fi

  echo "Python 3.11 or newer is required." >&2
  echo "Install Python 3.11+, then run the command again." >&2
  exit 1
}

install_base_dependencies() {
  echo "[setup] Installing base dependencies from requirements.txt"
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -r "$ROOT_DIR/requirements.txt"
  touch "$ROOT_DIR/.venv/.summarizer-runtime-ready"
}

ensure_runtime() {
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
    if [[ ! -f "$ROOT_DIR/.venv/.summarizer-runtime-ready" ]]; then
      install_base_dependencies
    fi
    return
  fi

  local system_python
  system_python="$(select_system_python)"

  echo "[setup] Creating local Python environment: .venv"
  "$system_python" -m venv "$ROOT_DIR/.venv"

  PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
  install_base_dependencies
}

ensure_env_file() {
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "[setup] Created .env from .env.example"
    echo
    echo "Add your Gemini API key in .env, then run this command again:"
    echo "  GEMINI_API_KEY=your_real_api_key"
    exit 1
  fi

  if ! grep -Eq '^GEMINI_API_KEY=' "$ROOT_DIR/.env" \
    || grep -Eq '^GEMINI_API_KEY=(your_api_key_here|ta_cle_api_gemini|ta_vraie_cle_api)?[[:space:]]*$' "$ROOT_DIR/.env"; then
    echo "Gemini API key is missing in .env."
    echo "Edit .env and set:"
    echo "  GEMINI_API_KEY=your_real_api_key"
    exit 1
  fi
}

print_runtime_status() {
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    if [[ -f "$ROOT_DIR/.venv/.summarizer-runtime-ready" ]]; then
      echo "  Runtime: .venv is ready"
    else
      echo "  Runtime: .venv exists; dependencies will be checked on first run"
    fi
  else
    echo "  Runtime: .venv will be created automatically on first run"
  fi

  if [[ -f "$ROOT_DIR/.env" ]]; then
    if ! grep -Eq '^GEMINI_API_KEY=' "$ROOT_DIR/.env" \
      || grep -Eq '^GEMINI_API_KEY=(your_api_key_here|ta_cle_api_gemini|ta_vraie_cle_api)?[[:space:]]*$' "$ROOT_DIR/.env"; then
      echo "  Gemini key: .env exists but needs a real GEMINI_API_KEY"
    else
      echo "  Gemini key: .env is configured"
    fi
  else
    echo "  Gemini key: .env will be created automatically on first run"
  fi
}

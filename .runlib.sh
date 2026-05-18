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

activate_pdf_engine_bins() {
  if [[ -d "$ROOT_DIR/.engine-bin" ]]; then
    export PATH="$ROOT_DIR/.engine-bin:$PATH"
  fi
}

print_pdf_engine_status() {
  activate_pdf_engine_bins

  echo "  OCRmyPDF: $(engine_status ocrmypdf)"
  echo "  MinerU:   $(engine_status mineru)"
  echo "  Marker:   $(engine_status marker_single)"
}

engine_status() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'available at %s\n' "$(command -v "$command_name")"
  else
    printf 'not installed\n'
  fi
}

install_pdf_engines() {
  local download_mineru_models="${1:-false}"
  mkdir -p "$ROOT_DIR/.engine-bin"

  echo "[setup] Installing optional PDF engines in isolated local environments."
  echo "[setup] This can take a while. Engines are kept outside the base .venv."

  install_python_engine "OCRmyPDF" ".venv-ocrmypdf" "requirements-pdf-ocrmypdf.txt" \
    "ocrmypdf" "python-module:ocrmypdf" || true

  install_python_engine "MinerU" ".venv-mineru" "requirements-pdf-mineru.txt" \
    "mineru" "script:mineru" || true

  if [[ "$download_mineru_models" == "true" ]] && [[ -x "$ROOT_DIR/.venv-mineru/bin/mineru-models-download" ]]; then
    echo "[setup] Downloading MinerU models."
    "$ROOT_DIR/.venv-mineru/bin/mineru-models-download" --source modelscope --model_type pipeline || true
  fi

  install_python_engine "Marker" ".venv-marker" "requirements-pdf-marker.txt" \
    "marker_single" "script:marker_single" || true

  echo
  echo "PDF engine status:"
  print_pdf_engine_status
  echo
  echo "Important macOS: OCRmyPDF may need tesseract, ghostscript and qpdf."
  echo "Install them with: brew install ocrmypdf"
}

install_python_engine() {
  local display_name="$1"
  local venv_name="$2"
  local requirements_file="$3"
  local wrapper_name="$4"
  local wrapper_target="$5"
  local venv_path="$ROOT_DIR/$venv_name"

  if [[ ! -f "$ROOT_DIR/$requirements_file" ]]; then
    echo "[setup] Skip $display_name: missing $requirements_file"
    return 1
  fi

  local system_python
  system_python="$(select_system_python)"

  if [[ ! -x "$venv_path/bin/python" ]]; then
    echo "[setup] Creating $display_name environment: $venv_name"
    "$system_python" -m venv "$venv_path"
  fi

  echo "[setup] Installing $display_name from $requirements_file"
  "$venv_path/bin/python" -m pip install --upgrade pip
  "$venv_path/bin/python" -m pip install -r "$ROOT_DIR/$requirements_file"

  write_engine_wrapper "$wrapper_name" "$venv_path" "$wrapper_target"
}

write_engine_wrapper() {
  local wrapper_name="$1"
  local venv_path="$2"
  local wrapper_target="$3"
  local wrapper_path="$ROOT_DIR/.engine-bin/$wrapper_name"

  case "$wrapper_target" in
    python-module:*)
      local module_name="${wrapper_target#python-module:}"
      cat >"$wrapper_path" <<EOF
#!/usr/bin/env bash
exec "$venv_path/bin/python" -m "$module_name" "\$@"
EOF
      ;;
    script:*)
      local script_name="${wrapper_target#script:}"
      cat >"$wrapper_path" <<EOF
#!/usr/bin/env bash
exec "$venv_path/bin/$script_name" "\$@"
EOF
      ;;
    *)
      echo "Unknown wrapper target: $wrapper_target" >&2
      return 1
      ;;
  esac

  chmod +x "$wrapper_path"
}

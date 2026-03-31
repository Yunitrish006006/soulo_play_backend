#!/usr/bin/env bash
set -euo pipefail

# Optional overrides:
# export FRONTEND_DIR="/path/to/flutter_web_repo"
# export VERSION="0.2.0"
# export VERSION_BUMP="auto"          # auto|major|minor|patch|none
# export WRANGLER_VERSION="latest"    # latest or explicit version
# export KV_NAMESPACE_ID="..."
# export KV_BINDING="STATIC_ASSETS"
# export DEPLOY_BASE_URL="https://example.workers.dev"
# export SMOKE_ROOT_PATH="/"
# export SMOKE_LOGIN_PATH="/login"
# export SMOKE_HEALTH_PATH="/api/health"
# export SMOKE_HEALTH_EXPECT='"ok":true'

WRANGLER_VERSION="${WRANGLER_VERSION:-latest}"
VERSION_BUMP="${VERSION_BUMP:-auto}"
SMOKE_ROOT_PATH="${SMOKE_ROOT_PATH:-/}"
SMOKE_LOGIN_PATH="${SMOKE_LOGIN_PATH:-/login}"
SMOKE_HEALTH_PATH="${SMOKE_HEALTH_PATH:-/api/health}"
SMOKE_HEALTH_EXPECT="${SMOKE_HEALTH_EXPECT:-\"ok\":true}"

CC_MINOR_TYPES=(feat)
CC_PATCH_TYPES=(fix perf refactor)
CC_NONE_TYPES=(docs test build ci chore style revert)

CC_VERSION_IGNORED_PATHS=(
  assets.json
  pubspec.lock
  package-lock.json
  lib/constants/generated/locale_catalog.g.dart
)

CC_VERSION_MINOR_PATHS=(
  migrations/*
  web/*
  lib/main.dart
  lib/models/*
  lib/pages/*
)

CC_VERSION_PATCH_PATHS=(
  deploy.sh
  wrangler.jsonc
  wrangler.json
  upload.js
  tool/*
  tests/*
  assets/i18n/*
  lib/constants/*
  lib/services/*
  index.js
  package.json
  pubspec.yaml
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}"
RULES_FILE="${SCRIPT_DIR}/conventional_commit_rules.sh"

if [[ -f "${RULES_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${RULES_FILE}"
fi

log_section() {
  printf '\n======================================\n'
  printf '%s\n' "$1"
  printf '======================================\n'
}

log_step() {
  printf '\n[%s] %s\n' "$1" "$2"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  command -v "${command_name}" >/dev/null 2>&1 || fail "Required command not found: ${command_name}"
}

resolve_flutter_command() {
  if [[ -n "${FLUTTER_BIN:-}" ]]; then
    [[ -x "${FLUTTER_BIN}" ]] || fail "FLUTTER_BIN is not executable: ${FLUTTER_BIN}"
    printf '%s\n' "${FLUTTER_BIN}"
    return 0
  fi

  if command -v flutter >/dev/null 2>&1; then
    command -v flutter
    return 0
  fi

  local candidate
  for candidate in \
    "${HOME}/flutter/bin/flutter" \
    "${HOME}/development/flutter/bin/flutter" \
    "${HOME}/dev/flutter/bin/flutter" \
    "${HOME}/sdk/flutter/bin/flutter" \
    "${HOME}/fvm/default/bin/flutter" \
    "/opt/flutter/bin/flutter" \
    "/opt/homebrew/Caskroom/flutter/latest/flutter/bin/flutter"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

version_bump_rank() {
  case "$1" in
    none) printf '0\n' ;;
    patch) printf '1\n' ;;
    minor) printf '2\n' ;;
    major) printf '3\n' ;;
    *) printf '0\n' ;;
  esac
}

max_version_bump() {
  local left_rank right_rank
  left_rank="$(version_bump_rank "$1")"
  right_rank="$(version_bump_rank "$2")"
  if (( right_rank > left_rank )); then
    printf '%s\n' "$2"
  else
    printf '%s\n' "$1"
  fi
}

normalize_version_bump() {
  case "$1" in
    auto|major|minor|patch|none) printf '%s\n' "$1" ;;
    *) printf 'auto\n' ;;
  esac
}

array_contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "${item}" == "${needle}" ]]; then
      return 0
    fi
  done
  return 1
}

path_matches_patterns() {
  local path="$1"
  shift
  local pattern
  for pattern in "$@"; do
    case "${path}" in
      ${pattern}) return 0 ;;
    esac
  done
  return 1
}

is_ignored_version_path() {
  path_matches_patterns "$1" "${CC_VERSION_IGNORED_PATHS[@]}"
}

is_minor_change_path() {
  path_matches_patterns "$1" "${CC_VERSION_MINOR_PATHS[@]}"
}

is_patch_change_path() {
  path_matches_patterns "$1" "${CC_VERSION_PATCH_PATHS[@]}"
}

commit_message_version_bump() {
  local subject="$1"
  local body="$2"
  local type breaking=""
  local conventional_regex='^([A-Za-z]+)(\([^)]+\))?(!)?:[[:space:]]'

  if [[ "${subject}" =~ ${conventional_regex} ]]; then
    type="${BASH_REMATCH[1],,}"
    breaking="${BASH_REMATCH[3]:-}"
  else
    printf 'none\n'
    return 0
  fi

  if [[ -n "${breaking}" || "${body}" == *"BREAKING CHANGE:"* || "${body}" == *"BREAKING-CHANGE:"* ]]; then
    printf 'major\n'
    return 0
  fi

  if array_contains "${type}" "${CC_MINOR_TYPES[@]}"; then
    printf 'minor\n'
  elif array_contains "${type}" "${CC_PATCH_TYPES[@]}"; then
    printf 'patch\n'
  elif array_contains "${type}" "${CC_NONE_TYPES[@]}"; then
    printf 'none\n'
  else
    printf 'none\n'
  fi
}

bump_semver() {
  local version="$1"
  local bump="$2"
  local major minor patch

  IFS='.' read -r major minor patch <<< "${version}"
  major="${major:-0}"
  minor="${minor:-0}"
  patch="${patch:-0}"

  case "${bump}" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    patch)
      patch=$((patch + 1))
      ;;
    none)
      ;;
    *)
      fail "Unsupported version bump: ${bump}"
      ;;
  esac

  printf '%s.%s.%s\n' "${major}" "${minor}" "${patch}"
}

ensure_semver() {
  local version="$1"
  if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    fail "Version must be pure semver (for example 0.2.0). Received: ${version}"
  fi
}

resolve_git_root() {
  local directory="$1"
  git -C "${directory}" rev-parse --show-toplevel 2>/dev/null || true
}

resolve_version_anchor_epoch() {
  local git_root
  git_root="$(resolve_git_root "${FRONTEND_DIR}")"
  if [[ -z "${git_root}" ]]; then
    return 0
  fi

  git -C "${git_root}" log -n1 --format=%ct -- pubspec.yaml 2>/dev/null || true
}

detect_repo_version_bump() {
  local repo_dir="$1"
  local git_root
  git_root="$(resolve_git_root "${repo_dir}")"
  if [[ -z "${git_root}" ]]; then
    printf 'none\n'
    return 0
  fi

  local line status path trimmed_path detected_bump="none"
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    status="${line:0:2}"
    path="${line:3}"
    trimmed_path="${path##* -> }"

    if is_ignored_version_path "${trimmed_path}"; then
      continue
    fi

    if is_minor_change_path "${trimmed_path}"; then
      detected_bump="$(max_version_bump "${detected_bump}" "minor")"
      continue
    fi

    if [[ "${status}" == *"A"* || "${status}" == *"D"* ]]; then
      detected_bump="$(max_version_bump "${detected_bump}" "minor")"
      continue
    fi

    if is_patch_change_path "${trimmed_path}"; then
      detected_bump="$(max_version_bump "${detected_bump}" "patch")"
    fi
  done < <(git -C "${git_root}" status --short --untracked-files=all)

  printf '%s\n' "${detected_bump}"
}

detect_repo_commit_version_bump() {
  local repo_dir="$1"
  local since_epoch="$2"
  local git_root
  git_root="$(resolve_git_root "${repo_dir}")"
  if [[ -z "${git_root}" || -z "${since_epoch}" ]]; then
    printf 'none\n'
    return 0
  fi

  local detected_bump="none"
  local record subject body commit_bump
  while IFS= read -r -d $'\x1e' record; do
    [[ -z "${record}" ]] && continue
    subject="${record%%$'\x1f'*}"
    body="${record#*$'\x1f'}"
    if [[ "${body}" == "${record}" ]]; then
      body=""
    fi
    commit_bump="$(commit_message_version_bump "${subject}" "${body}")"
    detected_bump="$(max_version_bump "${detected_bump}" "${commit_bump}")"
  done < <(git -C "${git_root}" log --format='%s%x1f%b%x1e' --since="@${since_epoch}" && printf '\x1e')

  printf '%s\n' "${detected_bump}"
}

detect_auto_version_bump() {
  local anchor_epoch commit_backend_bump commit_frontend_bump path_backend_bump path_frontend_bump detected_bump="none"

  anchor_epoch="$(resolve_version_anchor_epoch)"
  commit_backend_bump="$(detect_repo_commit_version_bump "${BACKEND_DIR}" "${anchor_epoch}")"
  commit_frontend_bump="$(detect_repo_commit_version_bump "${FRONTEND_DIR}" "${anchor_epoch}")"
  path_backend_bump="$(detect_repo_version_bump "${BACKEND_DIR}")"
  path_frontend_bump="$(detect_repo_version_bump "${FRONTEND_DIR}")"

  detected_bump="$(max_version_bump "${detected_bump}" "${commit_backend_bump}")"
  detected_bump="$(max_version_bump "${detected_bump}" "${commit_frontend_bump}")"
  detected_bump="$(max_version_bump "${detected_bump}" "${path_backend_bump}")"
  detected_bump="$(max_version_bump "${detected_bump}" "${path_frontend_bump}")"

  printf '%s\n' "${detected_bump}"
}

resolve_version_bump() {
  local requested_bump normalized_bump
  requested_bump="$1"
  normalized_bump="$(normalize_version_bump "${requested_bump}")"

  case "${normalized_bump}" in
    auto)
      detect_auto_version_bump
      ;;
    *)
      printf '%s\n' "${normalized_bump}"
      ;;
  esac
}

resolve_wrangler_package() {
  if [[ "${WRANGLER_VERSION}" != "latest" ]]; then
    printf 'wrangler@%s\n' "${WRANGLER_VERSION}"
    return 0
  fi

  local resolved_version
  resolved_version="$(npm view wrangler version 2>/dev/null || true)"
  if [[ -n "${resolved_version}" ]]; then
    printf 'wrangler@%s\n' "${resolved_version}"
  else
    printf 'wrangler@latest\n'
  fi
}

resolve_frontend_dir() {
  if [[ -n "${FRONTEND_DIR:-}" ]]; then
    if [[ -f "${FRONTEND_DIR}/pubspec.yaml" ]]; then
      printf '%s\n' "${FRONTEND_DIR}"
      return 0
    fi
    fail "FRONTEND_DIR does not contain pubspec.yaml: ${FRONTEND_DIR}"
  fi

  local backend_name parent_dir sibling_name
  backend_name="$(basename "${BACKEND_DIR}")"
  parent_dir="$(cd "${BACKEND_DIR}/.." && pwd)"
  sibling_name="${backend_name%_backend}"
  sibling_name="${sibling_name%-backend}"

  local candidates=()
  if [[ -n "${sibling_name}" && "${sibling_name}" != "${backend_name}" ]]; then
    candidates+=(
      "${parent_dir}/${sibling_name}"
      "${parent_dir}/${sibling_name}_front"
      "${parent_dir}/${sibling_name}_frontend"
      "${parent_dir}/${sibling_name}-front"
      "${parent_dir}/${sibling_name}-frontend"
    )
  fi

  candidates+=(
    "${parent_dir}/front"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}/pubspec.yaml" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  while IFS= read -r candidate; do
    [[ -z "${candidate}" ]] && continue
    if [[ "${candidate}" != "${BACKEND_DIR}" && -f "${candidate}/pubspec.yaml" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done < <(find "${parent_dir}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

  fail "Unable to locate Flutter frontend directory. Set FRONTEND_DIR or place the app next to the backend repo."
}

detect_wrangler_config() {
  if [[ -n "${WRANGLER_CONFIG:-}" ]]; then
    printf '%s\n' "${WRANGLER_CONFIG}"
    return 0
  fi

  local candidate
  for candidate in "${BACKEND_DIR}/wrangler.jsonc" "${BACKEND_DIR}/wrangler.json"; do
    if [[ -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  printf '%s\n' "${BACKEND_DIR}/wrangler.jsonc"
}

update_pubspec_version() {
  local pubspec_path="$1"
  local new_version="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v new_version="${new_version}" '
    BEGIN { replaced = 0 }
    {
      if (!replaced && $0 ~ /^version:[[:space:]]*[^[:space:]]+/) {
        print "version: " new_version
        replaced = 1
      } else {
        print
      }
    }
    END {
      if (!replaced) {
        print "version: " new_version
      }
    }
  ' "${pubspec_path}" > "${tmp_file}"

  mv "${tmp_file}" "${pubspec_path}"
}

capture_first_url() {
  local output_path="$1"
  local url
  url="$(grep -Eo 'https://[^[:space:]]+workers\.dev[^[:space:]]*' "${output_path}" | head -n1 || true)"
  if [[ -n "${url}" ]]; then
    printf '%s\n' "${url}"
    return 0
  fi

  url="$(grep -Eo 'https://[^[:space:]]+' "${output_path}" | head -n1 || true)"
  if [[ -n "${url}" ]]; then
    printf '%s\n' "${url}"
  fi
}

WRANGLER_PACKAGE="$(resolve_wrangler_package)"
FRONTEND_DIR="$(resolve_frontend_dir)"
PUBSPEC="${FRONTEND_DIR}/pubspec.yaml"
WRANGLER_CONFIG="$(detect_wrangler_config)"
ASSETS_PATH="${ASSETS_PATH:-${BACKEND_DIR}/assets.json}"
UPLOAD_SCRIPT="${UPLOAD_SCRIPT:-${BACKEND_DIR}/upload.js}"
LOCALE_GENERATOR="${FRONTEND_DIR}/tool/generate_locale_catalog.dart"

require_command git
require_command npm
require_command node
require_command curl
FLUTTER_COMMAND="$(resolve_flutter_command || true)"

FULL_VERSION="$(sed -nE 's/^version:[[:space:]]*([^[:space:]]+).*/\1/p' "${PUBSPEC}" | head -n1)"
if [[ -z "${FULL_VERSION}" ]]; then
  fail "Failed to read version from ${PUBSPEC}"
fi

BASE_VERSION="${FULL_VERSION%%+*}"
ensure_semver "${BASE_VERSION}"

RESOLVED_VERSION_BUMP="none"
VERSION="${VERSION:-}"
if [[ -n "${VERSION}" ]]; then
  ensure_semver "${VERSION}"
  RESOLVED_VERSION_BUMP="manual"
else
  RESOLVED_VERSION_BUMP="$(resolve_version_bump "${VERSION_BUMP}")"
  VERSION="$(bump_semver "${BASE_VERSION}" "${RESOLVED_VERSION_BUMP}")"
fi

log_section "Soulo Play Deployment"
printf 'Version: %s\n' "${VERSION}"
printf 'Version bump: %s (base %s)\n' "${RESOLVED_VERSION_BUMP}" "${BASE_VERSION}"
printf 'Frontend: %s\n' "${FRONTEND_DIR}"
printf 'Backend: %s\n' "${BACKEND_DIR}"
printf 'Wrangler: %s\n' "${WRANGLER_PACKAGE}"

log_step "1/6" "Generating locale catalog"
cd "${FRONTEND_DIR}"
if [[ -f "${LOCALE_GENERATOR}" ]]; then
  require_command dart
  printf 'Running: dart run tool/generate_locale_catalog.dart\n'
  dart run tool/generate_locale_catalog.dart
else
  printf 'Locale generator not found, skipping.\n'
fi

log_step "2/6" "Building Flutter web"
if [[ -n "${FLUTTER_COMMAND}" ]]; then
  printf 'Running: %s build web --release --build-name=%s\n' "${FLUTTER_COMMAND}" "${VERSION}"
  "${FLUTTER_COMMAND}" build web --release --build-name="${VERSION}"
else
  if [[ -f "${FRONTEND_DIR}/build/web/index.html" ]]; then
    printf 'Flutter command not found. Reusing existing web build at %s\n' "${FRONTEND_DIR}/build/web"
  else
    fail "Flutter command not found and no existing web build output is available."
  fi
fi

log_step "3/6" "Generating asset manifest"
cd "${BACKEND_DIR}"
if [[ -f "${UPLOAD_SCRIPT}" ]]; then
  printf 'Running: node %s\n' "$(basename "${UPLOAD_SCRIPT}")"
  node "${UPLOAD_SCRIPT}"
else
  printf 'upload.js not found, skipping asset manifest generation.\n'
fi

log_step "4/6" "Deploying Workers"
if [[ ! -f "${WRANGLER_CONFIG}" ]]; then
  fail "Wrangler config not found: ${WRANGLER_CONFIG}"
fi

deploy_output_file="$(mktemp)"
if ! npm exec --package="${WRANGLER_PACKAGE}" -- wrangler deploy 2>&1 | tee "${deploy_output_file}"; then
  rm -f "${deploy_output_file}"
  fail "wrangler deploy failed"
fi

BASE_URL="${DEPLOY_BASE_URL:-$(capture_first_url "${deploy_output_file}")}"
rm -f "${deploy_output_file}"

if [[ -z "${BASE_URL}" ]]; then
  fail "Unable to determine deployment URL. Set DEPLOY_BASE_URL and run again."
fi

log_step "5/6" "Uploading assets to KV"
if [[ -f "${ASSETS_PATH}" ]]; then
  if [[ -n "${KV_NAMESPACE_ID:-}" ]]; then
    printf 'Running: npm exec --package=%s -- wrangler kv bulk put %s --namespace-id %s --remote\n' "${WRANGLER_PACKAGE}" "${ASSETS_PATH}" "${KV_NAMESPACE_ID}"
    npm exec --package="${WRANGLER_PACKAGE}" -- wrangler kv bulk put "${ASSETS_PATH}" --namespace-id "${KV_NAMESPACE_ID}" --remote
  else
    KV_TARGET_BINDING="${KV_BINDING:-STATIC_ASSETS}"
    if [[ ! -f "${WRANGLER_CONFIG}" ]]; then
      fail "assets.json exists but no Wrangler config was found for binding resolution: ${WRANGLER_CONFIG}"
    fi
    printf 'Running: npm exec --package=%s -- wrangler kv bulk put %s --binding %s --remote\n' "${WRANGLER_PACKAGE}" "${ASSETS_PATH}" "${KV_TARGET_BINDING}"
    if ! npm exec --package="${WRANGLER_PACKAGE}" -- wrangler kv bulk put "${ASSETS_PATH}" --binding "${KV_TARGET_BINDING}" --remote; then
      fail "KV upload failed. If this is your first deploy, confirm wrangler deploy succeeded and the STATIC_ASSETS binding exists."
    fi
  fi
else
  printf 'assets.json not found, skipping KV upload.\n'
fi

log_step "6/6" "Running smoke tests"
printf 'Base URL: %s\n' "${BASE_URL}"

ROOT_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}${SMOKE_ROOT_PATH}" || true)"
LOGIN_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}${SMOKE_LOGIN_PATH}" || true)"
HEALTH_BODY="$(curl -sS "${BASE_URL}${SMOKE_HEALTH_PATH}" || true)"

if [[ "${ROOT_STATUS}" != "200" ]]; then
  fail "Smoke test failed for ${SMOKE_ROOT_PATH} (status ${ROOT_STATUS})"
fi

if [[ "${LOGIN_STATUS}" != "200" ]]; then
  fail "Smoke test failed for ${SMOKE_LOGIN_PATH} (status ${LOGIN_STATUS})"
fi

if [[ "${HEALTH_BODY}" != *"${SMOKE_HEALTH_EXPECT}"* ]]; then
  printf 'Unexpected health response: %s\n' "${HEALTH_BODY}" >&2
  fail "Smoke test failed for ${SMOKE_HEALTH_PATH}"
fi

update_pubspec_version "${PUBSPEC}" "${VERSION}"

log_section "Deployment Successful"
printf 'Version: %s\n' "${VERSION}"
printf 'URL: %s\n' "${BASE_URL}"
printf 'pubspec.yaml updated to: %s\n' "${VERSION}"

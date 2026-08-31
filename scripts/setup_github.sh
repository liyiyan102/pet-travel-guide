#!/bin/bash
# 初始化 git、脱敏密钥后推送到 GitHub
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$PATH"

echo "==> scrub secrets reminder: ensure api keys use env vars before commit"

# Install gh if missing
if ! command -v gh >/dev/null 2>&1; then
  VER=2.62.0
  ARCH=$(uname -m)
  case "$ARCH" in
    arm64|aarch64) GH_ARCH=arm64 ;;
    *) GH_ARCH=amd64 ;;
  esac
  OUT=/tmp/gh_${VER}.zip
  echo "==> downloading gh ${VER} (${GH_ARCH})"
  curl -L --retry 3 --connect-timeout 30 -o "$OUT" \
    "https://github.com/cli/cli/releases/download/v${VER}/gh_${VER}_macOS_${GH_ARCH}.zip"
  rm -rf /tmp/gh_extract && mkdir -p /tmp/gh_extract "$HOME/.local/bin"
  unzip -q "$OUT" -d /tmp/gh_extract
  cp "$(find /tmp/gh_extract -name gh -type f | head -1)" "$HOME/.local/bin/gh"
  chmod +x "$HOME/.local/bin/gh"
fi

gh --version
if ! gh auth status >/dev/null 2>&1; then
  echo "请先登录 GitHub："
  echo "  gh auth login"
  exit 1
fi

REPO_NAME="${1:-pet-travel-guide}"
VISIBILITY="${2:-private}"

if [ ! -d .git ]; then
  git init -b main
fi

git add -A
if git diff --cached --quiet; then
  echo "nothing to commit"
else
  git commit -m "$(cat <<'EOF'
Initial commit: WagTrip pet-friendly travel agent

EOF
)"
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "origin already exists: $(git remote get-url origin)"
else
  gh repo create "$REPO_NAME" --"$VISIBILITY" --source=. --remote=origin --push
fi

git push -u origin main
echo "DONE: $(gh repo view --json url -q .url)"

#!/usr/bin/env bash
set -Eeuo pipefail

base=/data/jack-cases
repository="$base/repository.git"
releases="$base/releases"
sha="${1:-}"

if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "expected a full lowercase commit SHA" >&2
  exit 2
fi

install -d -o root -g root -m 0755 "$base" "$releases"
install -d -o jack-cases -g jack-cases -m 0750 "$base/home"
exec 9>"$base/deploy.lock"
flock 9

if [[ ! -d "$repository" ]]; then
  git clone --bare https://github.com/tans/jack-cases.git "$repository"
fi
git --git-dir="$repository" fetch --prune origin +refs/heads/main:refs/remotes/origin/main
git --git-dir="$repository" cat-file -e "$sha^{commit}"
git --git-dir="$repository" merge-base --is-ancestor "$sha" refs/remotes/origin/main || {
  echo "commit is not reachable from origin/main" >&2
  exit 1
}

release="$releases/$sha"
if [[ ! -f "$release/apps/api/dist/server.js" || ! -f "$release/apps/web/dist/index.html" ]]; then
  rm -rf "$release"
  install -d -o jack-cases -g jack-cases -m 0755 "$release"
  if ! { git --git-dir="$repository" archive "$sha" | tar -x -C "$release" &&
    chown -R jack-cases:jack-cases "$release" &&
    runuser -u jack-cases -- env HOME="$base/home" npm_config_nodedir=/usr npm ci --prefix "$release" &&
    runuser -u jack-cases -- env HOME="$base/home" npm --prefix "$release" run build; }; then
    rm -rf "$release"
    exit 1
  fi
fi

previous=""
if [[ -L "$base/current" ]]; then
  previous="$(readlink -f "$base/current")"
fi
rm -f "$base/current.next"
ln -s "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"

if ! systemctl restart jack-cases.service || ! systemctl is-active --quiet jack-cases.service; then
  if [[ -n "$previous" ]]; then
    ln -s "$previous" "$base/current.rollback"
    mv -Tf "$base/current.rollback" "$base/current"
    systemctl restart jack-cases.service || true
  fi
  echo "service failed after release activation; rollback attempted" >&2
  exit 1
fi

for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then
    printf '%s\n' "$sha" > "$base/shared/DEPLOYED_COMMIT"
    echo "deployed $sha"
    exit 0
  fi
  sleep 2
done

if [[ -n "$previous" ]]; then
  ln -s "$previous" "$base/current.rollback"
  mv -Tf "$base/current.rollback" "$base/current"
  systemctl restart jack-cases.service || true
fi
echo "API health check failed; rollback attempted" >&2
exit 1

#!/usr/bin/env bash
set -Eeuo pipefail

base=/data/jack-cases
repository="$base/repository.git"
releases="$base/releases"
site=/opt/1panel/apps/openresty/openresty/www/sites/jack-cases.minapp.xin
sha="${1:-}"

if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "expected a full lowercase commit SHA" >&2
  exit 2
fi

install -d -o root -g root -m 0755 "$base" "$releases"
install -d -o jack-cases -g jack-cases -m 0750 "$base/home"
exec 9>"$base/deploy.lock"
flock 9

retry_git_fetch() {
  local attempt=1
  until git --git-dir="$repository" fetch --prune origin +refs/heads/main:refs/remotes/origin/main; do
    if (( attempt >= 5 )); then
      echo "GitHub fetch failed after $attempt attempts" >&2
      return 1
    fi
    echo "GitHub fetch failed (attempt $attempt/5); retrying" >&2
    sleep "$attempt"
    attempt=$((attempt + 1))
  done
}

if [[ ! -d "$repository" ]]; then
  git clone --bare https://github.com/tans/jack-cases.git "$repository"
fi
retry_git_fetch
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

static_release="$site/releases/$sha"
if [[ ! -f "$static_release/index.html" ]]; then
  rm -rf "$static_release"
  install -d -o root -g root -m 0755 "$static_release"
  cp -a "$release/apps/web/dist/." "$static_release/"
fi

previous=""
if [[ -L "$base/current" ]]; then
  previous="$(readlink -f "$base/current")"
fi
previous_static=""
if [[ -L "$site/current" ]]; then
  previous_static="$(readlink "$site/current")"
fi
rollback() {
  if [[ -n "$previous" ]]; then
    ln -sfn "$previous" "$base/current.rollback"
    mv -Tf "$base/current.rollback" "$base/current"
  else
    rm -f "$base/current"
  fi
  if [[ -n "$previous_static" ]]; then
    ln -sfn "$previous_static" "$site/current.rollback"
    mv -Tf "$site/current.rollback" "$site/current"
  else
    rm -f "$site/current"
  fi
  systemctl restart jack-cases.service || true
}
rm -f "$base/current.next"
ln -s "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"

if ! systemctl restart jack-cases.service || ! systemctl is-active --quiet jack-cases.service; then
  rollback
  echo "service failed after release activation; rollback attempted" >&2
  exit 1
fi

for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then
    rm -f "$site/current.next"
    ln -s "releases/$sha" "$site/current.next"
    mv -Tf "$site/current.next" "$site/current"
    printf '%s\n' "$sha" > "$base/shared/DEPLOYED_COMMIT.next"
    mv -f "$base/shared/DEPLOYED_COMMIT.next" "$base/shared/DEPLOYED_COMMIT"
    echo "deployed $sha"
    exit 0
  fi
  sleep 2
done

rollback
echo "API health check failed; rollback attempted" >&2
exit 1

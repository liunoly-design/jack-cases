# Production deployment

## Automatic releases

`.github/workflows/deploy.yml` runs on pushes to `main` and manual workflow dispatch. It installs dependencies, runs TypeScript checks and production builds, then sends the exact GitHub commit SHA to `https://hook.minapp.xin/hooks/jack-cases`. Configure the repository Actions secret `DEPLOY_HOOK_TOKEN` with the token installed in the server's `/data/webhook/jack-cases.json`. The hook only accepts POST requests with a matching `X-Deploy-Token` and passes the JSON `sha` field to the fixed `/data/jack-cases/dispatch.sh` command. The dispatcher queues a systemd job so the webhook response does not have to wait for a full production build; Actions then waits for `/api/health` to report the same deployed SHA.

The deploy script verifies the full SHA and requires it to be reachable from `origin/main`. It builds a separate release, switches `/data/jack-cases/current` only after a successful build, restarts `jack-cases.service`, checks `/api/health`, and attempts to restore the previous release if the service does not become healthy. Successful deployments record the SHA in `/data/jack-cases/shared/DEPLOYED_COMMIT`; the health endpoint returns that commit for workflow verification.

## Server layout

- `/data/jack-cases/repository.git`: bare Git mirror used to fetch `main`.
- `/data/jack-cases/releases/<sha>`: built application releases.
- `/data/jack-cases/current`: symlink to the active release.
- `/opt/1panel/apps/openresty/openresty/www/sites/jack-cases.minapp.xin/releases/<sha>`: static site files visible inside the OpenResty container.
- `/opt/1panel/apps/openresty/openresty/www/sites/jack-cases.minapp.xin/current`: relative symlink to the active static site release so it resolves inside OpenResty's `/www` mount.
- `/data/jack-cases/shared/.env`: private runtime settings, including `SESSION_SECRET`.
- `/data/jack-cases/shared/jack-case.db`: persistent SQLite database.
- `/data/jack-cases/shared/uploads`: persistent private image uploads.
- `/etc/systemd/system/jack-cases.service`: supervised API service on `127.0.0.1:3001`.
- OpenResty serves `apps/web/dist` and proxies `/api/` to the API.

The server requires Node.js/npm, matching Node headers under `/usr/include/node`, Python 3, a C++ build toolchain (`make` and `g++`), Git, curl, and the `jack-cases` system user. The deploy script points node-gyp at `/usr` so native modules can compile against those installed headers without downloading them. First-time setup creates the directories and user, installs `ops/jack-cases.service` and the OpenResty vhost, issues TLS for `jack-cases.minapp.xin`, configures the authenticated hook, and performs the first deploy with a full `main` commit SHA.

## Operations

```sh
systemctl status jack-cases.service
journalctl -u jack-cases.service -n 100 --no-pager
cat /data/jack-cases/shared/DEPLOYED_COMMIT
curl -fsS https://jack-cases.minapp.xin/api/health
```

Never place the webhook token or `SESSION_SECRET` in Git. Keep `/data/jack-cases/shared` when pruning old release directories.

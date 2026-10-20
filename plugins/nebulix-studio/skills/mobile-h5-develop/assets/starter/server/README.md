# Mobile H5 development server

This loopback-only Node server opens the mobile H5 at `/`, serves locally built
source modules, and proxies business requests to a fixed development API.
It has no application registry, draft, bootstrap, publish, rollback, or management
site. It does not read, write, migrate, or delete historical `.local` storage.

## Start

Build the H5 and source modules, then:

```js
import { startServer } from './server/index.mjs';

const server = await startServer({
  port: 5518,
  host: '127.0.0.1',
  staticDir: '/absolute/dist',
});
```

`createDevServer(options)` returns an unstarted Node HTTP server.
`startServer(options)` listens before returning.
`server.close(callback)` uses the standard Node signature.

## Routes

- `/`: the H5 `index.html`.
- `/modules/`, `/runtime/`, `/assets/`, and `app.js` / `app.css`: files under `staticDir`.
- `/artifacts/`: optional standalone CLI outputs under `artifactDir`, which defaults
  to `staticDir/artifacts`. Serving these files does not register or publish them.
- `GET /__mobile/health`: development server status.
- `GET /__mobile/environment`: fixed API origin, product host, and `/api` base.
- `/studio` and its descendants redirect to `/`.
- Old `/apps/aurora`, `/apps/harbor`, `/apps/custom-home` links and their descendants
  redirect to `/`, retaining query parameters.
- Other paths, including removed management APIs, return 404.

The allowed Hosts are `localhost`, `127.0.0.1`, `[::1]`, and the compatibility aliases
`aurora.localhost`, `harbor.localhost`, `custom-home.localhost`. These aliases all
open the same source-configured H5; they do not select stored application profiles.
All local static responses use `no-store`. Traversal and symlinks outside the
configured root are rejected.

## Development API proxy

`/api/*` forwards to the fixed upstream with `/api` removed. Defaults:

- upstream: `https://nebulix-service-dev.wuyaotech.com`
- product host: `nebulix-web-dev.wuyaotech.com`

Configure via `upstream` / `productHost` options or
`MOBILE_WORKBENCH_UPSTREAM` / `MOBILE_WORKBENCH_PRODUCT_HOST`.
An explicit `upstream: ''` disables proxying.

The proxy fixes `X-Product-Host` and the `/auth/login` JSON `host` field. It forwards
authorization and supported tenant/project context headers and preserves upstream
status codes and response envelopes. It never forwards browser cookies or upstream
Set-Cookie. Request parameters cannot select an upstream; redirects are rejected.
Request bodies are limited to 2 MiB, and login requires a JSON object.

API and metadata requests are restricted to same-origin browser requests.
Cookie-bearing writes without a matching Origin are rejected. Real authentication,
tenant scope, and business authorization remain enforced by the development service.

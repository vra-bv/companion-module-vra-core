# Testing the module

Three levels, from fastest to most real. Each was used for the 1.0.0 work; see the PR descriptions for what was verified where.

## 1. Build and lint

```sh
yarn build && yarn lint && yarn package
```

`yarn package` runs `companion-module-build`, which also validates `companion/manifest.json`.

## 2. Companion 5 as a developer module

Companion 5.x loads modules from a developer folder: a folder that contains one folder (or symlink) per module.

```sh
mkdir -p ~/companion-dev-modules
ln -s "$PWD" ~/companion-dev-modules/vra-core
```

- **Desktop app**: Settings → Advanced → Developer modules path → `~/companion-dev-modules`.
- **Headless** (the same app bundle, no window; handy next to a Core on a dev machine):

  ```sh
  cd /Applications/Companion.app/Contents/Resources
  ./node-runtimes/node26/bin/node main.js \
    --config-dir /tmp/companion-dev --admin-address 127.0.0.1 --admin-port 8100 \
    --extra-module-path ~/companion-dev-modules --disable-admin-password
  ```

  The admin UI is then at <http://127.0.0.1:8100>. A separate `--config-dir` keeps your normal Companion config untouched.

The module shows up as **VRA Core (Dev)**. After `yarn build` (or while `yarn dev` runs), restart the connection: switch it off and on in the Connections list. Companion 5.0.7 does not reload a developer module by itself.

Companion's HTTP API is handy for scripted checks:

```sh
curl -s http://127.0.0.1:8100/api/variable/<connection label>/studio_status/value
curl -s -X POST http://127.0.0.1:8100/api/location/<page>/<row>/<column>/press
```

## 3. A Core to talk to

### A real Core

Run a Core with the Core API v2 (server-core `feat/core-api-v2` or later) and point the connection at it. From the Core machine itself Companion connects as `loopback`: no token needed, and a configured token is ignored (the module logs a warning). To test tokens and `401`, connect over the machine's LAN address with **Access without a token** off.

`http://<core>:3002/api/v2/requests` lists the last 100 calls with status, duration and error code: the quickest way to see what a button sent.

### The Core API over a fake runtime

server-core's tests host the real Core API (`CoreApiHost`, every feature, auth, station guard, output and camera command paths) over a settable fake context (`VRA.Core.Tests/Api/CoreApiHarness.cs`). Wrapped in a long-running test it is a Core you can script: tally, studio state, signals, output status, and adding or renaming cameras and macros to check that dropdowns and presets follow. It is useful for what a dev studio cannot easily do: `401` from a bad token, read-only devices, `409 station_mismatch`, an output in `fault`, a camera on preview.

It is not part of this repository; ask in the VRA team for the dev host, or build one from `CoreApiHarness`.

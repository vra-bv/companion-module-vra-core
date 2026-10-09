# Start prompt — finish `companion-module-vra-core`

Paste the block below into a new Claude Code session opened in `/Users/hidde/repos/vra/companion-module-vra-core`.

---

Finish the Bitfocus Companion module for the VRA Core API v2 in this repo (`vra-bv/companion-module-vra-core`, branch `main`). A scaffold exists (one commit): `src/{main,api,state,config,actions,feedbacks,variables,presets,upgrades}.ts`, `companion/{manifest.json,HELP.md}`, `package.json` pinned to `@companion-module/base ~2.1.3` (Companion 5.0+). Dependencies were never installed and the module has never run inside Companion. Work on a branch per step, PR into `main`; use `model: "opus"` for subagents (never Fable).

**The API it drives.** Source of truth is the server-core repo on branch `feat/core-api-v2` (PR vra-bv/server-apps#234, base `feat/playout`): `ServerApps/docs/CORE_API_V2.md` (contract), `ServerApps/VRA.Core/Api/Features/*.cs` (exact routes/bodies), and the exported OpenAPI at `/Users/hidde/repos/vra/cloud/apps/docs/api-reference/core-api/openapi.json` (JSON GET operations; every control route also accepts POST). User docs: https://docs.visualradioassist.live/develop-with-vra/core-control-api (local: `cd /Users/hidde/repos/vra/cloud/apps/docs && npx mint@latest dev --port 3333` with Node 22). Key facts: base `http://<core>:3002/api/v2`; auth `Authorization: Bearer vra_…` (device token from Studio settings → Core API → Devices) or LAN access without token; `GET /api/v2` lists features/endpoints/principal; `GET /api/v2/state` = poll snapshot with `rev` fingerprint and sections `core, studio, station, program, signals{items}, macros{items}, automations{items}, outputs{items}, cameras{items}, variables{items}, clients` (a section is `null` when its feature is off); errors are `{ok:false,error,message}` with codes in `errors-and-status-codes`; `?wait=0`, `?timeout=`, `?station=`; scopes: macros/cameras/signals/core/studio = studio, automations/outputs/variables = station (device pin or `?station=` → `409 station_mismatch`). CORS is open for `http://localhost:3333` and the docs site only — the module runs in Node, so CORS does not apply to it.

**Do, in order:**

1. `yarn install` (or the package manager `companion-module-tools` expects), `yarn build`, `yarn lint`, fix everything eslint/tsc report. Add the template's `.github/workflows`, husky/lint-staged, `CHANGELOG.md`.
2. Verify the API surface against the real routes: compare `src/api.ts` + `src/state.ts` with the OpenAPI file and `SystemFeature.cs`; fix drift (field names, `{items}` wrappers, plain values).
3. Run it in Companion 5.x as a developer module (`companion/manifest.json`, dev-modules folder) against a real Core on `feat/core-api-v2` (or a fake Core: a small Node HTTP server replaying `openapi.json` examples is acceptable for the first pass; the previous agent smoke-tested against one). Check: connection status transitions (401 → AuthenticationFailure, no answer → ConnectionFailure), polling only rebuilds on `rev` change, dropdowns refresh when the snapshot lists change, presets drag onto a page and their feedbacks light (studio on-air red/orange, camera program red / preview green, signal on, output slot status), variables update, every action answers within 3 s, `?station=` on station-scoped actions when the config has a station.
4. Round out: add missing actions/feedbacks if the Core grew any (`GET /api/v2` is the list), an "Open Core docs" learn link, config validation messages, and a `HELP.md` with screenshots of the Devices page token flow.
5. Prepare registry submission: manifest fields (maintainer, keywords, products), version `1.0.0`, README, then the Bitfocus developer portal steps; leave the actual submission to Hidde.

**Rules:** no new UI concepts without asking; keep the "broadcast tool, not toy" style for preset colours (plain red/green/orange, no gradients); do not touch the server-core or cloud repos except to read; report what was verified on a real Companion vs a fake Core.

---

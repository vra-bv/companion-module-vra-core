# Changelog

All notable changes to this module are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the module uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Everything the Core API v2 controls, as of the Core with the playout v2 Output Player:
  - Core: reload configuration and restart apps (`?wait=0`).
  - Studio: set from a value (`/studio/set`), for expressions.
  - Outputs: rundown select; item take / take out / continue / pause / resume; bank start / next / previous / stop; bank AUTO on / off / toggle; playout take out all / return; playout hold on / off / toggle.
- Feedbacks: signal value equals, automation state, output scene on air, playout phase, playout held, item on air, bank on air, bank available, bank AUTO, VRA app connected.
- Variables: connection (`core_version`, `connected_as`, `access`), `core_active`, `studio_name`, `program_titles`, macro running, automation state, camera preview and name, `camera_program` / `camera_preview`, playout phase / hold / items on air / rundown / next item, bank next item and AUTO, VRA apps connected.
- Presets for all of it, grouped per signal, camera, output slot, playout scene and bank: studio recording and status, Core activate / deactivate / reload, station and program displays, signal on / off, automations, camera preview and angles, output reload / scene / playout / rundown / banks, variable value displays, VRA apps.
- Learn on signal set, camera cut / preview, scene take, rundown, item, variable set, and on the value / state / scene / phase feedbacks.
- Configuration: `127.0.0.1` as the default address (Companion usually runs on the Core machine), a pasted URL or `host:port` is accepted, a malformed token is reported as a bad config, and a link to the Core API documentation.
- Camera angles and variable types are read again every 60 s.

### Removed

- Output: play clip and take out all graphics. The Core with the playout v2 player replaced them with banks, items and playout take out all.

- `docs/TESTING.md`: running the module in Companion 5 as a developer module, headless, against a real Core or the Core API over a fake runtime.
- Tooling from the Companion module template: GitHub workflows (module checks, Node CI, release), issue templates, husky pre-commit hook with lint-staged.

### Fixed

- Variables and cameras without a name no longer break the definitions (the snapshot sends `name: null`); angles without a name show their id.
- Camera lookup follows the Core: id, then a unique name, then the number.
- An unknown studio state no longer reads as off air: `studio_status` is empty and the off-air feedback is false.
- Variable writes and camera commands wait up to 2.9 s for the Core's answer instead of 2.5 s, so a slow but successful write is not reported as `504 timeout`.
- A definition builder that fails is retried on the next poll instead of leaving the definitions half-built.

### Changed

- Variable dropdowns and presets address station variables by id: names are not unique on a real station.
- Log lines name cameras and variables instead of showing their ids.
- Camera dropdowns and presets address cameras by id: a button keeps its camera when one is added or removed before it.
- `BOOLEAN is true` matches the Core's toggle: `TRUE`, `1` and `ON`.
- Snapshot types follow the Core API v2 source (`{items}` sections only, `GET /api/v2` with `principal.kind`, `api`, `endpoints`).
- A `403` on connect says which switch to check (the API, the System feature, or the device's feature list).
- A configured token that the Core did not use (calls from the Core machine itself, or an unknown token admitted by LAN access) is logged as a warning.
- Dev dependencies aligned with the template (ESLint 10, typescript-eslint 8.71, Prettier 3.9, Yarn 4.18).

## [0.1.0]

### Added

- First scaffold: actions, feedbacks, variables and generated presets for the VRA Core API v2.

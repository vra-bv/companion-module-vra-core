# Changelog

All notable changes to this module are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the module uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Tooling from the Companion module template: GitHub workflows (module checks, Node CI, release), issue templates, husky pre-commit hook with lint-staged.

### Fixed

- Variables and cameras without a name no longer break the definitions (the snapshot sends `name: null`); angles without a name show their id.
- Camera lookup follows the Core: id, then a unique name, then the number.
- An unknown studio state no longer reads as off air: `studio_status` is empty and the off-air feedback is false.
- Variable writes and camera commands wait up to 2.9 s for the Core's answer instead of 2.5 s, so a slow but successful write is not reported as `504 timeout`.
- A definition builder that fails is retried on the next poll instead of leaving the definitions half-built.

### Changed

- Camera dropdowns and presets address cameras by id: a button keeps its camera when one is added or removed before it.
- `BOOLEAN is true` matches the Core's toggle: `TRUE`, `1` and `ON`.
- Snapshot types follow the Core API v2 source (`{items}` sections only, `GET /api/v2` with `principal.kind`, `api`, `endpoints`).
- A `403` on connect says which switch to check (the API, the System feature, or the device's feature list).
- A configured token that the Core did not use (calls from the Core machine itself, or an unknown token admitted by LAN access) is logged as a warning.
- Dev dependencies aligned with the template (ESLint 10, typescript-eslint 8.71, Prettier 3.9, Yarn 4.18).

## [0.1.0]

### Added

- First scaffold: actions, feedbacks, variables and generated presets for the VRA Core API v2.

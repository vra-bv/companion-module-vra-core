# Releasing

Companion 4.0 and later install modules on demand from the Bitfocus module store, so a release reaches users without a Companion update. Bitfocus volunteers review every version first.

Reference: [Releasing a Companion module](https://companion.free/for-developers/module-development/module-lifecycle/releasing-your-module).

## First release (once)

1. **Request a repository** in the [Bitfocus Developer Portal](https://developer.bitfocus.io/) (log in with GitHub). Module name in `manufacturer-product` form: **`vra-core`**, which matches the manifest `id`. Bitfocus then creates `bitfocus/companion-module-vra-core`.
2. **Push this repository there**, for example as a second remote:

   ```sh
   git remote add bitfocus git@github.com:bitfocus/companion-module-vra-core.git
   git push bitfocus main --tags
   ```

   Decide which repository is the source of truth. If `bitfocus/` becomes the home, point `repository` and `bugs` in `companion/manifest.json` and `package.json` there. If `vra-bv/` stays the home, push every release tag to both.

3. Questions about naming or the review go to `#module-development` on the Bitfocus Slack.

## Every version

1. Update `CHANGELOG.md` and set the version in `package.json` (`major.minor.patch`). The build copies it into the manifest; keep `companion/manifest.json` in step anyway.
2. Check locally: `yarn build && yarn lint && yarn package`. The `.tgz` from `yarn package` can be imported in Companion under **Modules → Import module package** for a last test.
3. Merge to `main`, then tag: create a GitHub release `v1.2.3`, or `git tag v1.2.3 && git push --tags`. The **Release** workflow attaches the packaged `.tgz` to the GitHub release. Offline studios can import that file.
4. In the Developer Portal: **My Connections** → _VRA Core_ → **Submit Version** → pick the tag → (beta: tick **Is Prerelease**) → **Submit**. The status reads _Pending_ until the review is done; review remarks arrive in the portal.

## Checklist before submitting 1.0.0

- [ ] Repository requested and code pushed (see above); `repository` / `bugs` URLs point at the repository you keep.
- [ ] Maintainers in `companion/manifest.json`: add a contact e-mail if you want one listed.
- [ ] `companion/HELP.md` screenshots of the Devices page (Studio settings → Core API → Devices), once that page is live in VRA Cloud.
- [ ] The docs page [Bitfocus Companion control](https://docs.visualradioassist.live/develop-with-vra/core-control-api/bitfocus-companion-control-over-visual-radio) still says the module is "in development"; update it when the module is in the store.
- [ ] Ask in the portal or on Slack whether a connection module also reaches **Bitfocus Buttons**, and from which module API version. Public docs do not say.

## Compatibility

- `@companion-module/base ~2.1` (module API 2.1): Companion **5.0 and later**. Bump the base only together with a minimum-Companion decision. API 2.2 exists, but raising the minimum shuts out studios on 5.0.
- Runtime `node22`. Companion 5.0.7 also ships `node26`, which the template now uses; `node22` keeps every 5.0.x working.
- The Core API v2 is required: a Core with `/api/v2` (server-core `feat/core-api-v2` or later). Output actions use the playout v2 routes (banks, items, playout).

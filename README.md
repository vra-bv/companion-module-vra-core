# companion-module-vra-core

[Bitfocus Companion](https://bitfocus.io/companion) module for the **VRA Core API v2**: control a Visual Radio Assist Core from a Stream Deck or any other Companion surface, with tally and status feedback.

See [companion/HELP.md](./companion/HELP.md) for setup and the list of actions, feedbacks, variables and presets, and the [Core API documentation](https://docs.visualradioassist.live/develop-with-vra/core-control-api/bitfocus-companion-control-over-visual-radio).

## How it works

- **Connection**: `GET /api/v2` with the device token as `Authorization: Bearer vra_…` (no header when the token is empty: loopback and LAN access need none). It sets the connection status and is retried every 5 s while it fails.
- **State**: `GET /api/v2/state` every poll interval. `rev` is a fingerprint of the snapshot; an unchanged `rev` costs nothing. A new `rev` updates the variables and re-checks the feedbacks. When signals, macros, automations, cameras, output slots, playout scenes, banks, rundowns, variables or VRA apps are added, removed or renamed, the module also reads `GET /api/v2/cameras` (angles) and `GET /api/v2/variables` (types) and rebuilds its action, feedback, variable and preset definitions. Those two are read again every 60 s, so a new angle reaches the dropdowns without a restart.
- **Actions**: `POST` on the control route (the Core accepts GET and POST), with `?station=` when a station is configured and `?timeout=` (2500 ms, 2900 ms for variable writes and camera commands) so the Core answers, with its own `504 timeout` if need be, before the module gives up on the request. Core maintenance (reload configuration, restart apps) goes out with `?wait=0`. A refusal is logged with the API's `error` and `message`; a success triggers an immediate poll. Toggles the API has no route for (bank AUTO, playout hold) read the current value from the snapshot and send the opposite `?on=`.

The token is stored as a Companion secret, not in the connection config.

## Development

Requires Node.js 22 (the module runs on Companion's `node22` runtime) and Yarn 4. With nvm, `.nvmrc` pins Node 22:

```sh
nvm install   # once
nvm use
corepack enable
```

The husky pre-commit hook runs `yarn`; when you commit from an IDE or a shell without nvm, put `source ~/.nvm/nvm.sh && nvm use --silent` in `~/.config/husky/init.sh`.

```sh
yarn install
yarn build        # compile to dist/
yarn dev          # compile on change
yarn typecheck
yarn lint
yarn package      # build a module package (pkg/) with companion-module-build
```

To load the module in Companion during development, point Companion's **Developer modules path** at the folder that contains this repository and run `yarn dev`.

### Layout

| File               | Purpose                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `src/main.ts`      | The instance: connection check, poll loop, definitions, `runControl`                     |
| `src/api.ts`       | Typed `fetch` client with the 3 s bound and the API's error codes                        |
| `src/state.ts`     | Snapshot types, the normalised model and the lookups (ids exact, names case-insensitive) |
| `src/config.ts`    | Connection settings and the token secret                                                 |
| `src/actions.ts`   | Actions and the dropdown choices shared with the feedbacks                               |
| `src/feedbacks.ts` | Boolean feedbacks and the tally colours                                                  |
| `src/variables.ts` | Variable layout and values                                                               |
| `src/presets.ts`   | Presets generated from the snapshot                                                      |
| `src/upgrades.ts`  | Upgrade scripts (none yet)                                                               |

## License

MIT, see [LICENSE](./LICENSE).

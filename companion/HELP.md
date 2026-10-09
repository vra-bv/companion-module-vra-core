## VRA Core

Controls a [Visual Radio Assist](https://visualradioassist.live) Core through its local Core API v2: the studio's on-air status, the Core itself, Signals (including Audio Director and Camera Assist), macros, automations, cameras and angles, Output Player outputs (scenes, rundown, items, clip and graphics banks, playout) and station variables. The module reads the Core's state about once a second, so buttons show tally and status.

Core API documentation: [docs.visualradioassist.live › Core control API](https://docs.visualradioassist.live/develop-with-vra/core-control-api).

### Setup

**Companion on the Core machine** (the usual setup): add a **VRA Core** connection and keep the defaults. Address `127.0.0.1`, port `3002`, no token. Calls from the Core machine itself need no token.

**Companion on another machine:**

1. In VRA Cloud, open **Studio settings → Core API**.
2. Under **Devices**, click **Add device**, name it (for example `Companion studio desk`) and choose **Read and control**. Copy the token (`vra_…`): it is shown only once.
3. In the connection, enter the Core machine's IP address or host name and paste the token.

No token is needed either when **Access without a token** lets this machine in (**Listed devices** or **Whole LAN**).

**No internet on the Companion machine?** Download the newest package from [github.com/vra-bv/companion-module-vra-core › releases](https://github.com/vra-bv/companion-module-vra-core/releases/latest/download/vra-core.tgz) on another machine and import it in Companion under **Modules → Import module package**.

| Setting       | Meaning                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core address  | IP address or host name of the Core machine. A pasted URL such as `http://192.168.1.50:3002/api/v2` works too.                                                                                                                                                   |
| Port          | The Core API port, `3002` unless the studio's Core settings say otherwise.                                                                                                                                                                                       |
| Device token  | Optional, see above.                                                                                                                                                                                                                                             |
| Poll interval | How often the state is read (default 1000 ms, at least 250 ms).                                                                                                                                                                                                  |
| Station       | Optional station id or name. Every action then carries `?station=` and does nothing (`409 station_mismatch`) while another station holds the studio. See [Station safety](https://docs.visualradioassist.live/develop-with-vra/core-control-api/station-safety). |

### Connection status

| Status                   | Meaning                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OK                       | Connected. The status text says how the Core sees Companion: `loopback` (same machine), `device:<name>` (token) or `lan`, with `control` or `read only`.           |
| Bad config               | No address, or a token that is not `vra_` followed by 32 letters and digits.                                                                                       |
| Authentication failure   | The Core refused the call (`401`): no token where one is needed, or a wrong, revoked or wrongly placed token (a device with a fixed IP used from another address). |
| Insufficient permissions | The Core API or its System feature is switched off for the studio, or the device's feature list leaves out System (`403`). The status text says which.             |
| Connection failure       | No answer from the Core: check the address, the port and that the Core runs.                                                                                       |

When a token is configured but the Core let Companion in another way (from the Core machine itself, or by LAN access because it did not know the token), the log says so.

### Actions

| Action                                        | What it does                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Core**                                      | Activate, deactivate, toggle.                                                                                                         |
| **Core: reload configuration / restart apps** | Re-pull the configuration from VRA Cloud, or restart every VRA app on the Core machine (the output drops while they start).           |
| **Studio**                                    | On air, recording, off air, toggle, or set from a value (`onair`, `recording`, `offair`, `1`, `2`, `0`; handy with an expression).    |
| **Signal**                                    | On, off, toggle (BOOLEAN and INTEGER signals), set a value (any type). **Learn** takes the current value.                             |
| **Audio Director**, **Camera Assist**         | On, off, toggle.                                                                                                                      |
| **Macro**                                     | Trigger.                                                                                                                              |
| **Camera**                                    | Cut to program, take to preview (**Learn** takes the camera on program or preview), trigger an angle (PTZ move, framing and cut).     |
| **Output: take scene**                        | Put a scene on air, optionally holding it; or release the hold. **Learn** takes the scene on air.                                     |
| **Output: rundown**                           | Next, previous, take an item, mark an item as next, select a rundown (or follow the show again).                                      |
| **Output: item**                              | Take, take out, continue (next animation step), pause, resume one item. **Learn** takes the last item that went on air.               |
| **Output: bank**                              | Start, next, previous, stop a clip or graphics bank.                                                                                  |
| **Output: bank AUTO**                         | On, off, toggle: an item that ends on its own takes the next one.                                                                     |
| **Output: playout**                           | Take out all, return the output now; **hold** on, off, toggle (stay on air when empty).                                               |
| **Output: reload player**                     | Fetch the show again and start a fresh graphics page.                                                                                 |
| **Variable**                                  | Set a value, or on, off, toggle a BOOLEAN station user input variable (written through VRA Cloud). **Learn** takes the current value. |

Dropdowns list what the Core reports, and you can type a value instead: a signal identifier, a macro name, a camera number or name, a slot key, a variable name, or `<camera>/<angle>` for an angle.

Item addresses are the player's own: `bank/<bank>/<item>` for bank items and `rundown/<rundown>/<story>/<item>` for rundown items. The output variables show them.

When an output has more than one playout scene, pick the **Playout scene** in output actions and feedbacks; with one, leave it on _(the only playout scene)_.

A refused action is written to the connection's log with the Core's error code and message, for example `409 not_active`, `409 bank_not_active` or `409 station_mismatch`. Every action gets its answer within about 3 seconds.

### Feedbacks

| Feedback                                            | True while                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Core: active                                        | The Core state is `ACTIVE`.                                                                                       |
| Studio: on air / recording / off air                | The studio has that status (all false while the Core does not know it).                                           |
| Signal: active · value equals                       | The signal is true, non-zero or non-empty · has that value.                                                       |
| Macro: running                                      | The macro runs.                                                                                                   |
| Automation: state equals                            | The automation is `activated`, `released`, `standby` or `stopped`.                                                |
| Camera: on air · on preview                         | Program and preview tally from the live switcher.                                                                 |
| Output: status equals                               | `on_air`, `starting`, `dormant`, `fault` or `offline`.                                                            |
| Output: scene on air                                | The output has switched to that scene.                                                                            |
| Output: playout phase equals · playout held         | The playout scene is `on_air`, `taking`, `holding`, `returning` or `standby` · is held.                           |
| Output: item on air                                 | The item is on air.                                                                                               |
| Output: bank on air · bank available · bank AUTO on | An item of the bank is on air · the bank can be used (a show bank only while its program is on air) · AUTO is on. |
| Variable: equals value · BOOLEAN is true            | The station variable has that value · is `TRUE`.                                                                  |
| Client: connected to the Core                       | The VRA app (Output Player, Audio Manager, Camera Assist, …) on that machine is connected.                        |

### Variables

| Variable                                                    | Value                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `core_version`, `connected_as`, `access`                    | The Core version; how it sees Companion (`loopback`, `device:<name>`, `lan`); `read` or `control`. |
| `core_state`, `core_active`                                 | `ACTIVE`, `DEACTIVATED`, …; `true` / `false`.                                                      |
| `studio_name`, `studio_status`                              | The studio; `onair`, `recording`, `offair` (empty while unknown).                                  |
| `station_name`, `program_title`, `program_titles`           | The station on the studio; the program on air; every program on air.                               |
| `signal_<identifier>`                                       | The signal's value (`audio-director` becomes `signal_audio_director`).                             |
| `macro_<name>_running`                                      | `true` / `false`.                                                                                  |
| `automation_<name>_state`                                   | `standby`, `activated`, `released`, `stopped`.                                                     |
| `camera_<n>_onair`, `camera_<n>_preview`, `camera_<n>_name` | Tally (`true` / `false`, empty when unknown) and name of camera _n_.                               |
| `camera_program`, `camera_preview`                          | Number of the camera on program / preview.                                                         |
| `output_<slot>_status`, `output_<slot>_scene`               | The output's status and the scene on air.                                                          |
| `output_<slot>_phase`, `_hold`, `_on_air_items`             | The playout scene's phase, hold, and the items on air.                                             |
| `output_<slot>_rundown`, `_rundown_on_air`, `_rundown_next` | The active rundown, its item on air and the next item.                                             |
| `output_<slot>_bank_<bank>_next`, `_auto`                   | The item the bank takes next; AUTO.                                                                |
| `var_<name>`                                                | The station variable's value (`TRUE` / `FALSE` for BOOLEAN).                                       |
| `client_<type>_<host>`                                      | `true` while that VRA app is connected.                                                            |

With more than one playout scene on an output, the playout variables carry the scene key: `output_<slot>_<scene>_phase`.

### Presets

Generated from what the Core reports, and rebuilt when signals, macros, automations, cameras, angles, outputs, banks, variables or VRA apps are added, removed or renamed:

- **Studio**: toggle with status, on air, recording, off air, status display.
- **Core**: toggle with state, activate, deactivate, reload configuration. Restart apps has no preset on purpose.
- **Station and program**: displays.
- **Signals**: toggle, on and off per switchable signal; a value display for the others.
- **Macros**: trigger, blue while running.
- **Automations**: state display, blue while activated.
- **Cameras**: cut (red on program, green on preview), preview, and one button per angle.
- **Outputs**: per slot a status display, reload and take of the scene on air; per playout scene take out all, return, hold, rundown next and previous; per bank start (showing its next item), next, previous, stop and AUTO.
- **Station variables**: toggle per BOOLEAN variable (amber when TRUE), value display for the others.
- **VRA apps**: green while connected.

### Troubleshooting

`http://<core>:3002/api/v2/requests` (or `http://localhost:3002/api/v2/requests` on the Core machine) lists the last calls with status, duration and error code: the quickest way to see what a button sent and why it was refused.

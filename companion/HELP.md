## VRA Core

Controls a [Visual Radio Assist](https://visualradioassist.live) Core through its local Core API v2: the studio's on-air status, the Core state, Signals (including Audio Director and Camera Assist), macros, cameras and angles, Output Player outputs and station variables. The module reads the Core's state about once a second, so buttons show tally and status.

Full API reference: [Bitfocus Companion control over Visual Radio](https://docs.visualradioassist.live/develop-with-vra/core-control-api/bitfocus-companion-control-over-visual-radio).

### Setup

1. In VRA Cloud, open **Studio settings → Core API**.
2. Under **Devices**, click **Add device**, name it (for example `Companion studio`) and choose **Read and control**. Copy the token (`vra_…`). It is shown only once.
3. In Companion, add a **VRA Core** connection:
   - **Core address**: the IP address or host name of the machine that runs the VRA Core.
   - **Port**: the Core API port, `3002` unless the studio's Core settings say otherwise.
   - **Device token**: the token from step 2.
   - **Poll interval**: how often the state is read (default 1000 ms, at least 250 ms).
   - **Station** (optional): a station id or name. Every action then carries `?station=` and does nothing while another station holds the studio.

No token is needed when Companion runs on the Core machine itself, or when **Access without a token** is on for the studio (**Listed devices** or **Whole LAN**). Leave the token empty in those cases.

### Connection status

| Status | Meaning |
| --- | --- |
| OK | Connected. The status text shows the device name and its access. |
| Authentication failure | The Core refused the token (`401`): wrong, revoked, or used from another address than the device's fixed IP. |
| Insufficient permissions | The Core API or the System feature is switched off for the studio, or the device may not use it (`403`). |
| Connection failure | No answer from the Core: check the address, the port and the network. |

### Actions

- **Core**: activate, deactivate, toggle.
- **Studio**: on air, recording, off air, toggle.
- **Signal**: on, off, toggle, set value. **Audio Director** and **Camera Assist**: on, off, toggle.
- **Macro**: trigger.
- **Camera**: cut to program, take to preview, trigger angle.
- **Output**: take scene, rundown next / previous / take / mark next, play clip, take out all graphics, reload player.
- **Variable**: set, on, off, toggle (station user input variables; BOOLEAN for on/off/toggle).

Dropdowns list what the Core reports. You can also type a value: a signal identifier, a macro name, a camera number or name, an output slot key, a variable name, or `<camera>/<angle>` for an angle.

A refused action is written to the connection's log with the Core's error code, for example `409 not_active` or `409 station_mismatch`.

### Feedbacks

Core active · Studio on air / recording / off air · Signal active · Camera on air (program tally) / on preview · Output status equals · Variable equals value · Variable BOOLEAN is true · Macro running.

### Variables

| Variable | Value |
| --- | --- |
| `core_state` | `ACTIVE`, `DEACTIVATED`, `STARTING`, … |
| `studio_status` | `onair`, `recording`, `offair` |
| `station_name` | The station on the studio |
| `program_title` | The program on air |
| `signal_<identifier>` | The signal's value (`audio-director` becomes `signal_audio_director`) |
| `camera_<n>_onair` | `true` / `false`, empty when the Core cannot tell |
| `output_<slot>_status` | `starting`, `on_air`, `dormant`, `fault`, `offline` |
| `output_<slot>_scene` | Key of the scene on air |
| `var_<name>` | The station variable's value (`TRUE` / `FALSE` for BOOLEAN) |

### Presets

Generated from what the Core reports: studio and Core buttons with tally colours, and one button per signal, macro, camera, output slot and BOOLEAN variable. They refresh when signals, macros, cameras, outputs or variables are added or renamed.

### Troubleshooting

On the Core machine, `http://localhost:3002/api/v2/requests` lists the last calls with their status and error code.

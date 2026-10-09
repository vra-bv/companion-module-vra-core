/**
 * Actions: one per control route family of the Core API v2. Each action POSTs its route through
 * {@link VraCoreInstance.runControl}, which adds `?station=` when a station is configured, logs refusals with the
 * API's error code and message, and refreshes the state right after a success.
 *
 * Dropdowns list what the last snapshot holds (signals, macros, cameras, angles, output slots, variables) and allow
 * a custom value, so a button keeps working when it is set up before the Core is reachable, or addressed by a name
 * the Core resolves itself (ids exact, names case-insensitive).
 */

import type { DropdownChoice } from '@companion-module/base'
import { seg, type Query } from './api.js'
import type VraCoreInstance from './main.js'
import { cameraName, isSwitchableSignal, outputKey, type CoreModel } from './state.js'

export type ActionsSchema = {
	core_control: { options: { command: string } }
	studio_control: { options: { command: string } }
	signal_control: { options: { signal: string; command: string; value?: string } }
	audio_director: { options: { command: string } }
	camera_assist: { options: { command: string } }
	macro_trigger: { options: { macro: string } }
	camera_cut: { options: { camera: string } }
	camera_preview: { options: { camera: string } }
	angle_trigger: { options: { angle: string } }
	output_scene_take: { options: { slot: string; scene: string; hold?: string } }
	output_rundown: { options: { slot: string; command: string; item?: string; playout?: string } }
	output_clip_play: { options: { slot: string; clip: number; bank?: string; playout?: string } }
	output_graphics_take_out_all: { options: { slot: string; playout?: string } }
	output_reload: { options: { slot: string } }
	variable_control: { options: { variable: string; command: string; value?: string } }
}

// ── dropdown choices from the model (shared with the feedbacks) ────────────────────────────────────────────────────

/** Signals by identifier: the readable key, stable across a re-created signal. */
export function signalChoices(model: CoreModel, switchableOnly = false): DropdownChoice<string>[] {
	return model.signals
		.filter((s) => !switchableOnly || isSwitchableSignal(s))
		.map((s) => ({ id: s.identifier, label: s.label ? `${s.label} (${s.identifier})` : s.identifier }))
}

/** Macros by name, like the docs' `macros/Jingle%20in/trigger`; the Core matches names case-insensitively. */
export function macroChoices(model: CoreModel): DropdownChoice<string>[] {
	return model.macros.map((m) => ({ id: m.name, label: m.enabled ? m.name : `${m.name} (disabled)` }))
}

/**
 * Cameras by id, so a button keeps its camera when one is added or removed before it (the number is the list
 * position). A number or name typed in works too.
 */
export function cameraChoices(model: CoreModel): DropdownChoice<string>[] {
	return model.cameras.map((c) => ({ id: c.id, label: `${c.number} · ${cameraName(c)}` }))
}

/**
 * Camera/angle pairs as `<camera id>::<angle id>`: ids, because angle names only need to be unique within a camera.
 * A typed-in value may use `<camera>/<angle>` with a number or name on either side.
 */
export function angleChoices(model: CoreModel): DropdownChoice<string>[] {
	const choices: DropdownChoice<string>[] = []
	for (const camera of model.cameras) {
		for (const angle of model.angles.get(camera.id) ?? []) {
			choices.push({
				id: `${camera.id}::${angle.id}`,
				label: `${camera.number} · ${cameraName(camera)} — ${angle.name ?? angle.id}`,
			})
		}
	}
	return choices
}

/** Output slots by slot key (the output id when a player reports no slot). */
export function slotChoices(model: CoreModel): DropdownChoice<string>[] {
	return model.outputs.map((o) => ({ id: outputKey(o), label: outputKey(o) }))
}

/** Station variables by name. */
export function variableChoices(model: CoreModel, booleanOnly = false): DropdownChoice<string>[] {
	return model.variables
		.filter((v) => !booleanOnly || isBooleanVariable(model, v.id))
		.map((v) => {
			const detail = model.variableDetails.get(v.id)
			const display = detail?.display_name && detail.display_name !== v.name ? ` (${detail.display_name})` : ''
			return { id: v.name, label: `${v.name}${display}` }
		})
}

/**
 * BOOLEAN by its type from `GET /api/v2/variables`; when the details could not be read, by a `TRUE`/`FALSE` value.
 */
export function isBooleanVariable(model: CoreModel, variableId: string): boolean {
	const type = model.variableDetails.get(variableId)?.data_type
	if (type) return type.toUpperCase() === 'BOOLEAN'
	const value = model.variables.find((v) => v.id === variableId)?.value?.toUpperCase()
	return value === 'TRUE' || value === 'FALSE'
}

/** The first choice's id, or '' for an empty list (the user then types a custom value). */
export const firstId = (choices: DropdownChoice<string>[]): string => choices[0]?.id ?? ''

const ON_OFF_TOGGLE: DropdownChoice<string>[] = [
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
	{ id: 'toggle', label: 'Toggle' },
]

/**
 * Option values may come from expressions; read them as trimmed text. Scalars are stringified, anything else
 * (an expression that produced an object or a list) reads as its JSON.
 */
export const text = (value: unknown): string => {
	if (value === undefined || value === null) return ''
	if (typeof value === 'string') return value.trim()
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	return JSON.stringify(value)
}

/** An optional query argument: left out of the URL when empty. */
const optional = (value: unknown): string | undefined => text(value) || undefined

/** `<camera id>::<angle id>` from the dropdown, or a typed `<camera>/<angle>`; a bare angle goes to `/angles/{id}`. */
function anglePath(value: string): string | null {
	const sep = value.includes('::') ? '::' : value.includes('/') ? '/' : null
	if (sep === null) return value ? `/angles/${seg(value)}/trigger` : null
	const at = value.indexOf(sep)
	const camera = value.slice(0, at).trim()
	const angle = value.slice(at + sep.length).trim()
	if (!camera || !angle) return null
	return `/cameras/${seg(camera)}/angles/${seg(angle)}/trigger`
}

export function UpdateActions(self: VraCoreInstance): void {
	const model = self.model
	const signals = signalChoices(model)
	const macros = macroChoices(model)
	const cameras = cameraChoices(model)
	const angles = angleChoices(model)
	const slots = slotChoices(model)
	const variables = variableChoices(model)

	const slotField = {
		type: 'dropdown' as const,
		id: 'slot' as const,
		label: 'Output slot',
		choices: slots,
		default: firstId(slots),
		allowCustom: true,
		tooltip: 'Slot key (e.g. main) or output id',
	}
	const playoutField = {
		type: 'textinput' as const,
		id: 'playout' as const,
		label: 'Playout scene (optional)',
		tooltip: 'Key of the playout scene. Only needed when the output has more than one.',
		default: '',
	}

	/** Runs a control route, unless a required option is empty. */
	const run = async (label: string, path: string | null, query: Query = {}): Promise<void> => {
		if (path === null) {
			self.log('warn', `${label}: missing argument`)
			return
		}
		await self.runControl(label, path, query)
	}

	self.setActionDefinitions({
		core_control: {
			name: 'Core: activate / deactivate / toggle',
			options: [
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					default: 'toggle',
					choices: [
						{ id: 'activate', label: 'Activate' },
						{ id: 'deactivate', label: 'Deactivate' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: async (event) => {
				const command = text(event.options.command)
				await run(`Core ${command}`, ['activate', 'deactivate', 'toggle'].includes(command) ? `/core/${command}` : null)
			},
		},

		studio_control: {
			name: 'Studio: on air / recording / off air / toggle',
			options: [
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					default: 'toggle',
					choices: [
						{ id: 'onair', label: 'On air' },
						{ id: 'recording', label: 'Recording' },
						{ id: 'offair', label: 'Off air' },
						{ id: 'toggle', label: 'Toggle (off air ↔ on air)' },
					],
				},
			],
			callback: async (event) => {
				const command = text(event.options.command)
				await run(
					`Studio ${command}`,
					['onair', 'recording', 'offair', 'toggle'].includes(command) ? `/studio/${command}` : null,
				)
			},
		},

		signal_control: {
			name: 'Signal: on / off / toggle / set',
			description: 'On, off and toggle work on BOOLEAN and INTEGER signals; set takes a value for any type.',
			options: [
				{
					type: 'dropdown',
					id: 'signal',
					label: 'Signal',
					choices: signals,
					default: firstId(signals),
					allowCustom: true,
					tooltip: 'Signal identifier or id',
				},
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					default: 'toggle',
					choices: [...ON_OFF_TOGGLE, { id: 'set', label: 'Set value' }],
					// Referenced by the value field's visibility, so it cannot be an expression.
					disableAutoExpression: true,
				},
				{
					type: 'textinput',
					id: 'value',
					label: 'Value',
					tooltip: 'true/false for BOOLEAN, a whole number for INTEGER, any text for STRING',
					default: '',
					isVisibleExpression: `$(options:command) == 'set'`,
				},
			],
			callback: async (event) => {
				const signal = text(event.options.signal)
				const command = text(event.options.command)
				const valid = signal !== '' && ['on', 'off', 'toggle', 'set'].includes(command)
				await run(
					`Signal ${signal} ${command}`,
					valid ? `/signals/${seg(signal)}/${command}` : null,
					command === 'set' ? { value: text(event.options.value) } : {},
				)
			},
		},

		audio_director: {
			name: 'Audio Director: on / off / toggle',
			options: [{ type: 'dropdown', id: 'command', label: 'Command', default: 'toggle', choices: ON_OFF_TOGGLE }],
			callback: async (event) => {
				const command = text(event.options.command)
				await run(
					`Audio Director ${command}`,
					['on', 'off', 'toggle'].includes(command) ? `/audio-director/${command}` : null,
				)
			},
		},

		camera_assist: {
			name: 'Camera Assist: on / off / toggle',
			options: [{ type: 'dropdown', id: 'command', label: 'Command', default: 'toggle', choices: ON_OFF_TOGGLE }],
			callback: async (event) => {
				const command = text(event.options.command)
				await run(
					`Camera Assist ${command}`,
					['on', 'off', 'toggle'].includes(command) ? `/camera-assist/${command}` : null,
				)
			},
		},

		macro_trigger: {
			name: 'Macro: trigger',
			description: 'Starts the macro of the station on the studio. Does not wait for it to finish.',
			options: [
				{
					type: 'dropdown',
					id: 'macro',
					label: 'Macro',
					choices: macros,
					default: firstId(macros),
					allowCustom: true,
					tooltip: 'Macro name or id',
				},
			],
			callback: async (event) => {
				const macro = text(event.options.macro)
				await run(`Macro ${macro}`, macro ? `/macros/${seg(macro)}/trigger` : null)
			},
		},

		camera_cut: {
			name: 'Camera: cut to program',
			options: [
				{
					type: 'dropdown',
					id: 'camera',
					label: 'Camera',
					choices: cameras,
					default: firstId(cameras),
					allowCustom: true,
					tooltip: 'Camera id, name or number',
				},
			],
			callback: async (event) => {
				const camera = text(event.options.camera)
				await run(`Camera ${camera} cut`, camera ? `/cameras/${seg(camera)}/cut` : null)
			},
		},

		camera_preview: {
			name: 'Camera: take to preview',
			options: [
				{
					type: 'dropdown',
					id: 'camera',
					label: 'Camera',
					choices: cameras,
					default: firstId(cameras),
					allowCustom: true,
					tooltip: 'Camera id, name or number',
				},
			],
			callback: async (event) => {
				const camera = text(event.options.camera)
				await run(`Camera ${camera} preview`, camera ? `/cameras/${seg(camera)}/preview` : null)
			},
		},

		angle_trigger: {
			name: 'Camera: trigger angle',
			description: 'Runs the angle: the PTZ move, framing and the cut.',
			options: [
				{
					type: 'dropdown',
					id: 'angle',
					label: 'Camera / angle',
					choices: angles,
					default: firstId(angles),
					allowCustom: true,
					tooltip: 'Type <camera>/<angle> (id, name or number), or an angle name that only one camera has',
				},
			],
			callback: async (event) => {
				const angle = text(event.options.angle)
				await run(`Angle ${angle}`, anglePath(angle))
			},
		},

		output_scene_take: {
			name: 'Output: take scene',
			description: 'Puts the scene on air as if its trigger fired.',
			options: [
				slotField,
				{ type: 'textinput', id: 'scene', label: 'Scene key', default: '' },
				{
					type: 'dropdown',
					id: 'hold',
					label: 'Hold',
					default: 'none',
					choices: [
						{ id: 'none', label: 'Take' },
						{ id: 'hold', label: 'Take and hold on air' },
						{ id: 'release', label: 'Release the hold' },
					],
				},
			],
			callback: async (event) => {
				const slot = text(event.options.slot)
				const scene = text(event.options.scene)
				const hold = text(event.options.hold)
				await run(
					`Output ${slot} take ${scene}`,
					slot && scene ? `/outputs/${seg(slot)}/scenes/${seg(scene)}/take` : null,
					{ hold: hold === 'hold' ? 1 : hold === 'release' ? 0 : undefined },
				)
			},
		},

		output_rundown: {
			name: 'Output: rundown next / previous / take / set next',
			options: [
				slotField,
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					default: 'next',
					choices: [
						{ id: 'next', label: 'Take next item' },
						{ id: 'previous', label: 'Take previous item' },
						{ id: 'take', label: 'Take item' },
						{ id: 'set-next', label: 'Mark item as next' },
					],
					disableAutoExpression: true,
				},
				{
					type: 'textinput',
					id: 'item',
					label: 'Item (<story>.<item>, e.g. 2.1)',
					tooltip: 'Required for "Mark item as next"; "Take item" without one takes the next item',
					default: '',
					isVisibleExpression: `$(options:command) == 'take' || $(options:command) == 'set-next'`,
				},
				playoutField,
			],
			callback: async (event) => {
				const slot = text(event.options.slot)
				const command = text(event.options.command)
				const item = text(event.options.item)
				const valid =
					slot !== '' &&
					['next', 'previous', 'take', 'set-next'].includes(command) &&
					(command !== 'set-next' || item !== '')
				await run(`Output ${slot} rundown ${command}`, valid ? `/outputs/${seg(slot)}/rundown/${command}` : null, {
					item: command === 'take' || command === 'set-next' ? item || undefined : undefined,
					scene: optional(event.options.playout),
				})
			},
		},

		output_clip_play: {
			name: 'Output: play clip',
			description: 'Plays a clip of the active clip bank by its number.',
			options: [
				slotField,
				{ type: 'number', id: 'clip', label: 'Clip number', default: 1, min: 1, max: 9999, asInteger: true },
				{
					type: 'textinput',
					id: 'bank',
					label: 'Clip bank (optional)',
					tooltip: 'Key of another bank than the active one',
					default: '',
				},
				playoutField,
			],
			callback: async (event) => {
				const slot = text(event.options.slot)
				const clip = text(event.options.clip)
				await run(
					`Output ${slot} clip ${clip}`,
					slot && clip ? `/outputs/${seg(slot)}/clips/${seg(clip)}/play` : null,
					{
						bank: optional(event.options.bank),
						scene: optional(event.options.playout),
					},
				)
			},
		},

		output_graphics_take_out_all: {
			name: 'Output: take out all graphics',
			description: 'Takes out every graphic of the playout scene. The clip keeps playing.',
			options: [slotField, playoutField],
			callback: async (event) => {
				const slot = text(event.options.slot)
				await run(`Output ${slot} graphics take-out-all`, slot ? `/outputs/${seg(slot)}/graphics/take-out-all` : null, {
					scene: optional(event.options.playout),
				})
			},
		},

		output_reload: {
			name: 'Output: reload player',
			description: 'Fetches the show again and starts a fresh graphics page.',
			options: [slotField],
			callback: async (event) => {
				const slot = text(event.options.slot)
				await run(`Output ${slot} reload`, slot ? `/outputs/${seg(slot)}/reload` : null)
			},
		},

		variable_control: {
			name: 'Variable: set / on / off / toggle',
			description:
				'Writes a station user input variable through VRA Cloud. On, off and toggle work on BOOLEAN variables only.',
			options: [
				{
					type: 'dropdown',
					id: 'variable',
					label: 'Variable',
					choices: variables,
					default: firstId(variables),
					allowCustom: true,
					tooltip: 'Variable name or id',
				},
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					default: 'set',
					choices: [{ id: 'set', label: 'Set value' }, ...ON_OFF_TOGGLE],
					disableAutoExpression: true,
				},
				{
					type: 'textinput',
					id: 'value',
					label: 'Value',
					default: '',
					isVisibleExpression: `$(options:command) == 'set'`,
				},
			],
			callback: async (event) => {
				const variable = text(event.options.variable)
				const command = text(event.options.command)
				const valid = variable !== '' && ['set', 'on', 'off', 'toggle'].includes(command)
				// `/set` always carries `value=`, also when empty: a TEXT variable may be cleared that way.
				await run(
					`Variable ${variable} ${command}`,
					valid ? `/variables/${seg(variable)}/${command}` : null,
					command === 'set' ? { value: text(event.options.value) } : {},
				)
			},
		},
	})
}

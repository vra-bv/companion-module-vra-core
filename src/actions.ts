/**
 * Actions: one per control route family of the Core API v2. Each action POSTs its route through
 * {@link VraCoreInstance.runControl}, which adds `?station=` when a station is configured, logs refusals with the
 * API's error code and message, and refreshes the state right after a success.
 *
 * Dropdowns list what the last snapshot holds (signals, macros, cameras, angles, output slots, playout scenes, banks,
 * rundowns, variables) and allow a custom value, so a button keeps working when it is set up before the Core is
 * reachable, or addressed by a name the Core resolves itself (ids exact, names case-insensitive).
 *
 * Where the API has an explicit on/off (bank AUTO, playout hold) the module adds a toggle that reads the current value
 * from the snapshot and sends the opposite.
 */

import type { CompanionActionEvent, DropdownChoice } from '@companion-module/base'
import { seg, type Query } from './api.js'
import type VraCoreInstance from './main.js'
import {
	cameraName,
	findBank,
	findCamera,
	findOutput,
	findPlayout,
	findSignal,
	findVariable,
	isSwitchableSignal,
	outputKey,
	type CoreModel,
} from './state.js'

export type ActionsSchema = {
	core_control: { options: { command: string } }
	core_maintenance: { options: { command: string } }
	studio_control: { options: { command: string; value?: string } }
	signal_control: { options: { signal: string; command: string; value?: string } }
	audio_director: { options: { command: string } }
	camera_assist: { options: { command: string } }
	macro_trigger: { options: { macro: string } }
	camera_cut: { options: { camera: string } }
	camera_preview: { options: { camera: string } }
	angle_trigger: { options: { angle: string } }
	output_scene_take: { options: { slot: string; scene: string; hold?: string } }
	output_rundown: { options: { slot: string; command: string; item?: string; rundown?: string; playout?: string } }
	output_item: { options: { slot: string; command: string; item: string; playout?: string } }
	output_bank: { options: { slot: string; command: string; bank: string; playout?: string } }
	output_bank_auto: { options: { slot: string; command: string; bank: string; playout?: string } }
	output_playout: { options: { slot: string; command: string; playout?: string } }
	output_playout_hold: { options: { slot: string; command: string; playout?: string } }
	output_reload: { options: { slot: string } }
	variable_control: { options: { variable: string; command: string; value?: string } }
}

// ── dropdown choices from the model (shared with the feedbacks and presets) ────────────────────────────────────────

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

/** Automations by name (read-only in the API: feedbacks and variables only). */
export function automationChoices(model: CoreModel): DropdownChoice<string>[] {
	return model.automations.map((a) => ({ id: a.name, label: a.enabled ? a.name : `${a.name} (disabled)` }))
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
 * A typed-in value may use `<camera>/<angle>` with an id, name or number on either side.
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

/** Distinct keys over every output, in first-seen order. */
function distinct(keys: Iterable<string>): DropdownChoice<string>[] {
	return [...new Set(keys)].map((key) => ({ id: key, label: key }))
}

/** Scenes an output's state names: the switched scene on air and the playout scenes. */
export function sceneChoices(model: CoreModel): DropdownChoice<string>[] {
	return distinct(model.outputs.flatMap((o) => [...(o.scene ? [o.scene.key] : []), ...o.playout.map((p) => p.scene)]))
}

/** Playout scenes, with an empty first choice: the Core then uses the output's only playout scene. */
export function playoutChoices(model: CoreModel): DropdownChoice<string>[] {
	return [
		{ id: '', label: '(the only playout scene)' },
		...distinct(model.outputs.flatMap((o) => o.playout.map((p) => p.scene))),
	]
}

/** Clip and graphics banks of every playout scene. */
export function bankChoices(model: CoreModel): DropdownChoice<string>[] {
	return distinct(model.outputs.flatMap((o) => o.playout.flatMap((p) => (p.banks ?? []).map((b) => b.key))))
}

/** Rundowns the outputs' playout scenes have loaded. */
export function rundownChoices(model: CoreModel): DropdownChoice<string>[] {
	return distinct(model.outputs.flatMap((o) => o.playout.flatMap((p) => (p.rundown ? [p.rundown.key] : []))))
}

/**
 * Station variables by id: names are not unique (a station can have two `bg_image` variables). The label shows the
 * name; a name typed in works too (the Core then takes the first match).
 */
export function variableChoices(model: CoreModel, booleanOnly = false): DropdownChoice<string>[] {
	return model.variables
		.filter((v) => !booleanOnly || isBooleanVariable(model, v.id))
		.map((v) => {
			const detail = model.variableDetails.get(v.id)
			const display = detail?.display_name && detail.display_name !== v.name ? ` (${detail.display_name})` : ''
			return { id: v.id, label: `${v.name}${display}` }
		})
}

/** Fleet clients the Core sees, by type and host name (`OUTPUT_PLAYER@studio-pc`). */
export function clientChoices(model: CoreModel): DropdownChoice<string>[] {
	return distinct(model.clients.map(clientKey))
}

export const clientKey = (client: { type: string | null; hostname: string | null }): string =>
	`${client.type ?? 'CLIENT'}@${client.hostname ?? '?'}`

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

/** A command option, checked against the commands the action knows. */
const pick = (value: unknown, allowed: readonly string[]): string | null => {
	const command = text(value)
	return allowed.includes(command) ? command : null
}

export function UpdateActions(self: VraCoreInstance): void {
	const model = self.model
	const signals = signalChoices(model)
	const macros = macroChoices(model)
	const cameras = cameraChoices(model)
	const angles = angleChoices(model)
	const slots = slotChoices(model)
	const scenes = sceneChoices(model)
	const playouts = playoutChoices(model)
	const banks = bankChoices(model)
	const rundowns = rundownChoices(model)
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
		type: 'dropdown' as const,
		id: 'playout' as const,
		label: 'Playout scene',
		choices: playouts,
		default: '',
		allowCustom: true,
		tooltip: 'Only needed when the output has more than one playout scene',
	}
	const bankField = {
		type: 'dropdown' as const,
		id: 'bank' as const,
		label: 'Bank',
		choices: banks,
		default: firstId(banks),
		allowCustom: true,
		tooltip: 'Key of a clip or graphics bank of the playout scene',
	}
	const commandField = (choices: DropdownChoice<string>[], fallback: string) => ({
		type: 'dropdown' as const,
		id: 'command' as const,
		label: 'Command',
		default: fallback,
		choices,
		// Referenced by other fields' visibility, so it cannot be an expression.
		disableAutoExpression: true,
	})

	/** Readable names for log lines: dropdowns hold ids. */
	const cameraLabel = (key: string): string => {
		const camera = findCamera(self.model, key)
		return camera ? `${camera.number} ${cameraName(camera)}` : key
	}
	const variableLabel = (key: string): string => findVariable(self.model, key)?.name ?? key

	/** Runs a control route, unless a required option is empty. */
	const run = async (label: string, path: string | null, query: Query = {}): Promise<void> => {
		if (path === null) {
			self.log('warn', `${label}: missing argument`)
			return
		}
		await self.runControl(label, path, query)
	}

	/** The slot and playout scene of an output action, and the playout state they point at. */
	const outputArgs = (event: CompanionActionEvent<{ slot: string; playout?: string }>) => {
		const slot = text(event.options.slot)
		const scene = text(event.options.playout)
		const output = findOutput(self.model, slot)
		return { slot, scene, output, playout: findPlayout(output, scene) }
	}

	/** `on`/`off` as sent, or for `toggle` the opposite of the current value; null when that is unknown. */
	const onOff = (command: string, current: boolean | undefined): 1 | 0 | null => {
		if (command === 'on') return 1
		if (command === 'off') return 0
		if (command === 'toggle' && current !== undefined) return current ? 0 : 1
		return null
	}

	self.setActionDefinitions({
		core_control: {
			name: 'Core: activate / deactivate / toggle',
			options: [
				commandField(
					[
						{ id: 'activate', label: 'Activate' },
						{ id: 'deactivate', label: 'Deactivate' },
						{ id: 'toggle', label: 'Toggle' },
					],
					'toggle',
				),
			],
			callback: async (event) => {
				const command = pick(event.options.command, ['activate', 'deactivate', 'toggle'])
				await run(`Core ${command}`, command ? `/core/${command}` : null)
			},
		},

		core_maintenance: {
			name: 'Core: reload configuration / restart apps',
			description:
				'Reload re-pulls the Core configuration from VRA Cloud. Restart apps restarts every VRA app on the Core machine ' +
				'(Output Player, Audio Manager, Camera Assist, …): the studio output drops while they start again.',
			options: [
				commandField(
					[
						{ id: 'reload-config', label: 'Reload configuration from VRA Cloud' },
						{ id: 'restart-apps', label: 'Restart the VRA apps on the Core machine' },
					],
					'reload-config',
				),
			],
			callback: async (event) => {
				const command = pick(event.options.command, ['reload-config', 'restart-apps'])
				// `?wait=0`: both run longer than a button should wait, and the Core would cancel a reload at its timeout.
				await run(`Core ${command}`, command ? `/core/${command}` : null, { wait: 0 })
			},
		},

		studio_control: {
			name: 'Studio: on air / recording / off air / toggle / set',
			options: [
				commandField(
					[
						{ id: 'onair', label: 'On air' },
						{ id: 'recording', label: 'Recording' },
						{ id: 'offair', label: 'Off air' },
						{ id: 'toggle', label: 'Toggle (off air ↔ on air)' },
						{ id: 'set', label: 'Set from a value' },
					],
					'toggle',
				),
				{
					type: 'textinput',
					id: 'value',
					label: 'Value',
					tooltip: 'onair, recording, offair, or 1, 2, 0. Useful with an expression.',
					default: 'onair',
					isVisibleExpression: `$(options:command) == 'set'`,
				},
			],
			callback: async (event) => {
				const command = pick(event.options.command, ['onair', 'recording', 'offair', 'toggle', 'set'])
				const value = text(event.options.value)
				await run(
					`Studio ${command === 'set' ? `set ${value}` : command}`,
					command && (command !== 'set' || value) ? `/studio/${command}` : null,
					command === 'set' ? { value } : {},
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
				commandField([...ON_OFF_TOGGLE, { id: 'set', label: 'Set value' }], 'toggle'),
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
				const command = pick(event.options.command, ['on', 'off', 'toggle', 'set'])
				await run(
					`Signal ${signal} ${command}`,
					signal && command ? `/signals/${seg(signal)}/${command}` : null,
					command === 'set' ? { value: text(event.options.value) } : {},
				)
			},
			// Learn takes the signal's current value.
			learn: (event) => {
				const signal = findSignal(self.model, text(event.options.signal))
				return signal ? { value: signal.value === null ? '' : String(signal.value) } : undefined
			},
		},

		audio_director: {
			name: 'Audio Director: on / off / toggle',
			options: [commandField(ON_OFF_TOGGLE, 'toggle')],
			callback: async (event) => {
				const command = pick(event.options.command, ['on', 'off', 'toggle'])
				await run(`Audio Director ${command}`, command ? `/audio-director/${command}` : null)
			},
		},

		camera_assist: {
			name: 'Camera Assist: on / off / toggle',
			options: [commandField(ON_OFF_TOGGLE, 'toggle')],
			callback: async (event) => {
				const command = pick(event.options.command, ['on', 'off', 'toggle'])
				await run(`Camera Assist ${command}`, command ? `/camera-assist/${command}` : null)
			},
		},

		macro_trigger: {
			name: 'Macro: trigger',
			description: 'Starts the macro on the studio. Does not wait for it to finish.',
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
				await run(`Camera ${cameraLabel(camera)} cut`, camera ? `/cameras/${seg(camera)}/cut` : null)
			},
			// Learn takes the camera on program.
			learn: () => {
				const camera = self.model.cameras.find((c) => c.on_air === true)
				return camera ? { camera: camera.id } : undefined
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
				await run(`Camera ${cameraLabel(camera)} preview`, camera ? `/cameras/${seg(camera)}/preview` : null)
			},
			learn: () => {
				const camera = self.model.cameras.find((c) => c.preview === true)
				return camera ? { camera: camera.id } : undefined
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
			description: 'Puts the scene on air as if its trigger held.',
			options: [
				slotField,
				{
					type: 'dropdown',
					id: 'scene',
					label: 'Scene',
					choices: scenes,
					default: firstId(scenes),
					allowCustom: true,
					tooltip: 'Scene key from the show',
				},
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
			// Learn takes the scene on air.
			learn: (event) => {
				const scene = findOutput(self.model, text(event.options.slot))?.scene?.key
				return scene ? { scene } : undefined
			},
		},

		output_rundown: {
			name: 'Output: rundown next / previous / take / set next / select',
			options: [
				slotField,
				commandField(
					[
						{ id: 'next', label: 'Take next item' },
						{ id: 'previous', label: 'Take previous item' },
						{ id: 'take', label: 'Take item' },
						{ id: 'set-next', label: 'Mark item as next' },
						{ id: 'select', label: 'Select rundown' },
					],
					'next',
				),
				{
					type: 'textinput',
					id: 'item',
					label: 'Item address',
					tooltip:
						'rundown/<rundown>/<story>/<item>, as in the output variables. Required for "Mark item as next"; ' +
						'"Take item" without one takes the next item',
					default: '',
					isVisibleExpression: `$(options:command) == 'take' || $(options:command) == 'set-next'`,
				},
				{
					type: 'dropdown',
					id: 'rundown',
					label: 'Rundown',
					choices: [{ id: '', label: '(follow the show)' }, ...rundowns],
					default: '',
					allowCustom: true,
					tooltip: 'Rundown key; empty lets the scene follow the show again',
					isVisibleExpression: `$(options:command) == 'select'`,
				},
				playoutField,
			],
			callback: async (event) => {
				const { slot, scene } = outputArgs(event)
				const command = pick(event.options.command, ['next', 'previous', 'take', 'set-next', 'select'])
				const item = text(event.options.item)
				const valid = slot !== '' && command !== null && (command !== 'set-next' || item !== '')
				await run(`Output ${slot} rundown ${command}`, valid ? `/outputs/${seg(slot)}/rundown/${command}` : null, {
					item: command === 'take' || command === 'set-next' ? item || undefined : undefined,
					rundown: command === 'select' ? optional(event.options.rundown) : undefined,
					scene: scene || undefined,
				})
			},
			// Learn takes the item the rundown would take next, and the active rundown.
			learn: (event) => {
				const rundown = outputArgs(event).playout?.rundown
				if (!rundown) return undefined
				return { item: rundown.next_item ?? '', rundown: rundown.key }
			},
		},

		output_item: {
			name: 'Output: item take / take out / continue / pause / resume',
			description:
				'Acts on one item of the playout scene by its address: bank/<bank>/<item> or rundown/<rundown>/<story>/<item>.',
			options: [
				slotField,
				commandField(
					[
						{ id: 'take', label: 'Take' },
						{ id: 'take-out', label: 'Take out' },
						{ id: 'continue', label: 'Continue (next animation step)' },
						{ id: 'pause', label: 'Pause (video or source)' },
						{ id: 'resume', label: 'Resume' },
					],
					'take',
				),
				{
					type: 'textinput',
					id: 'item',
					label: 'Item address',
					tooltip: 'bank/<bank>/<item> or rundown/<rundown>/<story>/<item>; Learn takes the last item that went on air',
					default: '',
				},
				playoutField,
			],
			callback: async (event) => {
				const { slot, scene } = outputArgs(event)
				const command = pick(event.options.command, ['take', 'take-out', 'continue', 'pause', 'resume'])
				const item = text(event.options.item)
				await run(
					`Output ${slot} item ${item} ${command}`,
					slot && command && item ? `/outputs/${seg(slot)}/items/${command}` : null,
					{ item, scene: scene || undefined },
				)
			},
			// Learn takes the last item that went on air.
			learn: (event) => {
				const items = outputArgs(event).playout?.on_air_items ?? []
				const latest = [...items].sort((a, b) => (b.since_at ?? 0) - (a.since_at ?? 0))[0]
				return latest ? { item: latest.item } : undefined
			},
		},

		output_bank: {
			name: 'Output: bank start / next / previous / stop',
			options: [
				slotField,
				commandField(
					[
						{ id: 'start', label: 'Start (next item, else the first)' },
						{ id: 'next', label: 'Next item' },
						{ id: 'previous', label: 'Previous item' },
						{ id: 'stop', label: 'Stop (take out its items)' },
					],
					'start',
				),
				bankField,
				playoutField,
			],
			callback: async (event) => {
				const { slot, scene } = outputArgs(event)
				const command = pick(event.options.command, ['start', 'next', 'previous', 'stop'])
				const bank = text(event.options.bank)
				await run(
					`Output ${slot} bank ${bank} ${command}`,
					slot && command && bank ? `/outputs/${seg(slot)}/banks/${seg(bank)}/${command}` : null,
					{ scene: scene || undefined },
				)
			},
		},

		output_bank_auto: {
			name: 'Output: bank AUTO on / off / toggle',
			description: 'With AUTO on, an item of the bank that ends on its own takes the next one.',
			options: [slotField, commandField(ON_OFF_TOGGLE, 'toggle'), bankField, playoutField],
			callback: async (event) => {
				const { slot, scene, output } = outputArgs(event)
				const command = text(event.options.command)
				const bank = text(event.options.bank)
				const on = onOff(command, findBank(output, bank, scene)?.auto)
				if (command === 'toggle' && on === null) {
					self.log('warn', `Output ${slot} bank ${bank} AUTO toggle: the bank is not in the Core state`)
					return
				}
				await run(
					`Output ${slot} bank ${bank} AUTO ${on === 1 ? 'on' : 'off'}`,
					slot && bank && on !== null ? `/outputs/${seg(slot)}/banks/${seg(bank)}/auto` : null,
					{ on: on ?? undefined, scene: scene || undefined },
				)
			},
		},

		output_playout: {
			name: 'Output: playout take out all / return',
			description:
				'Take out all takes out every item of the playout scene (its on-empty setting decides what follows). ' +
				'Return takes out everything and hands the output back now.',
			options: [
				slotField,
				commandField(
					[
						{ id: 'take-out-all', label: 'Take out all' },
						{ id: 'return', label: 'Return' },
					],
					'take-out-all',
				),
				playoutField,
			],
			callback: async (event) => {
				const { slot, scene } = outputArgs(event)
				const command = pick(event.options.command, ['take-out-all', 'return'])
				await run(
					`Output ${slot} playout ${command}`,
					slot && command ? `/outputs/${seg(slot)}/playout/${command}` : null,
					{ scene: scene || undefined },
				)
			},
		},

		output_playout_hold: {
			name: 'Output: playout hold on / off / toggle',
			description: 'Holds the playout scene on air when it runs empty, overriding its on-empty setting.',
			options: [slotField, commandField(ON_OFF_TOGGLE, 'toggle'), playoutField],
			callback: async (event) => {
				const { slot, scene, playout } = outputArgs(event)
				const command = text(event.options.command)
				const on = onOff(command, playout?.hold)
				if (command === 'toggle' && on === null) {
					self.log('warn', `Output ${slot} hold toggle: the playout scene is not in the Core state`)
					return
				}
				await run(
					`Output ${slot} hold ${on === 1 ? 'on' : 'off'}`,
					slot && on !== null ? `/outputs/${seg(slot)}/playout/hold` : null,
					{ on: on ?? undefined, scene: scene || undefined },
				)
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
				'Writes a station user input variable through VRA Cloud (other variables answer read_only). ' +
				'On, off and toggle work on BOOLEAN variables only.',
			options: [
				{
					type: 'dropdown',
					id: 'variable',
					label: 'Variable',
					choices: variables,
					default: firstId(variables),
					allowCustom: true,
					tooltip: 'Variable id or name',
				},
				commandField([{ id: 'set', label: 'Set value' }, ...ON_OFF_TOGGLE], 'set'),
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
				const command = pick(event.options.command, ['set', 'on', 'off', 'toggle'])
				// `/set` always carries `value=`, also when empty: a TEXT variable may be cleared that way.
				await run(
					`Variable ${variableLabel(variable)} ${command}`,
					variable && command ? `/variables/${seg(variable)}/${command}` : null,
					command === 'set' ? { value: text(event.options.value) } : {},
				)
			},
			// Learn takes the variable's current value.
			learn: (event) => {
				const variable = findVariable(self.model, text(event.options.variable))
				return variable ? { value: variable.value ?? '' } : undefined
			},
		},
	})
}

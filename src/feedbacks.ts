/**
 * Boolean feedbacks over the last snapshot. They never call the Core: the poll loop re-checks them whenever `rev`
 * changes, so a feedback costs nothing per button.
 */

import { combineRgb, type DropdownChoice } from '@companion-module/base'
import {
	automationChoices,
	bankChoices,
	cameraChoices,
	clientChoices,
	clientKey,
	firstId,
	isBooleanVariable,
	macroChoices,
	playoutChoices,
	sceneChoices,
	signalChoices,
	slotChoices,
	text,
	variableChoices,
} from './actions.js'
import type VraCoreInstance from './main.js'
import {
	findAutomation,
	findBank,
	findCamera,
	findMacro,
	findOutput,
	findPlayout,
	findSignal,
	findVariable,
	isBankOnAir,
	isVariableTrue,
	playoutWithBank,
	studioStatus,
} from './state.js'

export type FeedbacksSchema = {
	core_active: { type: 'boolean'; options: Record<string, never> }
	studio_onair: { type: 'boolean'; options: Record<string, never> }
	studio_recording: { type: 'boolean'; options: Record<string, never> }
	studio_offair: { type: 'boolean'; options: Record<string, never> }
	signal_active: { type: 'boolean'; options: { signal: string } }
	signal_value: { type: 'boolean'; options: { signal: string; value: string } }
	macro_running: { type: 'boolean'; options: { macro: string } }
	automation_state: { type: 'boolean'; options: { automation: string; state: string } }
	camera_on_air: { type: 'boolean'; options: { camera: string } }
	camera_preview: { type: 'boolean'; options: { camera: string } }
	output_status: { type: 'boolean'; options: { slot: string; status: string } }
	output_scene: { type: 'boolean'; options: { slot: string; scene: string } }
	output_playout_phase: { type: 'boolean'; options: { slot: string; playout: string; phase: string } }
	output_playout_hold: { type: 'boolean'; options: { slot: string; playout: string } }
	output_item_on_air: { type: 'boolean'; options: { slot: string; playout: string; item: string } }
	output_bank_on_air: { type: 'boolean'; options: { slot: string; playout: string; bank: string } }
	output_bank_available: { type: 'boolean'; options: { slot: string; playout: string; bank: string } }
	output_bank_auto: { type: 'boolean'; options: { slot: string; playout: string; bank: string } }
	variable_equals: { type: 'boolean'; options: { variable: string; value: string } }
	variable_true: { type: 'boolean'; options: { variable: string } }
	client_connected: { type: 'boolean'; options: { client: string } }
}

/** Tally and status colours, shared with the presets: plain broadcast colours, no gradients. */
export const Colors = {
	white: combineRgb(255, 255, 255),
	black: combineRgb(0, 0, 0),
	grey: combineRgb(64, 64, 64),
	onAir: combineRgb(204, 0, 0),
	recording: combineRgb(230, 120, 0),
	preview: combineRgb(0, 153, 51),
	active: combineRgb(0, 120, 200),
	amber: combineRgb(230, 170, 0),
} as const

const AUTOMATION_STATES: DropdownChoice<string>[] = [
	{ id: 'activated', label: 'Activated' },
	{ id: 'released', label: 'Released' },
	{ id: 'standby', label: 'Standby' },
	{ id: 'stopped', label: 'Stopped' },
]

const OUTPUT_STATUSES: DropdownChoice<string>[] = [
	{ id: 'on_air', label: 'On air' },
	{ id: 'starting', label: 'Starting' },
	{ id: 'dormant', label: 'Dormant' },
	{ id: 'fault', label: 'Fault' },
	{ id: 'offline', label: 'Offline (no state for 15 s)' },
]

const PLAYOUT_PHASES: DropdownChoice<string>[] = [
	{ id: 'on_air', label: 'On air' },
	{ id: 'taking', label: 'Taking' },
	{ id: 'holding', label: 'Holding' },
	{ id: 'returning', label: 'Returning' },
	{ id: 'standby', label: 'Standby' },
]

const same = (a: string | null | undefined, b: string): boolean =>
	typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

export function UpdateFeedbacks(self: VraCoreInstance): void {
	const model = self.model
	const signals = signalChoices(model)
	const macros = macroChoices(model)
	const automations = automationChoices(model)
	const cameras = cameraChoices(model)
	const slots = slotChoices(model)
	const scenes = sceneChoices(model)
	const playouts = playoutChoices(model)
	const banks = bankChoices(model)
	const variables = variableChoices(model)
	const booleanVariables = variableChoices(model, true)
	const clients = clientChoices(model)

	const signalField = {
		type: 'dropdown' as const,
		id: 'signal' as const,
		label: 'Signal',
		choices: signals,
		default: firstId(signals),
		allowCustom: true,
		tooltip: 'Signal identifier or id',
	}
	const cameraField = {
		type: 'dropdown' as const,
		id: 'camera' as const,
		label: 'Camera',
		choices: cameras,
		default: firstId(cameras),
		allowCustom: true,
		tooltip: 'Camera id, name or number',
	}
	const slotField = {
		type: 'dropdown' as const,
		id: 'slot' as const,
		label: 'Output slot',
		choices: slots,
		default: firstId(slots),
		allowCustom: true,
		tooltip: 'Slot key or output id',
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
	}
	const variableField = (choices: DropdownChoice<string>[]) => ({
		type: 'dropdown' as const,
		id: 'variable' as const,
		label: 'Variable',
		choices,
		default: firstId(choices),
		allowCustom: true,
		tooltip: 'Variable id or name',
	})

	/** The playout scene an output feedback points at. */
	const playoutOf = (options: { slot: unknown; playout: unknown }) =>
		findPlayout(findOutput(self.model, text(options.slot)), text(options.playout))

	self.setFeedbackDefinitions({
		core_active: {
			type: 'boolean',
			name: 'Core: active',
			description: 'True while the Core instance state is ACTIVE.',
			defaultStyle: { bgcolor: Colors.active, color: Colors.white },
			options: [],
			callback: () => self.model.core?.active === true,
		},

		studio_onair: {
			type: 'boolean',
			name: 'Studio: on air',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [],
			callback: () => studioStatus(self.model.studio) === 'onair',
		},

		studio_recording: {
			type: 'boolean',
			name: 'Studio: recording',
			defaultStyle: { bgcolor: Colors.recording, color: Colors.white },
			options: [],
			callback: () => studioStatus(self.model.studio) === 'recording',
		},

		studio_offair: {
			type: 'boolean',
			name: 'Studio: off air',
			description: 'True while the studio is off air. False while the Core does not know the studio state.',
			defaultStyle: { bgcolor: Colors.grey, color: Colors.white },
			options: [],
			callback: () => studioStatus(self.model.studio) === 'offair',
		},

		signal_active: {
			type: 'boolean',
			name: 'Signal: active',
			description: 'True when the signal is true, a number other than 0, or a non-empty text.',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [signalField],
			callback: (feedback) => findSignal(self.model, text(feedback.options.signal))?.active === true,
		},

		signal_value: {
			type: 'boolean',
			name: 'Signal: value equals',
			description: 'Compares the value as text, ignoring case (true / false, a number, or the text).',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [signalField, { type: 'textinput', id: 'value', label: 'Value', default: '' }],
			callback: (feedback) => {
				const signal = findSignal(self.model, text(feedback.options.signal))
				if (signal === undefined || signal.value === null) return false
				return same(String(signal.value), text(feedback.options.value))
			},
			learn: (feedback) => {
				const signal = findSignal(self.model, text(feedback.options.signal))
				return signal && signal.value !== null ? { value: String(signal.value) } : undefined
			},
		},

		macro_running: {
			type: 'boolean',
			name: 'Macro: running',
			defaultStyle: { bgcolor: Colors.active, color: Colors.white },
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
			callback: (feedback) => findMacro(self.model, text(feedback.options.macro))?.active === true,
		},

		automation_state: {
			type: 'boolean',
			name: 'Automation: state equals',
			description: 'Automations run in the Core; the API reports their state (standby, activated, released, stopped).',
			defaultStyle: { bgcolor: Colors.active, color: Colors.white },
			options: [
				{
					type: 'dropdown',
					id: 'automation',
					label: 'Automation',
					choices: automations,
					default: firstId(automations),
					allowCustom: true,
					tooltip: 'Automation name or id',
				},
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					choices: AUTOMATION_STATES,
					default: 'activated',
				},
			],
			callback: (feedback) =>
				findAutomation(self.model, text(feedback.options.automation))?.state === text(feedback.options.state),
			learn: (feedback) => {
				const automation = findAutomation(self.model, text(feedback.options.automation))
				return automation ? { state: automation.state } : undefined
			},
		},

		camera_on_air: {
			type: 'boolean',
			name: 'Camera: on air (program tally)',
			description: 'True while the camera is on the program bus of the live switcher.',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [cameraField],
			callback: (feedback) => findCamera(self.model, text(feedback.options.camera))?.on_air === true,
		},

		camera_preview: {
			type: 'boolean',
			name: 'Camera: on preview (preview tally)',
			description: 'True while the camera is on the preview bus of the live switcher.',
			defaultStyle: { bgcolor: Colors.preview, color: Colors.white },
			options: [cameraField],
			callback: (feedback) => findCamera(self.model, text(feedback.options.camera))?.preview === true,
		},

		output_status: {
			type: 'boolean',
			name: 'Output: status equals',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [
				slotField,
				{ type: 'dropdown', id: 'status', label: 'Status', default: 'on_air', choices: OUTPUT_STATUSES },
			],
			callback: (feedback) =>
				findOutput(self.model, text(feedback.options.slot))?.status === text(feedback.options.status),
			learn: (feedback) => {
				const status = findOutput(self.model, text(feedback.options.slot))?.status
				return status ? { status } : undefined
			},
		},

		output_scene: {
			type: 'boolean',
			name: 'Output: scene on air',
			description: 'True while the output has switched to this scene.',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [
				slotField,
				{
					type: 'dropdown',
					id: 'scene',
					label: 'Scene',
					choices: scenes,
					default: firstId(scenes),
					allowCustom: true,
				},
			],
			callback: (feedback) =>
				same(findOutput(self.model, text(feedback.options.slot))?.scene?.key, text(feedback.options.scene)),
			learn: (feedback) => {
				const scene = findOutput(self.model, text(feedback.options.slot))?.scene?.key
				return scene ? { scene } : undefined
			},
		},

		output_playout_phase: {
			type: 'boolean',
			name: 'Output: playout phase equals',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [
				slotField,
				playoutField,
				{
					type: 'dropdown',
					id: 'phase',
					label: 'Phase',
					choices: PLAYOUT_PHASES,
					default: 'on_air',
					allowCustom: true,
				},
			],
			callback: (feedback) => same(playoutOf(feedback.options)?.phase, text(feedback.options.phase)),
			learn: (feedback) => {
				const phase = playoutOf(feedback.options)?.phase
				return phase ? { phase } : undefined
			},
		},

		output_playout_hold: {
			type: 'boolean',
			name: 'Output: playout held',
			description: 'True while the playout scene is held on air when it runs empty.',
			defaultStyle: { bgcolor: Colors.recording, color: Colors.white },
			options: [slotField, playoutField],
			callback: (feedback) => playoutOf(feedback.options)?.hold === true,
		},

		output_item_on_air: {
			type: 'boolean',
			name: 'Output: item on air',
			description:
				'True while the item (bank/<bank>/<item> or rundown/<rundown>/<story>/<item>) is on air in the playout scene.',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [slotField, playoutField, { type: 'textinput', id: 'item', label: 'Item address', default: '' }],
			callback: (feedback) => {
				const item = text(feedback.options.item)
				return (playoutOf(feedback.options)?.on_air_items ?? []).some((i) => same(i.item, item))
			},
		},

		output_bank_on_air: {
			type: 'boolean',
			name: 'Output: bank on air',
			description: 'True while one of the bank’s items is on air.',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [slotField, playoutField, bankField],
			callback: (feedback) => {
				const output = findOutput(self.model, text(feedback.options.slot))
				const bank = text(feedback.options.bank)
				return isBankOnAir(playoutWithBank(output, bank, text(feedback.options.playout)), bank)
			},
		},

		output_bank_available: {
			type: 'boolean',
			name: 'Output: bank available',
			description:
				'True while the bank can be used: pinned and flex banks always, a show bank only while its program is on air.',
			defaultStyle: { bgcolor: Colors.grey, color: Colors.white },
			options: [slotField, playoutField, bankField],
			callback: (feedback) => {
				const output = findOutput(self.model, text(feedback.options.slot))
				return findBank(output, text(feedback.options.bank), text(feedback.options.playout))?.active === true
			},
		},

		output_bank_auto: {
			type: 'boolean',
			name: 'Output: bank AUTO on',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [slotField, playoutField, bankField],
			callback: (feedback) => {
				const output = findOutput(self.model, text(feedback.options.slot))
				return findBank(output, text(feedback.options.bank), text(feedback.options.playout))?.auto === true
			},
		},

		variable_equals: {
			type: 'boolean',
			name: 'Variable: equals value',
			description: 'Compares the stored text, ignoring case (BOOLEAN variables store TRUE / FALSE).',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [variableField(variables), { type: 'textinput', id: 'value', label: 'Value', default: '' }],
			callback: (feedback) => {
				const variable = findVariable(self.model, text(feedback.options.variable))
				if (variable === undefined) return false
				return (variable.value ?? '').toLowerCase() === text(feedback.options.value).toLowerCase()
			},
			learn: (feedback) => {
				const variable = findVariable(self.model, text(feedback.options.variable))
				return variable ? { value: variable.value ?? '' } : undefined
			},
		},

		variable_true: {
			type: 'boolean',
			name: 'Variable: BOOLEAN is true',
			description: 'True for TRUE, 1 or ON, as the Core reads it for toggle.',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [variableField(booleanVariables)],
			callback: (feedback) => {
				const variable = findVariable(self.model, text(feedback.options.variable))
				return variable !== undefined && isBooleanVariable(self.model, variable.id) && isVariableTrue(variable)
			},
		},

		client_connected: {
			type: 'boolean',
			name: 'Client: connected to the Core',
			description:
				'True while the VRA app (Output Player, Audio Manager, Camera Assist, …) on that machine is connected.',
			defaultStyle: { bgcolor: Colors.preview, color: Colors.white },
			options: [
				{
					type: 'dropdown',
					id: 'client',
					label: 'Client',
					choices: clients,
					default: firstId(clients),
					allowCustom: true,
					tooltip: '<TYPE>@<host name>, e.g. OUTPUT_PLAYER@studio-pc',
				},
			],
			callback: (feedback) => {
				const key = text(feedback.options.client)
				return self.model.clients.some((c) => c.active && same(clientKey(c), key))
			},
		},
	})
}

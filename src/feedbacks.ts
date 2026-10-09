/**
 * Boolean feedbacks over the last snapshot. They never call the Core: the poll loop re-checks them whenever `rev`
 * changes, so a feedback costs nothing per button.
 */

import { combineRgb } from '@companion-module/base'
import {
	cameraChoices,
	firstId,
	isBooleanVariable,
	macroChoices,
	signalChoices,
	slotChoices,
	text,
	variableChoices,
} from './actions.js'
import type VraCoreInstance from './main.js'
import { findCamera, findMacro, findOutput, findSignal, findVariable, isVariableTrue } from './state.js'

export type FeedbacksSchema = {
	core_active: { type: 'boolean'; options: Record<string, never> }
	studio_onair: { type: 'boolean'; options: Record<string, never> }
	studio_recording: { type: 'boolean'; options: Record<string, never> }
	studio_offair: { type: 'boolean'; options: Record<string, never> }
	signal_active: { type: 'boolean'; options: { signal: string } }
	camera_on_air: { type: 'boolean'; options: { camera: string } }
	camera_preview: { type: 'boolean'; options: { camera: string } }
	output_status: { type: 'boolean'; options: { slot: string; status: string } }
	variable_equals: { type: 'boolean'; options: { variable: string; value: string } }
	variable_true: { type: 'boolean'; options: { variable: string } }
	macro_running: { type: 'boolean'; options: { macro: string } }
}

/** Tally and status colours, shared with the presets. */
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

export function UpdateFeedbacks(self: VraCoreInstance): void {
	const model = self.model
	const signals = signalChoices(model)
	const cameras = cameraChoices(model)
	const slots = slotChoices(model)
	const variables = variableChoices(model)
	const booleanVariables = variableChoices(model, true)
	const macros = macroChoices(model)

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
			callback: () => self.model.studio?.status === 'onair',
		},

		studio_recording: {
			type: 'boolean',
			name: 'Studio: recording',
			defaultStyle: { bgcolor: Colors.recording, color: Colors.white },
			options: [],
			callback: () => self.model.studio?.status === 'recording',
		},

		studio_offair: {
			type: 'boolean',
			name: 'Studio: off air',
			defaultStyle: { bgcolor: Colors.grey, color: Colors.white },
			options: [],
			callback: () => self.model.studio?.status === 'offair',
		},

		signal_active: {
			type: 'boolean',
			name: 'Signal: active',
			description: 'True when the signal is true, a number other than 0, or a non-empty text.',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
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
			],
			callback: (feedback) => findSignal(self.model, text(feedback.options.signal))?.active === true,
		},

		camera_on_air: {
			type: 'boolean',
			name: 'Camera: on air (program tally)',
			description: 'True while the camera is on the program bus of the live switcher.',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [
				{
					type: 'dropdown',
					id: 'camera',
					label: 'Camera',
					choices: cameras,
					default: firstId(cameras),
					allowCustom: true,
					tooltip: 'Camera number, name or id',
				},
			],
			callback: (feedback) => findCamera(self.model, text(feedback.options.camera))?.on_air === true,
		},

		camera_preview: {
			type: 'boolean',
			name: 'Camera: on preview (preview tally)',
			description: 'True while the camera is on the preview bus of the live switcher.',
			defaultStyle: { bgcolor: Colors.preview, color: Colors.white },
			options: [
				{
					type: 'dropdown',
					id: 'camera',
					label: 'Camera',
					choices: cameras,
					default: firstId(cameras),
					allowCustom: true,
					tooltip: 'Camera number, name or id',
				},
			],
			callback: (feedback) => findCamera(self.model, text(feedback.options.camera))?.preview === true,
		},

		output_status: {
			type: 'boolean',
			name: 'Output: status equals',
			defaultStyle: { bgcolor: Colors.onAir, color: Colors.white },
			options: [
				{
					type: 'dropdown',
					id: 'slot',
					label: 'Output slot',
					choices: slots,
					default: firstId(slots),
					allowCustom: true,
					tooltip: 'Slot key or output id',
				},
				{
					type: 'dropdown',
					id: 'status',
					label: 'Status',
					default: 'on_air',
					choices: [
						{ id: 'on_air', label: 'On air' },
						{ id: 'starting', label: 'Starting' },
						{ id: 'dormant', label: 'Dormant' },
						{ id: 'fault', label: 'Fault' },
						{ id: 'offline', label: 'Offline' },
					],
				},
			],
			callback: (feedback) =>
				findOutput(self.model, text(feedback.options.slot))?.status === text(feedback.options.status),
		},

		variable_equals: {
			type: 'boolean',
			name: 'Variable: equals value',
			description: 'Compares the stored text, ignoring case (BOOLEAN variables store TRUE / FALSE).',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
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
				{ type: 'textinput', id: 'value', label: 'Value', default: '' },
			],
			callback: (feedback) => {
				const variable = findVariable(self.model, text(feedback.options.variable))
				if (variable === undefined) return false
				return (variable.value ?? '').toLowerCase() === text(feedback.options.value).toLowerCase()
			},
		},

		variable_true: {
			type: 'boolean',
			name: 'Variable: BOOLEAN is true',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [
				{
					type: 'dropdown',
					id: 'variable',
					label: 'Variable',
					choices: booleanVariables,
					default: firstId(booleanVariables),
					allowCustom: true,
					tooltip: 'Variable name or id',
				},
			],
			callback: (feedback) => {
				const variable = findVariable(self.model, text(feedback.options.variable))
				return variable !== undefined && isBooleanVariable(self.model, variable.id) && isVariableTrue(variable)
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
	})
}

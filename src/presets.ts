/**
 * Presets generated from the snapshot's lists: Core and studio buttons, then one button per signal, macro, camera,
 * output slot and BOOLEAN station variable. All are `simple` presets (one press step, boolean feedbacks), so they work
 * on every surface without the layered graphics editor.
 *
 * Preset ids are derived from the item's stable key (signal identifier, macro id, camera id, output id, variable id),
 * so a regenerated list keeps the ids of the items that stayed.
 */

import type {
	CompanionButtonStyleProps,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import { isBooleanVariable } from './actions.js'
import { Colors } from './feedbacks.js'
import type VraCoreInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { isSwitchableSignal, outputKey } from './state.js'
import { variableIdPart, type VariableLayout } from './variables.js'

type Presets = CompanionPresetDefinitions<ModuleSchema>

const style = (text: string, size: CompanionButtonStyleProps['size'] = 'auto'): CompanionButtonStyleProps => ({
	text,
	size,
	color: Colors.white,
	bgcolor: Colors.black,
	show_topbar: false,
})

/** Button text is limited; long names are cut so the variable line below them stays visible. */
const short = (value: string, max = 14): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

export function UpdatePresets(self: VraCoreInstance, layout: VariableLayout): void {
	const model = self.model
	// Variable references in button text use the connection's label: `$(<label>:studio_status)`.
	const v = (id: string): string => `$(${self.label}:${id})`

	const presets: Presets = {}
	const structure: CompanionPresetSection<ModuleSchema>[] = []

	// ── Core and studio ────────────────────────────────────────────────────────────────────────────────────────────
	presets['studio_toggle'] = {
		type: 'simple',
		name: 'Studio on air toggle',
		keywords: ['onair', 'tally', 'studio'],
		style: style(`STUDIO\\n${v('studio_status')}`, '14'),
		steps: [{ down: [{ actionId: 'studio_control', options: { command: 'toggle' } }], up: [] }],
		feedbacks: [
			{ feedbackId: 'studio_onair', options: {}, style: { bgcolor: Colors.onAir, color: Colors.white } },
			{ feedbackId: 'studio_recording', options: {}, style: { bgcolor: Colors.recording, color: Colors.white } },
		],
	}
	presets['studio_onair'] = {
		type: 'simple',
		name: 'Studio on air',
		style: style('ON AIR', '18'),
		steps: [{ down: [{ actionId: 'studio_control', options: { command: 'onair' } }], up: [] }],
		feedbacks: [{ feedbackId: 'studio_onair', options: {}, style: { bgcolor: Colors.onAir, color: Colors.white } }],
	}
	presets['studio_offair'] = {
		type: 'simple',
		name: 'Studio off air',
		style: style('OFF AIR', '18'),
		steps: [{ down: [{ actionId: 'studio_control', options: { command: 'offair' } }], up: [] }],
		feedbacks: [{ feedbackId: 'studio_offair', options: {}, style: { bgcolor: Colors.grey, color: Colors.white } }],
	}
	presets['core_toggle'] = {
		type: 'simple',
		name: 'Core activate / deactivate toggle',
		keywords: ['core', 'active'],
		style: style(`CORE\\n${v('core_state')}`, '14'),
		steps: [{ down: [{ actionId: 'core_control', options: { command: 'toggle' } }], up: [] }],
		feedbacks: [{ feedbackId: 'core_active', options: {}, style: { bgcolor: Colors.active, color: Colors.white } }],
	}
	structure.push({
		id: 'core_studio',
		name: 'Core and studio',
		definitions: ['studio_toggle', 'studio_onair', 'studio_offair', 'core_toggle'],
	})

	// ── Signals: a toggle for switchable signals, a display for the others ─────────────────────────────────────────
	const signalIds: string[] = []
	for (const signal of model.signals) {
		const id = `signal_${variableIdPart(signal.identifier)}`
		const variableId = layout.signals.get(signal.id)
		const name = signal.label ?? signal.identifier
		const feedbacks = [
			{
				feedbackId: 'signal_active' as const,
				options: { signal: signal.identifier },
				style: { bgcolor: Colors.amber, color: Colors.black },
			},
		]
		presets[id] = isSwitchableSignal(signal)
			? {
					type: 'simple',
					name: `${name}: toggle`,
					keywords: ['signal', signal.identifier],
					style: style(short(name).toUpperCase(), '14'),
					steps: [
						{
							down: [{ actionId: 'signal_control', options: { signal: signal.identifier, command: 'toggle' } }],
							up: [],
						},
					],
					feedbacks,
				}
			: {
					type: 'simple',
					name: `${name}: value`,
					keywords: ['signal', signal.identifier],
					style: style(variableId ? `${short(name)}\\n${v(variableId)}` : short(name), '14'),
					steps: [],
					feedbacks,
				}
		signalIds.push(id)
	}
	if (signalIds.length > 0) structure.push({ id: 'signals', name: 'Signals', definitions: signalIds })

	// ── Macros ────────────────────────────────────────────────────────────────────────────────────────────────────
	const macroIds: string[] = []
	for (const macro of model.macros) {
		const id = `macro_${variableIdPart(macro.id)}`
		presets[id] = {
			type: 'simple',
			name: `Macro ${macro.name}`,
			keywords: ['macro', macro.name],
			style: style(short(macro.name, 20), '14'),
			steps: [{ down: [{ actionId: 'macro_trigger', options: { macro: macro.name } }], up: [] }],
			feedbacks: [
				{
					feedbackId: 'macro_running',
					options: { macro: macro.name },
					style: { bgcolor: Colors.active, color: Colors.white },
				},
			],
		}
		macroIds.push(id)
	}
	if (macroIds.length > 0) structure.push({ id: 'macros', name: 'Macros', definitions: macroIds })

	// ── Cameras: cut on press, red on program, green on preview ───────────────────────────────────────────────────
	const cameraIds: string[] = []
	for (const camera of model.cameras) {
		const id = `camera_${variableIdPart(camera.id)}`
		const key = String(camera.number)
		presets[id] = {
			type: 'simple',
			name: `Camera ${camera.number} ${camera.name}: cut`,
			keywords: ['camera', 'tally', camera.name],
			style: style(`CAM ${camera.number}\\n${short(camera.name)}`, '14'),
			steps: [{ down: [{ actionId: 'camera_cut', options: { camera: key } }], up: [] }],
			// Program is listed last so it wins when the switcher reports a camera on both buses.
			feedbacks: [
				{
					feedbackId: 'camera_preview',
					options: { camera: key },
					style: { bgcolor: Colors.preview, color: Colors.white },
				},
				{
					feedbackId: 'camera_on_air',
					options: { camera: key },
					style: { bgcolor: Colors.onAir, color: Colors.white },
				},
			],
		}
		cameraIds.push(id)
	}
	if (cameraIds.length > 0) structure.push({ id: 'cameras', name: 'Cameras', definitions: cameraIds })

	// ── Outputs: status display that takes the next rundown item on press ─────────────────────────────────────────
	const outputIds: string[] = []
	for (const output of model.outputs) {
		const slot = outputKey(output)
		const id = `output_${variableIdPart(output.output_id)}`
		const status = layout.outputs.get(output.output_id)?.status
		presets[id] = {
			type: 'simple',
			name: `Output ${slot}: status, press for rundown next`,
			keywords: ['output', 'rundown', slot],
			style: style(status ? `${short(slot)}\\n${v(status)}` : short(slot), '14'),
			steps: [{ down: [{ actionId: 'output_rundown', options: { slot, command: 'next' } }], up: [] }],
			feedbacks: [
				{
					feedbackId: 'output_status',
					options: { slot, status: 'fault' },
					style: { bgcolor: Colors.recording, color: Colors.white },
				},
				{
					feedbackId: 'output_status',
					options: { slot, status: 'on_air' },
					style: { bgcolor: Colors.onAir, color: Colors.white },
				},
			],
		}
		outputIds.push(id)
	}
	if (outputIds.length > 0) structure.push({ id: 'outputs', name: 'Outputs', definitions: outputIds })

	// ── BOOLEAN station variables: toggle ─────────────────────────────────────────────────────────────────────────
	const variableIds: string[] = []
	for (const variable of model.variables) {
		if (!isBooleanVariable(model, variable.id)) continue
		const id = `variable_${variableIdPart(variable.id)}`
		const display = model.variableDetails.get(variable.id)?.display_name ?? variable.name
		presets[id] = {
			type: 'simple',
			name: `Variable ${display}: toggle`,
			keywords: ['variable', variable.name],
			style: style(short(display).toUpperCase(), '14'),
			steps: [
				{ down: [{ actionId: 'variable_control', options: { variable: variable.name, command: 'toggle' } }], up: [] },
			],
			feedbacks: [
				{
					feedbackId: 'variable_true',
					options: { variable: variable.name },
					style: { bgcolor: Colors.amber, color: Colors.black },
				},
			],
		}
		variableIds.push(id)
	}
	if (variableIds.length > 0) structure.push({ id: 'variables', name: 'Variables', definitions: variableIds })

	self.setPresetDefinitions(structure, presets)
}

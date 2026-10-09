/**
 * Presets generated from the snapshot: studio, Core and station buttons, then buttons per signal, macro, automation,
 * camera and angle, output slot (scenes, rundown, playout, banks), station variable and fleet client. They are
 * rebuilt whenever the Core adds, removes or renames one of those, so the preset list follows the studio.
 *
 * All are `simple` presets (one press step, boolean feedbacks), so they work on every surface. Colours are plain
 * broadcast colours: red on air or program, green preview, orange recording or held, blue running or active, amber a
 * set flag.
 *
 * Preset ids are derived from the item's stable key (signal identifier, macro id, camera id, output id, bank key,
 * variable id), so a regenerated list keeps the ids of the items that stayed.
 */

import type {
	CompanionButtonStyleProps,
	CompanionPresetDefinitions,
	CompanionPresetGroup,
	CompanionPresetSection,
	CompanionSimplePresetDefinition,
} from '@companion-module/base'
import { clientKey, isBooleanVariable } from './actions.js'
import { Colors } from './feedbacks.js'
import type VraCoreInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { cameraName, isSwitchableSignal, outputKey, type OutputItem } from './state.js'
import { variableIdPart, type VariableLayout } from './variables.js'

type Preset = CompanionSimplePresetDefinition<ModuleSchema>
type Feedback = NonNullable<Preset['feedbacks']>[number]
type ActionStep = NonNullable<Preset['steps']>[number]

const style = (text: string, size: CompanionButtonStyleProps['size'] = '14'): CompanionButtonStyleProps => ({
	text,
	size,
	color: Colors.white,
	bgcolor: Colors.black,
	show_topbar: false,
})

/** Button text is limited; long names are cut so the line below them stays visible. */
const short = (value: string, max = 14): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

const press = (action: ActionStep['down'][number]): ActionStep[] => [{ down: [action], up: [] }]

const lit = (feedbackId: Feedback['feedbackId'], options: Record<string, unknown>, bgcolor: number): Feedback =>
	({
		feedbackId,
		options,
		style: { bgcolor, color: bgcolor === Colors.amber ? Colors.black : Colors.white },
	}) as Feedback

export function UpdatePresets(self: VraCoreInstance, layout: VariableLayout): void {
	const model = self.model
	// Variable references in button text use the connection's label: `$(<label>:studio_status)`.
	const v = (id: string): string => `$(${self.label}:${id})`

	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const sections: CompanionPresetSection<ModuleSchema>[] = []

	/** Adds presets and returns their ids, in order. */
	const add = (entries: [string, Preset][]): string[] => {
		for (const [id, preset] of entries) presets[id] = preset
		return entries.map(([id]) => id)
	}
	const group = (id: string, name: string, ids: string[]): CompanionPresetGroup<ModuleSchema> => ({
		id,
		type: 'simple',
		name,
		presets: ids,
	})

	// ── Studio ────────────────────────────────────────────────────────────────────────────────────────────────────
	const studioFeedbacks = [lit('studio_onair', {}, Colors.onAir), lit('studio_recording', {}, Colors.recording)]
	sections.push({
		id: 'studio',
		name: 'Studio',
		keywords: ['onair', 'on air', 'tally', 'recording'],
		definitions: add([
			[
				'studio_toggle',
				{
					type: 'simple',
					name: 'Studio on air toggle, shows the status',
					style: style(`STUDIO\\n${v('studio_status')}`),
					steps: press({ actionId: 'studio_control', options: { command: 'toggle' } }),
					feedbacks: studioFeedbacks,
				},
			],
			[
				'studio_onair',
				{
					type: 'simple',
					name: 'Studio on air',
					style: style('ON AIR', '18'),
					steps: press({ actionId: 'studio_control', options: { command: 'onair' } }),
					feedbacks: [lit('studio_onair', {}, Colors.onAir)],
				},
			],
			[
				'studio_recording',
				{
					type: 'simple',
					name: 'Studio recording',
					style: style('REC', '18'),
					steps: press({ actionId: 'studio_control', options: { command: 'recording' } }),
					feedbacks: [lit('studio_recording', {}, Colors.recording)],
				},
			],
			[
				'studio_offair',
				{
					type: 'simple',
					name: 'Studio off air',
					style: style('OFF AIR', '18'),
					steps: press({ actionId: 'studio_control', options: { command: 'offair' } }),
					feedbacks: [lit('studio_offair', {}, Colors.grey)],
				},
			],
			[
				'studio_status',
				{
					type: 'simple',
					name: 'Studio status (display)',
					style: style(`${v('studio_name')}\\n${v('studio_status')}`),
					steps: [],
					feedbacks: studioFeedbacks,
				},
			],
		]),
	})

	// ── Core ──────────────────────────────────────────────────────────────────────────────────────────────────────
	const coreActive = [lit('core_active', {}, Colors.active)]
	sections.push({
		id: 'core',
		name: 'Core',
		description: 'Restart apps is left out on purpose: add it as an action where a mis-press cannot happen.',
		definitions: add([
			[
				'core_toggle',
				{
					type: 'simple',
					name: 'Core activate / deactivate toggle',
					style: style(`CORE\\n${v('core_state')}`),
					steps: press({ actionId: 'core_control', options: { command: 'toggle' } }),
					feedbacks: coreActive,
				},
			],
			[
				'core_activate',
				{
					type: 'simple',
					name: 'Core activate',
					style: style('CORE\\nON'),
					steps: press({ actionId: 'core_control', options: { command: 'activate' } }),
					feedbacks: coreActive,
				},
			],
			[
				'core_deactivate',
				{
					type: 'simple',
					name: 'Core deactivate',
					style: style('CORE\\nOFF'),
					steps: press({ actionId: 'core_control', options: { command: 'deactivate' } }),
					feedbacks: [],
				},
			],
			[
				'core_reload_config',
				{
					type: 'simple',
					name: 'Core: reload configuration from VRA Cloud',
					style: style('RELOAD\\nCONFIG'),
					steps: press({ actionId: 'core_maintenance', options: { command: 'reload-config' } }),
					feedbacks: [],
				},
			],
		]),
	})

	// ── Station ───────────────────────────────────────────────────────────────────────────────────────────────────
	sections.push({
		id: 'station',
		name: 'Station and program',
		definitions: add([
			[
				'station_name',
				{
					type: 'simple',
					name: 'Station on the studio (display)',
					style: style(`STATION\\n${v('station_name')}`, 'auto'),
					steps: [],
					feedbacks: [],
				},
			],
			[
				'program_title',
				{
					type: 'simple',
					name: 'Program on air (display)',
					style: style(v('program_title'), 'auto'),
					steps: [],
					feedbacks: [],
				},
			],
		]),
	})

	// ── Signals: toggle, on and off for switchable signals, a display for the others ───────────────────────────────
	const signalGroups: CompanionPresetGroup<ModuleSchema>[] = []
	for (const signal of model.signals) {
		const key = variableIdPart(signal.identifier)
		const variableId = layout.signals.get(signal.id)
		const name = signal.label ?? signal.identifier
		const options = { signal: signal.identifier }
		const active = [lit('signal_active', options, Colors.amber)]
		const keywords = ['signal', signal.identifier]
		const value = variableId ? `\\n${v(variableId)}` : ''
		const entries: [string, Preset][] = isSwitchableSignal(signal)
			? [
					[
						`signal_${key}`,
						{
							type: 'simple',
							name: `${name}: toggle`,
							keywords,
							style: style(short(name).toUpperCase()),
							steps: press({ actionId: 'signal_control', options: { ...options, command: 'toggle' } }),
							feedbacks: active,
						},
					],
					[
						`signal_${key}_on`,
						{
							type: 'simple',
							name: `${name}: on`,
							keywords,
							style: style(`${short(name).toUpperCase()}\\nON`),
							steps: press({ actionId: 'signal_control', options: { ...options, command: 'on' } }),
							feedbacks: active,
						},
					],
					[
						`signal_${key}_off`,
						{
							type: 'simple',
							name: `${name}: off`,
							keywords,
							style: style(`${short(name).toUpperCase()}\\nOFF`),
							steps: press({ actionId: 'signal_control', options: { ...options, command: 'off' } }),
							feedbacks: active,
						},
					],
				]
			: [
					[
						`signal_${key}`,
						{
							type: 'simple',
							name: `${name}: value`,
							keywords,
							style: style(`${short(name)}${value}`, 'auto'),
							steps: [],
							feedbacks: active,
						},
					],
				]
		signalGroups.push(group(`signal_${key}`, name, add(entries)))
	}
	if (signalGroups.length > 0) sections.push({ id: 'signals', name: 'Signals', definitions: signalGroups })

	// ── Macros ────────────────────────────────────────────────────────────────────────────────────────────────────
	const macroIds: string[] = []
	for (const macro of model.macros) {
		macroIds.push(
			...add([
				[
					`macro_${variableIdPart(macro.id)}`,
					{
						type: 'simple',
						name: `Macro ${macro.name}`,
						keywords: ['macro', macro.name],
						style: style(short(macro.name, 20)),
						steps: press({ actionId: 'macro_trigger', options: { macro: macro.name } }),
						feedbacks: [lit('macro_running', { macro: macro.name }, Colors.active)],
					},
				],
			]),
		)
	}
	if (macroIds.length > 0)
		sections.push({ id: 'macros', name: 'Macros', description: 'Blue while the macro runs.', definitions: macroIds })

	// ── Automations: state display (the API does not control automations) ────────────────────────────────────────
	const automationIds: string[] = []
	for (const automation of model.automations) {
		const variableId = layout.automations.get(automation.id)
		automationIds.push(
			...add([
				[
					`automation_${variableIdPart(automation.id)}`,
					{
						type: 'simple',
						name: `Automation ${automation.name}: state`,
						keywords: ['automation', automation.name],
						style: style(variableId ? `${short(automation.name, 20)}\\n${v(variableId)}` : automation.name, 'auto'),
						steps: [],
						feedbacks: [lit('automation_state', { automation: automation.name, state: 'activated' }, Colors.active)],
					},
				],
			]),
		)
	}
	if (automationIds.length > 0)
		sections.push({
			id: 'automations',
			name: 'Automations',
			description: 'Blue while activated.',
			definitions: automationIds,
		})

	// ── Cameras: cut (red on program, green on preview), preview, and one button per angle ────────────────────────
	const cameraGroups: CompanionPresetGroup<ModuleSchema>[] = []
	for (const camera of model.cameras) {
		const key = variableIdPart(camera.id)
		const name = cameraName(camera)
		const options = { camera: camera.id }
		// Program is listed last so it wins when the switcher reports a camera on both buses.
		const tally = [lit('camera_preview', options, Colors.preview), lit('camera_on_air', options, Colors.onAir)]
		const keywords = ['camera', 'tally', name]
		const entries: [string, Preset][] = [
			[
				`camera_${key}`,
				{
					type: 'simple',
					name: `Camera ${camera.number} ${name}: cut`,
					keywords,
					style: style(`CAM ${camera.number}\\n${short(name)}`),
					steps: press({ actionId: 'camera_cut', options }),
					feedbacks: tally,
				},
			],
			[
				`camera_${key}_preview`,
				{
					type: 'simple',
					name: `Camera ${camera.number} ${name}: preview`,
					keywords,
					style: style(`PVW ${camera.number}\\n${short(name)}`),
					steps: press({ actionId: 'camera_preview', options }),
					feedbacks: [lit('camera_preview', options, Colors.preview)],
				},
			],
		]
		for (const angle of model.angles.get(camera.id) ?? []) {
			const angleName = angle.name ?? angle.id
			entries.push([
				`angle_${key}_${variableIdPart(angle.id)}`,
				{
					type: 'simple',
					name: `Camera ${camera.number} ${name}: angle ${angleName}`,
					keywords: [...keywords, 'angle', angleName],
					style: style(`${camera.number} · ${short(angleName, 12)}`),
					steps: press({ actionId: 'angle_trigger', options: { angle: `${camera.id}::${angle.id}` } }),
					feedbacks: [lit('camera_on_air', options, Colors.onAir)],
				},
			])
		}
		cameraGroups.push(group(`camera_${key}`, `${camera.number} · ${name}`, add(entries)))
	}
	if (cameraGroups.length > 0)
		sections.push({
			id: 'cameras',
			name: 'Cameras',
			description: 'Red on program, green on preview (tally from the live switcher).',
			definitions: cameraGroups,
		})

	// ── Outputs: status, scenes, rundown, playout and banks per slot ──────────────────────────────────────────────
	const outputGroups: CompanionPresetGroup<ModuleSchema>[] = []
	for (const output of model.outputs) outputGroups.push(...outputPresets(output))
	if (outputGroups.length > 0)
		sections.push({
			id: 'outputs',
			name: 'Outputs',
			description: 'Output Player slots: status, scenes, rundown, playout and clip / graphics banks.',
			definitions: outputGroups,
		})

	// ── Station variables: BOOLEAN toggle, value display for the others ───────────────────────────────────────────
	const variableIds: string[] = []
	for (const variable of model.variables) {
		const display = model.variableDetails.get(variable.id)?.display_name ?? variable.name
		const variableId = layout.variables.get(variable.id)
		const keywords = ['variable', variable.name]
		const id = `variable_${variableIdPart(variable.id)}`
		variableIds.push(
			...add([
				isBooleanVariable(model, variable.id)
					? [
							id,
							{
								type: 'simple',
								name: `Variable ${display}: toggle`,
								keywords,
								style: style(short(display).toUpperCase()),
								steps: press({
									actionId: 'variable_control',
									options: { variable: variable.id, command: 'toggle' },
								}),
								feedbacks: [lit('variable_true', { variable: variable.id }, Colors.amber)],
							},
						]
					: [
							id,
							{
								type: 'simple',
								name: `Variable ${display}: value`,
								keywords,
								style: style(variableId ? `${short(display)}\\n${v(variableId)}` : short(display), 'auto'),
								steps: [],
								feedbacks: [],
							},
						],
			]),
		)
	}
	if (variableIds.length > 0)
		sections.push({
			id: 'variables',
			name: 'Station variables',
			description: 'BOOLEAN variables toggle (amber when TRUE); the others show their value.',
			definitions: variableIds,
		})

	// ── Fleet clients: connected display ──────────────────────────────────────────────────────────────────────────
	const clientIds: string[] = []
	for (const client of model.clients) {
		const key = clientKey(client)
		clientIds.push(
			...add([
				[
					`client_${variableIdPart(key)}`,
					{
						type: 'simple',
						name: `${key}: connected`,
						keywords: ['client', client.type ?? '', client.hostname ?? ''],
						style: style(`${short(client.type ?? 'CLIENT')}\\n${short(client.hostname ?? '')}`, 'auto'),
						steps: [],
						feedbacks: [lit('client_connected', { client: key }, Colors.preview)],
					},
				],
			]),
		)
	}
	if (clientIds.length > 0)
		sections.push({
			id: 'clients',
			name: 'VRA apps',
			description: 'Green while the app on that machine is connected to the Core.',
			definitions: clientIds,
		})

	self.setPresetDefinitions(sections, presets)

	/** The groups of one output slot: its status and scenes, then rundown/playout and banks per playout scene. */
	function outputPresets(output: OutputItem): CompanionPresetGroup<ModuleSchema>[] {
		const slot = outputKey(output)
		const key = variableIdPart(output.output_id)
		const ids = layout.outputs.get(output.output_id)
		const keywords = ['output', 'player', slot]
		const groups: CompanionPresetGroup<ModuleSchema>[] = []
		const statusFeedbacks = [
			lit('output_status', { slot, status: 'fault' }, Colors.recording),
			lit('output_status', { slot, status: 'on_air' }, Colors.onAir),
		]

		const general: [string, Preset][] = [
			[
				`output_${key}`,
				{
					type: 'simple',
					name: `Output ${slot}: status`,
					keywords,
					style: style(ids ? `${short(slot)}\\n${v(ids.status)}` : short(slot), 'auto'),
					steps: [],
					feedbacks: statusFeedbacks,
				},
			],
			[
				`output_${key}_reload`,
				{
					type: 'simple',
					name: `Output ${slot}: reload player`,
					keywords,
					style: style(`${short(slot)}\\nRELOAD`),
					steps: press({ actionId: 'output_reload', options: { slot } }),
					feedbacks: [lit('output_status', { slot, status: 'fault' }, Colors.recording)],
				},
			],
		]
		if (output.scene) {
			const scene = output.scene.key
			general.push([
				`output_${key}_scene_${variableIdPart(scene)}`,
				{
					type: 'simple',
					name: `Output ${slot}: take scene ${scene}`,
					keywords: [...keywords, 'scene', scene],
					style: style(`${short(slot)}\\n${short(output.scene.name ?? scene)}`),
					steps: press({ actionId: 'output_scene_take', options: { slot, scene, hold: 'none' } }),
					feedbacks: [lit('output_scene', { slot, scene }, Colors.onAir)],
				},
			])
		}
		groups.push(group(`output_${key}`, `${slot}`, add(general)))

		for (const playout of output.playout) {
			// With one playout scene the Core picks it by itself; with more, every command names it.
			const scene = output.playout.length === 1 ? '' : playout.scene
			const p = `output_${key}_${variableIdPart(playout.scene)}`
			const label = scene ? `${slot} ${playout.scene}` : slot
			const on = { slot, playout: scene }
			const entries: [string, Preset][] = [
				[
					`${p}_take_out_all`,
					{
						type: 'simple',
						name: `Output ${label}: playout take out all`,
						keywords: [...keywords, 'playout', 'clear'],
						style: style(`${short(label)}\\nCLEAR`),
						steps: press({ actionId: 'output_playout', options: { ...on, command: 'take-out-all' } }),
						feedbacks: [lit('output_playout_phase', { ...on, phase: 'on_air' }, Colors.onAir)],
					},
				],
				[
					`${p}_return`,
					{
						type: 'simple',
						name: `Output ${label}: playout return`,
						keywords: [...keywords, 'playout', 'return'],
						style: style(`${short(label)}\\nRETURN`),
						steps: press({ actionId: 'output_playout', options: { ...on, command: 'return' } }),
						feedbacks: [lit('output_playout_phase', { ...on, phase: 'returning' }, Colors.recording)],
					},
				],
				[
					`${p}_hold`,
					{
						type: 'simple',
						name: `Output ${label}: playout hold toggle`,
						keywords: [...keywords, 'playout', 'hold'],
						style: style(`${short(label)}\\nHOLD`),
						steps: press({ actionId: 'output_playout_hold', options: { ...on, command: 'toggle' } }),
						feedbacks: [lit('output_playout_hold', on, Colors.recording)],
					},
				],
			]
			if (playout.rundown) {
				const nextVar = output.playout.length === 1 ? `output_${variableIdPart(slot)}_rundown_next` : null
				entries.push(
					[
						`${p}_rundown_next`,
						{
							type: 'simple',
							name: `Output ${label}: rundown next`,
							keywords: [...keywords, 'rundown', 'next', 'cg'],
							style: style(nextVar ? `NEXT\\n${v(nextVar)}` : `${short(label)}\\nNEXT`, 'auto'),
							steps: press({ actionId: 'output_rundown', options: { ...on, command: 'next' } }),
							feedbacks: [],
						},
					],
					[
						`${p}_rundown_previous`,
						{
							type: 'simple',
							name: `Output ${label}: rundown previous`,
							keywords: [...keywords, 'rundown', 'previous'],
							style: style(`${short(label)}\\nPREV`),
							steps: press({ actionId: 'output_rundown', options: { ...on, command: 'previous' } }),
							feedbacks: [],
						},
					],
				)
			}
			groups.push(group(p, scene ? `${slot} · ${playout.scene}` : `${slot} · playout`, add(entries)))

			const bankEntries: [string, Preset][] = []
			for (const bank of playout.banks) {
				const b = `${p}_bank_${variableIdPart(bank.key)}`
				const options = { ...on, bank: bank.key }
				const nextVar = layout.banks.get(`${output.output_id}/${bank.key}`)
				const bankKeywords = [...keywords, 'bank', bank.key]
				const onAir = [lit('output_bank_on_air', options, Colors.onAir)]
				bankEntries.push(
					[
						`${b}_start`,
						{
							type: 'simple',
							name: `Output ${label}: bank ${bank.key} start`,
							keywords: bankKeywords,
							style: style(nextVar ? `${short(bank.key)}\\n${v(nextVar)}` : short(bank.key), 'auto'),
							steps: press({ actionId: 'output_bank', options: { ...options, command: 'start' } }),
							feedbacks: onAir,
						},
					],
					[
						`${b}_next`,
						{
							type: 'simple',
							name: `Output ${label}: bank ${bank.key} next`,
							keywords: bankKeywords,
							style: style(`${short(bank.key)}\\nNEXT`),
							steps: press({ actionId: 'output_bank', options: { ...options, command: 'next' } }),
							feedbacks: onAir,
						},
					],
					[
						`${b}_previous`,
						{
							type: 'simple',
							name: `Output ${label}: bank ${bank.key} previous`,
							keywords: bankKeywords,
							style: style(`${short(bank.key)}\\nPREV`),
							steps: press({ actionId: 'output_bank', options: { ...options, command: 'previous' } }),
							feedbacks: onAir,
						},
					],
					[
						`${b}_stop`,
						{
							type: 'simple',
							name: `Output ${label}: bank ${bank.key} stop`,
							keywords: bankKeywords,
							style: style(`${short(bank.key)}\\nSTOP`),
							steps: press({ actionId: 'output_bank', options: { ...options, command: 'stop' } }),
							feedbacks: onAir,
						},
					],
					[
						`${b}_auto`,
						{
							type: 'simple',
							name: `Output ${label}: bank ${bank.key} AUTO toggle`,
							keywords: [...bankKeywords, 'auto'],
							style: style(`${short(bank.key)}\\nAUTO`),
							steps: press({ actionId: 'output_bank_auto', options: { ...options, command: 'toggle' } }),
							feedbacks: [lit('output_bank_auto', options, Colors.amber)],
						},
					],
				)
			}
			if (bankEntries.length > 0)
				groups.push(group(`${p}_banks`, `${scene ? `${slot} · ${playout.scene}` : slot} · banks`, add(bankEntries)))
		}
		return groups
	}
}

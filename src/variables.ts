/**
 * Companion variables: fixed ones for the connection, Core, studio, station and program, and some per signal, macro,
 * automation, camera, output slot (with its playout scenes and banks), station variable and fleet client in the
 * snapshot.
 *
 * The layout (which ids exist, and which item each one reads) is rebuilt only when the structure changes; values are
 * recomputed from the model on every new `rev`. Items that disappear from the model read as empty, so a lost
 * connection blanks the tally instead of freezing the last state.
 */

import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import { clientKey } from './actions.js'
import { cameraName, findBank, findPlayout, outputKey, studioStatus, type CoreModel, type OutputItem } from './state.js'

/** Who the Core says Companion is, from `GET /api/v2`. */
export interface ConnectionInfo {
	version: string
	principal: string
	access: string
}

type Read = (model: CoreModel) => string | number | boolean | undefined

export interface VariableLayout {
	definitions: CompanionVariableDefinitions<CompanionVariableValues>
	/** variable id → how its value is read from the model */
	readers: Map<string, Read>
	/** signal id → variable id, for the presets */
	signals: Map<string, string>
	/** macro id → variable id */
	macros: Map<string, string>
	/** automation id → variable id */
	automations: Map<string, string>
	/** output id → variable ids */
	outputs: Map<string, { status: string; scene: string }>
	/** `<output id>/<bank key>` → variable id of the bank's next item */
	banks: Map<string, string>
	/** station variable id → variable id */
	variables: Map<string, string>
}

/**
 * A Companion-safe id part: lowercase letters, digits and underscores. Signal identifiers (`audio-director`), slot
 * keys and variable names are mapped through this, so `audio-director` becomes `signal_audio_director`.
 */
export function variableIdPart(raw: string): string {
	const cleaned = raw
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
	return cleaned.length > 0 ? cleaned : 'unnamed'
}

const bool = (value: boolean | null | undefined): string => (value === null || value === undefined ? '' : String(value))

export function buildVariableLayout(model: CoreModel, connection: () => ConnectionInfo | null): VariableLayout {
	const definitions: CompanionVariableDefinitions<CompanionVariableValues> = {}
	const readers = new Map<string, Read>()
	const layout: VariableLayout = {
		definitions,
		readers,
		signals: new Map(),
		macros: new Map(),
		automations: new Map(),
		outputs: new Map(),
		banks: new Map(),
		variables: new Map(),
	}

	// Two items can map onto the same id (`a-b` and `a_b`); the later one gets a numeric suffix.
	const define = (base: string, name: string, read: Read): string => {
		let id = base
		for (let n = 2; id in definitions; n++) id = `${base}_${n}`
		definitions[id] = { name }
		readers.set(id, read)
		return id
	}

	define('core_version', 'Core version', () => connection()?.version ?? '')
	define('connected_as', 'How the Core sees Companion: loopback, device:<name>, lan, …', () => connection()?.principal)
	define('access', 'Access of this connection: read or control', () => connection()?.access)
	define('core_state', 'Core state (ACTIVE, DEACTIVATED, STARTING, …)', (m) => m.core?.state ?? '')
	define('core_active', 'Core active: true or false', (m) => bool(m.core?.active))
	define('studio_name', 'Studio name', (m) => m.studio?.name ?? '')
	define('studio_status', 'Studio status (onair, recording, offair; empty while unknown)', (m) =>
		studioStatus(m.studio),
	)
	define('station_name', 'Station on the studio', (m) => m.station?.name ?? '')
	define('program_title', 'Title of the program on air', (m) => m.programTitle)
	define('program_titles', 'Titles of every program on air, separated by " / "', (m) => m.programTitles.join(' / '))

	for (const signal of model.signals) {
		const id = define(
			`signal_${variableIdPart(signal.identifier)}`,
			`Signal ${signal.label ?? signal.identifier} (${signal.identifier})`,
			(m) => {
				const value = m.signals.find((s) => s.id === signal.id)?.value
				return value === null || value === undefined ? '' : value
			},
		)
		layout.signals.set(signal.id, id)
	}

	for (const macro of model.macros) {
		const id = define(
			`macro_${variableIdPart(macro.name)}_running`,
			`Macro ${macro.name} running: true or false`,
			(m) => bool(m.macros.find((x) => x.id === macro.id)?.active),
		)
		layout.macros.set(macro.id, id)
	}

	for (const automation of model.automations) {
		const id = define(
			`automation_${variableIdPart(automation.name)}_state`,
			`Automation ${automation.name} state (standby, activated, released, stopped)`,
			(m) => m.automations.find((a) => a.id === automation.id)?.state ?? '',
		)
		layout.automations.set(automation.id, id)
	}

	for (const camera of model.cameras) {
		const find = (m: CoreModel) => m.cameras.find((c) => c.id === camera.id)
		const label = `Camera ${camera.number} (${cameraName(camera)})`
		define(`camera_${camera.number}_onair`, `${label} on air: true, false, empty when unknown`, (m) =>
			bool(find(m)?.on_air),
		)
		define(`camera_${camera.number}_preview`, `${label} on preview: true, false, empty when unknown`, (m) =>
			bool(find(m)?.preview),
		)
		define(`camera_${camera.number}_name`, `Camera ${camera.number} name`, (m) => {
			const found = find(m)
			return found ? cameraName(found) : ''
		})
	}
	define('camera_program', 'Number of the camera on program, empty when none', (m) =>
		String(m.cameras.find((c) => c.on_air === true)?.number ?? ''),
	)
	define('camera_preview', 'Number of the camera on preview, empty when none', (m) =>
		String(m.cameras.find((c) => c.preview === true)?.number ?? ''),
	)

	for (const output of model.outputs) {
		defineOutput(output)
	}

	for (const variable of model.variables) {
		const display = model.variableDetails.get(variable.id)?.display_name
		const id = define(`var_${variableIdPart(variable.name)}`, `Variable ${display ?? variable.name}`, (m) => {
			return m.variables.find((v) => v.id === variable.id)?.value ?? ''
		})
		layout.variables.set(variable.id, id)
	}

	for (const client of model.clients) {
		const key = clientKey(client)
		define(`client_${variableIdPart(key)}`, `${key} connected: true or false`, (m) =>
			bool(m.clients.find((c) => clientKey(c) === key)?.active),
		)
	}

	return layout

	function defineOutput(output: OutputItem): void {
		const slot = outputKey(output)
		const part = variableIdPart(slot)
		const find = (m: CoreModel) => m.outputs.find((o) => o.output_id === output.output_id)
		const status = define(
			`output_${part}_status`,
			`Output ${slot} status (starting, on_air, dormant, fault, offline)`,
			(m) => find(m)?.status ?? '',
		)
		const scene = define(
			`output_${part}_scene`,
			`Output ${slot}: key of the scene on air`,
			(m) => find(m)?.scene?.key ?? '',
		)
		layout.outputs.set(output.output_id, { status, scene })

		// Per playout scene; with one playout scene (the usual case) its variables carry no scene key.
		const single = output.playout.length === 1
		for (const playout of output.playout) {
			const p = single ? `output_${part}` : `output_${part}_${variableIdPart(playout.scene)}`
			const label = single ? `Output ${slot}` : `Output ${slot} ${playout.scene}`
			const read = (m: CoreModel) => findPlayout(find(m), playout.scene)
			define(`${p}_phase`, `${label}: playout phase`, (m) => read(m)?.phase ?? '')
			define(`${p}_hold`, `${label}: playout held, true or false`, (m) => bool(read(m)?.hold))
			define(`${p}_on_air_items`, `${label}: items on air, comma separated`, (m) =>
				(read(m)?.on_air_items ?? []).map((i) => i.item).join(', '),
			)
			define(`${p}_rundown`, `${label}: active rundown`, (m) => read(m)?.rundown?.key ?? '')
			define(`${p}_rundown_on_air`, `${label}: rundown item on air`, (m) => read(m)?.rundown?.on_air_item ?? '')
			define(`${p}_rundown_next`, `${label}: rundown item next`, (m) => read(m)?.rundown?.next_item ?? '')
			for (const bank of playout.banks ?? []) {
				const b = `${p}_bank_${variableIdPart(bank.key)}`
				const readBank = (m: CoreModel) => findBank(find(m), bank.key, playout.scene)
				const next = define(`${b}_next`, `${label}: bank ${bank.key} next item`, (m) => readBank(m)?.next ?? '')
				define(`${b}_auto`, `${label}: bank ${bank.key} AUTO, true or false`, (m) => bool(readBank(m)?.auto))
				layout.banks.set(`${output.output_id}/${bank.key}`, next)
			}
		}
	}
}

export function variableValues(model: CoreModel, layout: VariableLayout): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const [id, read] of layout.readers) values[id] = read(model) ?? ''
	return values
}

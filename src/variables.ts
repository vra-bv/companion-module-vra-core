/**
 * Companion variables: fixed ones for the Core, studio, station and program, and one or two per signal, camera,
 * output slot and station variable in the snapshot.
 *
 * The layout (which ids exist, and which item each one reads) is rebuilt only when the structure changes; values are
 * recomputed from the model on every new `rev`. Items that disappear from the model read as empty, so a lost
 * connection blanks the tally instead of freezing the last state.
 */

import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import { outputKey, type CoreModel } from './state.js'

export interface VariableLayout {
	definitions: CompanionVariableDefinitions<CompanionVariableValues>
	/** signal id → variable id */
	signals: Map<string, string>
	/** camera id → variable id */
	cameras: Map<string, string>
	/** output id → variable ids */
	outputs: Map<string, { status: string; scene: string }>
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

export function buildVariableLayout(model: CoreModel): VariableLayout {
	const definitions: CompanionVariableDefinitions<CompanionVariableValues> = {
		core_state: { name: 'Core state (ACTIVE, DEACTIVATED, STARTING, …)' },
		studio_status: { name: 'Studio status (onair, recording, offair)' },
		station_name: { name: 'Station on the studio' },
		program_title: { name: 'Title of the program on air' },
	}
	const layout: VariableLayout = {
		definitions,
		signals: new Map(),
		cameras: new Map(),
		outputs: new Map(),
		variables: new Map(),
	}

	// Two items can map onto the same id (`a-b` and `a_b`); the later one gets a numeric suffix.
	const claim = (base: string): string => {
		let id = base
		for (let n = 2; id in definitions; n++) id = `${base}_${n}`
		return id
	}

	for (const signal of model.signals) {
		const id = claim(`signal_${variableIdPart(signal.identifier)}`)
		definitions[id] = { name: `Signal ${signal.label ?? signal.identifier} (${signal.identifier})` }
		layout.signals.set(signal.id, id)
	}

	for (const camera of model.cameras) {
		const id = claim(`camera_${camera.number}_onair`)
		definitions[id] = { name: `Camera ${camera.number} (${camera.name}) on air: true, false, empty when unknown` }
		layout.cameras.set(camera.id, id)
	}

	for (const output of model.outputs) {
		const part = variableIdPart(outputKey(output))
		const status = claim(`output_${part}_status`)
		definitions[status] = { name: `Output ${outputKey(output)} status (starting, on_air, dormant, fault, offline)` }
		const scene = claim(`output_${part}_scene`)
		definitions[scene] = { name: `Output ${outputKey(output)}: key of the scene on air` }
		layout.outputs.set(output.output_id, { status, scene })
	}

	for (const variable of model.variables) {
		const id = claim(`var_${variableIdPart(variable.name)}`)
		const display = model.variableDetails.get(variable.id)?.display_name
		definitions[id] = { name: `Variable ${display ?? variable.name}` }
		layout.variables.set(variable.id, id)
	}

	return layout
}

export function variableValues(model: CoreModel, layout: VariableLayout): CompanionVariableValues {
	const values: CompanionVariableValues = {
		core_state: model.core?.state ?? '',
		studio_status: model.studio?.status ?? '',
		station_name: model.station?.name ?? '',
		program_title: model.programTitle,
	}

	const signals = new Map(model.signals.map((s) => [s.id, s]))
	for (const [signalId, id] of layout.signals) values[id] = signals.get(signalId)?.value ?? ''

	const cameras = new Map(model.cameras.map((c) => [c.id, c]))
	for (const [cameraId, id] of layout.cameras) values[id] = cameras.get(cameraId)?.on_air ?? ''

	const outputs = new Map(model.outputs.map((o) => [o.output_id, o]))
	for (const [outputId, ids] of layout.outputs) {
		const output = outputs.get(outputId)
		values[ids.status] = output?.status ?? ''
		values[ids.scene] = output?.scene?.key ?? ''
	}

	const variables = new Map(model.variables.map((v) => [v.id, v]))
	for (const [variableId, id] of layout.variables) values[id] = variables.get(variableId)?.value ?? ''

	return values
}

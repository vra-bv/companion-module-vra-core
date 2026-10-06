/**
 * Types for the Core API v2 answers this module reads, and the normalised model the actions, feedbacks,
 * variables and presets are built from.
 *
 * Shapes follow `GET /api/v2/state` (the poller snapshot), `GET /api/v2/cameras` and `GET /api/v2/variables`.
 * JSON keys are snake_case and nulls are kept, so every optional value is typed `| null`.
 */

export type StudioStatus = 'onair' | 'recording' | 'offair'

export type OutputStatus = 'starting' | 'on_air' | 'dormant' | 'fault' | 'offline'

export interface CoreSection {
	/** `ACTIVE`, `DEACTIVATED`, `STARTING`, … */
	state: string | null
	/** True only for `ACTIVE`. */
	active: boolean
}

export interface StudioSection {
	id?: string | null
	name?: string | null
	status: StudioStatus | string | null
	/** True for on air and for recording. */
	active: boolean
	/** 0 off air, 1 on air, 2 recording. */
	state: number | null
}

export interface StationRef {
	id: string | null
	name: string | null
}

export interface SignalItem {
	id: string
	identifier: string
	label: string | null
	/** `INPUT` signals can be written, `OUTPUT` signals are read-only. */
	direction: string | null
	/** `BOOLEAN`, `INTEGER` or `STRING`. */
	value_type: string | null
	enabled: boolean
	scope: string | null
	value: boolean | number | string | null
	/** True for `true`, a number other than 0, or a non-empty text. */
	active: boolean
	source: string | null
	changed_at: number | null
}

export interface MacroItem {
	id: string
	name: string
	enabled: boolean
	/** True while the macro runs. */
	active: boolean
	current_item_id: string | null
	last_trigger_at: number | null
}

export interface AutomationItem {
	id: string
	name: string
	enabled: boolean
	/** `standby`, `activated`, `released` or `stopped`. */
	state: string | null
}

export interface OutputScene {
	key: string
	name: string | null
	since_at: number | null
	cause: string | null
}

export interface OutputItem {
	output_id: string
	/** The slot key, e.g. `main`; null when the player reports none (then the output id addresses it). */
	slot: string | null
	status: OutputStatus | string | null
	station_id: string | null
	/** The switched scene on air, or null. */
	scene: OutputScene | null
	variant: { key: string; cause: string | null } | null
	playout: unknown[] | null
}

export interface CameraItem {
	id: string
	name: string
	/** 1-based position in the camera list; the API accepts it as `{id}`. */
	number: number
	/** Tally from the live switcher; null when the Core cannot tell. */
	on_air: boolean | null
	preview: boolean | null
}

export interface VariableItem {
	id: string
	name: string
	/** The stored text; BOOLEAN variables store `TRUE` / `FALSE`. */
	value: string | null
}

/**
 * A list section of the snapshot. The Core sends signals, macros and automations as a bare array and outputs,
 * cameras and variables as `{items: [...]}`; both forms are accepted so a later Core that aligns them keeps working.
 * Null when the feature is switched off for this device or not loaded yet.
 */
export type ListSection<T> = T[] | { items: T[] | null } | null | undefined

/** `GET /api/v2/state`. */
export interface StateSnapshot {
	/** A fingerprint of the snapshot's content (fits in 53 bits): compare for equality only. */
	rev: number
	core: CoreSection | null
	studio: StudioSection | null
	station: StationRef | null
	/** Titles of the programs on air; null when the station feature is off. */
	program: string[] | null
	signals: ListSection<SignalItem>
	macros: ListSection<MacroItem>
	automations: ListSection<AutomationItem>
	outputs: ListSection<OutputItem>
	cameras: ListSection<CameraItem>
	variables: ListSection<VariableItem>
	clients: unknown[] | null
	ok: boolean
}

/** `GET /api/v2`: what this device may use. */
export interface ApiInfo {
	version: string | null
	features: Record<string, { read: boolean; control: boolean }> | null
	principal: { name: string; access: 'read' | 'control' | string } | null
	ok: boolean
}

/** One entry of `GET /api/v2/cameras` (the snapshot leaves the angles out). */
export interface CameraDetail extends CameraItem {
	angles: { id: string; name: string }[] | null
}

/** One entry of `GET /api/v2/variables` (the snapshot leaves the type out). */
export interface VariableDetail extends VariableItem {
	display_name: string | null
	/** `TEXT`, `LONG_TEXT`, `BOOLEAN`, `NUMBER`, `OPTIONS`, … */
	data_type: string | null
}

/** A section's items, or null when the section is absent. */
export function itemsOf<T>(section: ListSection<T>): T[] | null {
	if (section === null || section === undefined) return null
	if (Array.isArray(section)) return section
	return Array.isArray(section.items) ? section.items : null
}

/**
 * The model everything in the module reads. Lists are empty (not null) when the Core does not offer them, so
 * callers never branch on null; `available` says which sections the Core actually sent.
 */
export interface CoreModel {
	rev: number | null
	core: CoreSection | null
	studio: StudioSection | null
	station: StationRef | null
	programTitle: string
	signals: SignalItem[]
	macros: MacroItem[]
	automations: AutomationItem[]
	outputs: OutputItem[]
	cameras: CameraItem[]
	variables: VariableItem[]
	/** Angles per camera id, from `GET /api/v2/cameras`. */
	angles: Map<string, { id: string; name: string }[]>
	/** Variable details per variable id, from `GET /api/v2/variables`. */
	variableDetails: Map<string, VariableDetail>
	available: {
		signals: boolean
		macros: boolean
		outputs: boolean
		cameras: boolean
		variables: boolean
	}
}

export function emptyModel(): CoreModel {
	return {
		rev: null,
		core: null,
		studio: null,
		station: null,
		programTitle: '',
		signals: [],
		macros: [],
		automations: [],
		outputs: [],
		cameras: [],
		variables: [],
		angles: new Map(),
		variableDetails: new Map(),
		available: { signals: false, macros: false, outputs: false, cameras: false, variables: false },
	}
}

/** Builds the model from a snapshot, carrying the detail maps over from the previous model. */
export function modelFromSnapshot(snapshot: StateSnapshot, previous: CoreModel): CoreModel {
	const signals = itemsOf(snapshot.signals)
	const macros = itemsOf(snapshot.macros)
	const automations = itemsOf(snapshot.automations)
	const outputs = itemsOf(snapshot.outputs)
	const cameras = itemsOf(snapshot.cameras)
	const variables = itemsOf(snapshot.variables)
	return {
		rev: snapshot.rev,
		core: snapshot.core,
		studio: snapshot.studio,
		station: snapshot.station,
		programTitle: snapshot.program?.[0] ?? '',
		signals: signals ?? [],
		macros: macros ?? [],
		automations: automations ?? [],
		outputs: outputs ?? [],
		cameras: cameras ?? [],
		variables: variables ?? [],
		angles: previous.angles,
		variableDetails: previous.variableDetails,
		available: {
			signals: signals !== null,
			macros: macros !== null,
			outputs: outputs !== null,
			cameras: cameras !== null,
			variables: variables !== null,
		},
	}
}

/**
 * A key over everything the definitions depend on (which signals, macros, cameras, slots and variables exist and
 * what they are called), but not over their values. The module redefines actions, feedbacks, variables and presets
 * only when this changes; value changes (tally, on air, signal values) only update variable values and feedbacks.
 */
export function structureKey(model: CoreModel): string {
	return JSON.stringify([
		model.available,
		model.signals.map((s) => [s.id, s.identifier, s.label, s.value_type, s.direction, s.enabled]),
		model.macros.map((m) => [m.id, m.name]),
		model.outputs.map((o) => [o.output_id, o.slot]),
		model.cameras.map((c) => [c.id, c.name, c.number]),
		model.variables.map((v) => [v.id, v.name]),
	])
}

// ── lookups, matching the Core's own rules (ids exact, names case-insensitive) ───────────────────────────────────

const same = (a: string | null | undefined, b: string): boolean =>
	typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

export function findSignal(model: CoreModel, key: string): SignalItem | undefined {
	return model.signals.find((s) => s.id === key) ?? model.signals.find((s) => same(s.identifier, key))
}

export function findMacro(model: CoreModel, key: string): MacroItem | undefined {
	return model.macros.find((m) => m.id === key) ?? model.macros.find((m) => same(m.name, key))
}

/** A camera by id, by 1-based number or by name. */
export function findCamera(model: CoreModel, key: string): CameraItem | undefined {
	const byId = model.cameras.find((c) => c.id === key)
	if (byId) return byId
	if (/^\d+$/.test(key)) {
		const byNumber = model.cameras.find((c) => c.number === Number(key))
		if (byNumber) return byNumber
	}
	return model.cameras.find((c) => same(c.name, key))
}

/** An output by output id or by slot key. */
export function findOutput(model: CoreModel, key: string): OutputItem | undefined {
	return model.outputs.find((o) => o.output_id === key) ?? model.outputs.find((o) => same(o.slot, key))
}

export function findVariable(model: CoreModel, key: string): VariableItem | undefined {
	return model.variables.find((v) => v.id === key) ?? model.variables.find((v) => same(v.name, key))
}

/** How an output is addressed in routes and dropdowns: its slot key, else its id. */
export function outputKey(output: OutputItem): string {
	return output.slot ?? output.output_id
}

/** True for a BOOLEAN variable whose value is `TRUE` (any case). */
export function isVariableTrue(variable: VariableItem | undefined): boolean {
	return typeof variable?.value === 'string' && variable.value.toUpperCase() === 'TRUE'
}

/** Signals the API can switch with `/on`, `/off` and `/toggle`: enabled `INPUT` signals of type BOOLEAN or INTEGER. */
export function isSwitchableSignal(signal: SignalItem): boolean {
	return (
		signal.enabled &&
		signal.direction !== 'OUTPUT' &&
		(signal.value_type === 'BOOLEAN' || signal.value_type === 'INTEGER')
	)
}

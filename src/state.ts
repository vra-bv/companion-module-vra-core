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
	id: string | null
	name: string | null
	/** Never null: the Core reports `offair` while the studio state is unknown (`state` null). */
	status: StudioStatus | string
	/** True for on air and for recording. */
	active: boolean
	/** 0 off air, 1 on air, 2 recording; null while unknown. */
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
	state: string
}

export interface OutputScene {
	key: string
	name: string | null
	since_at: number | null
	cause: string | null
}

/** An item on air in a playout scene (`playout[].on_air_items[]`). */
export interface OnAirItem {
	/** The item key (`<story>.<item>` for rundown items). */
	item: string
	/** Where it came from: `rundown`, `bank`, `direct`, … */
	from: string | null
	zone: string | null
	kind: string | null
	since_at: number | null
	ends_at: number | null
	paused: boolean
	step: number | null
	leftover_until: number | null
}

/** A clip or graphics bank of a playout scene (`playout[].banks[]`). */
export interface PlayoutBank {
	key: string
	kind: string | null
	/**
	 * True while the bank can be used: always for pinned and flex banks, for a show bank only while its program is on
	 * air (otherwise its commands answer `409 bank_not_active`). Not whether an item of it is on air: see
	 * {@link isBankOnAir}.
	 */
	active: boolean
	program_id: string | null
	/** The item `banks/{bank}/next` takes. */
	next: string | null
	/** AUTO: an item that ends on its own takes the next one. */
	auto: boolean
}

export interface PlayoutRundown {
	key: string
	manual: boolean
	wrap: boolean
	program_id: string | null
	next_item: string | null
	on_air_item: string | null
	played: string[]
}

/**
 * One playout scene of an output (`playout[]`), as the Output Player v2 reports it. The module supports only that
 * player: an older one sends no `banks` or `on_air_items` (see {@link isPlayoutV2}).
 */
export interface OutputPlayout {
	scene: string
	/** `standby`, `taking`, `on_air`, `returning` or `holding`. */
	phase: string
	/** Held on air when it runs empty. */
	hold: boolean
	/** `auto_return` or `hold`. */
	on_empty: string | null
	interrupted_by: string | null
	on_air_items: OnAirItem[]
	banks: PlayoutBank[]
	rundown: PlayoutRundown | null
}

/** True when every playout scene of the outputs has the Output Player v2 shape. */
export function isPlayoutV2(outputs: OutputItem[]): boolean {
	return outputs.every((o) => o.playout.every((p) => Array.isArray(p.banks) && Array.isArray(p.on_air_items)))
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
	playout: OutputPlayout[]
}

export interface CameraItem {
	id: string
	/** Null when the camera has no name in the rack; see {@link cameraName}. */
	name: string | null
	/**
	 * 1-based position in the camera list; the API accepts it as `{id}`. It shifts when a camera is added or removed
	 * before it, so dropdowns and presets address cameras by id.
	 */
	number: number
	/** Tally from the live switcher; null when the Core cannot tell. */
	on_air: boolean | null
	preview: boolean | null
}

export interface VariableItem {
	id: string
	/** The variable's key. The snapshot may send null; the model then uses the id, which the API accepts too. */
	name: string
	/** The stored text; BOOLEAN variables store `TRUE` / `FALSE`. */
	value: string | null
}

export interface ClientItem {
	type: string | null
	id: string | null
	hostname: string | null
	active: boolean
}

/**
 * A list section of the snapshot: `{items: [...]}`, or null when the feature is switched off for the studio or this
 * device, its source is not loaded yet, or (automations, outputs, variables) the device is pinned to another station.
 */
export type ListSection<T> = { items: T[] | null } | null | undefined

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
	/** Names may be null here; {@link modelFromSnapshot} replaces them with the id. */
	variables: ListSection<Omit<VariableItem, 'name'> & { name: string | null }>
	clients: ClientItem[] | null
	ok: boolean
}

/** How the Core identified the caller: `principal.kind` of `GET /api/v2`. */
export type PrincipalKind = 'loopback' | 'device' | 'legacy' | 'lan' | 'anonymous'

/** One route of `GET /api/v2` `endpoints` (only the routes of features the studio has switched on). */
export interface ApiEndpoint {
	id: string
	feature: string
	kind: 'read' | 'control' | string
	scope: 'studio' | 'station' | string
	methods: string[]
	path: string
	plain_path: string | null
	summary: string | null
}

/** `GET /api/v2`: the Core, the studio's API settings and the caller. */
export interface ApiInfo {
	version: string
	server: string | null
	studio: StudioSection | null
	station: StationRef | null
	core: CoreSection | null
	api: { enabled: boolean; lan_access: 'off' | 'allowlist' | 'lan' | string; legacy_auth: boolean } | null
	/**
	 * The studio-wide feature switches (all eleven features, always). A device limited to some features still sees
	 * `true` here for the others and gets `403 forbidden` when it calls them.
	 */
	features: Record<string, { read: boolean; control: boolean }> | null
	principal: { kind: PrincipalKind | string; name: string; access: 'read' | 'control' | string } | null
	endpoints: ApiEndpoint[] | null
	ok: boolean
}

/** One entry of `GET /api/v2/cameras` (the snapshot leaves the angles out). */
export interface CameraDetail extends CameraItem {
	angles: { id: string; name: string | null }[]
	core: { action: string | null; value: string | null; switcher_id: string | null } | null
	thumb: string | null
}

/** One entry of `GET /api/v2/variables` (the snapshot leaves the type out). */
export interface VariableDetail {
	id: string
	name: string | null
	display_name: string | null
	/** `TEXT`, `LONG_TEXT`, `BOOLEAN`, `NUMBER`, `OPTIONS`, … */
	data_type: string | null
	value: string | null
}

/** A section's items, or null when the section is absent. */
export function itemsOf<T>(section: ListSection<T>): T[] | null {
	if (section === null || section === undefined) return null
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
	/** Every program on air (a station can run more than one). */
	programTitles: string[]
	signals: SignalItem[]
	macros: MacroItem[]
	automations: AutomationItem[]
	outputs: OutputItem[]
	cameras: CameraItem[]
	variables: VariableItem[]
	clients: ClientItem[]
	/** Angles per camera id, from `GET /api/v2/cameras`. */
	angles: Map<string, { id: string; name: string | null }[]>
	/** Variable details per variable id, from `GET /api/v2/variables`. */
	variableDetails: Map<string, VariableDetail>
	available: {
		signals: boolean
		macros: boolean
		automations: boolean
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
		programTitles: [],
		signals: [],
		macros: [],
		automations: [],
		outputs: [],
		cameras: [],
		variables: [],
		clients: [],
		angles: new Map(),
		variableDetails: new Map(),
		available: { signals: false, macros: false, automations: false, outputs: false, cameras: false, variables: false },
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
		programTitles: snapshot.program ?? [],
		signals: signals ?? [],
		macros: macros ?? [],
		automations: automations ?? [],
		outputs: outputs ?? [],
		cameras: cameras ?? [],
		variables: (variables ?? []).map((v) => ({ id: v.id, name: v.name ?? v.id, value: v.value })),
		clients: Array.isArray(snapshot.clients) ? snapshot.clients : [],
		angles: previous.angles,
		variableDetails: previous.variableDetails,
		available: {
			signals: signals !== null,
			macros: macros !== null,
			automations: automations !== null,
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
		model.automations.map((a) => [a.id, a.name]),
		model.outputs.map((o) => [
			o.output_id,
			o.slot,
			o.playout.map((p) => [p.scene, p.rundown?.key ?? null, p.banks.map((b) => b.key)]),
		]),
		model.clients.map((c) => [c.type, c.hostname]),
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

/**
 * A camera the way the Core resolves `{id}`: by id, then by name (only when exactly one camera has it), then by
 * 1-based number. A camera named `2` therefore wins over camera number 2, as it does in the API.
 */
export function findCamera(model: CoreModel, key: string): CameraItem | undefined {
	const byId = model.cameras.find((c) => c.id === key)
	if (byId) return byId
	const byName = model.cameras.filter((c) => same(c.name, key))
	if (byName.length === 1) return byName[0]
	if (byName.length > 1) return undefined
	if (/^\d+$/.test(key)) return model.cameras.find((c) => c.number === Number(key))
	return undefined
}

/** A camera's display name: its name, or `Camera <n>` when the rack has none. */
export function cameraName(camera: CameraItem): string {
	return camera.name ?? `Camera ${camera.number}`
}

export function findAutomation(model: CoreModel, key: string): AutomationItem | undefined {
	return model.automations.find((a) => a.id === key) ?? model.automations.find((a) => same(a.name, key))
}

/** An output by output id or by slot key. */
export function findOutput(model: CoreModel, key: string): OutputItem | undefined {
	return model.outputs.find((o) => o.output_id === key) ?? model.outputs.find((o) => same(o.slot, key))
}

export function findVariable(model: CoreModel, key: string): VariableItem | undefined {
	return model.variables.find((v) => v.id === key) ?? model.variables.find((v) => same(v.name, key))
}

/** A playout scene of an output: the named one, else the only one. */
export function findPlayout(output: OutputItem | undefined, scene: string): OutputPlayout | undefined {
	if (output === undefined) return undefined
	if (scene !== '') return output.playout.find((p) => same(p.scene, scene))
	return output.playout.length === 1 ? output.playout[0] : undefined
}

/** A bank of an output, looked up in the named playout scene, else in all of them. */
export function findBank(output: OutputItem | undefined, bank: string, scene = ''): PlayoutBank | undefined {
	if (output === undefined) return undefined
	const scenes = scene !== '' ? output.playout.filter((p) => same(p.scene, scene)) : output.playout
	for (const p of scenes) {
		const found = p.banks.find((b) => same(b.key, bank))
		if (found) return found
	}
	return undefined
}

/** True while an item of the bank is on air in the playout scene (items are addressed `bank/<bank>/<item>`). */
export function isBankOnAir(playout: OutputPlayout | undefined, bank: string): boolean {
	const prefix = `bank/${bank.toLowerCase()}/`
	return (playout?.on_air_items ?? []).some((i) => i.item.toLowerCase().startsWith(prefix))
}

/** The playout scene of an output that holds the bank: the named one, else the first that has it. */
export function playoutWithBank(output: OutputItem | undefined, bank: string, scene = ''): OutputPlayout | undefined {
	if (output === undefined) return undefined
	if (scene !== '') return findPlayout(output, scene)
	return output.playout.find((p) => p.banks.some((b) => same(b.key, bank)))
}

/** How an output is addressed in routes and dropdowns: its slot key, else its id. */
export function outputKey(output: OutputItem): string {
	return output.slot ?? output.output_id
}

/** True for a variable value the Core's own toggle reads as on: `TRUE`, `1` or `ON` (any case). */
export function isVariableTrue(variable: VariableItem | undefined): boolean {
	const value = variable?.value?.trim().toUpperCase()
	return value === 'TRUE' || value === '1' || value === 'ON'
}

/** The studio's status for display: empty while the Core does not know it (it then reports `offair`). */
export function studioStatus(studio: StudioSection | null): string {
	if (studio === null || studio.state === null) return ''
	return studio.status
}

/** Signals the API can switch with `/on`, `/off` and `/toggle`: enabled `INPUT` signals of type BOOLEAN or INTEGER. */
export function isSwitchableSignal(signal: SignalItem): boolean {
	return (
		signal.enabled &&
		signal.direction !== 'OUTPUT' &&
		(signal.value_type === 'BOOLEAN' || signal.value_type === 'INTEGER')
	)
}

/**
 * VRA Core: Bitfocus Companion module for the VRA Core API v2.
 *
 * Connection model:
 * 1. Probe `GET /api/v2` (features and principal). It decides the status: Ok, AuthenticationFailure (401),
 *    InsufficientPermissions (403), ConnectionFailure (no answer). Until it succeeds it is retried every few seconds.
 * 2. Poll `GET /api/v2/state` every `pollInterval`. The snapshot's `rev` is a content fingerprint: an unchanged `rev`
 *    means nothing to do. A new `rev` updates the variable values and re-checks the feedbacks; when the set of signals,
 *    macros, cameras, slots or variables changed as well, the action/feedback/variable/preset definitions are rebuilt
 *    (after reading the camera angles and variable types the snapshot leaves out).
 * 3. Actions POST their control route and ask for an immediate poll on success, so buttons update without waiting a
 *    full interval.
 *
 * The poll loop is a chain of timeouts with one request in flight at a time; a config change starts a new generation
 * and the old chain stops at its next step.
 */

import {
	InstanceBase,
	InstanceStatus,
	type CompanionVariableValues,
	type SomeCompanionConfigField,
} from '@companion-module/base'
import { CoreApiClient, SLOW_CONTROL_ACK_TIMEOUT_MS, type ApiResult, type Query } from './api.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { configProblem, GetConfigFields, normaliseConfig, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { emptyModel, isPlayoutV2, modelFromSnapshot, structureKey, type CoreModel } from './state.js'
import { UpgradeScripts } from './upgrades.js'
import { buildVariableLayout, variableValues, type ConnectionInfo, type VariableLayout } from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	// Variable ids depend on the studio (one per signal, camera, slot, variable), so they are not typed per id.
	variables: CompanionVariableValues
}

export { UpgradeScripts }

/** Retry interval while the Core is unreachable or refuses the device. */
const RECONNECT_INTERVAL_MS = 5000

/**
 * How often camera angles and variable types are read again. The snapshot leaves them out, so an angle added to a
 * camera that stayed would otherwise never reach the dropdowns and presets.
 */
const DETAILS_REFRESH_MS = 60_000

export default class VraCoreInstance extends InstanceBase<ModuleSchema> {
	/** The current config, defaults filled in. */
	config: ModuleConfig = normaliseConfig(undefined)
	/** The last snapshot, normalised. Read by the action and feedback callbacks. */
	model: CoreModel = emptyModel()

	#token: string | undefined
	#client: CoreApiClient | null = null
	/** From the last successful `GET /api/v2`; null while not connected. */
	#connection: ConnectionInfo | null = null
	#layout: VariableLayout = buildVariableLayout(emptyModel(), () => null)
	/** The structure the definitions were last built for; null forces a rebuild. */
	#structure: string | null = null
	/** When the camera angles and variable details were last read. */
	#detailsAt = 0
	/** True once an output with an Output Player before v2 was reported, so it is logged once. */
	#warnedPlayout = false
	/** The status text of the connection, kept to restore it after a passing failure. */
	#okText = ''

	/** Bumped on every (re)start; a loop step of an older generation stops. */
	#generation = 0
	#timer: ReturnType<typeof setTimeout> | null = null
	#busy = false
	#refreshRequested = false
	/** True once `GET /api/v2` succeeded; false sends the loop back to probing. */
	#connected = false
	/** The last poll failure, so a Core that stays down is logged once and not every interval. */
	#lastFailure: string | null = null

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.#applyConfig(config, secrets)
		this.#defineAll()
		this.#start()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.#applyConfig(config, secrets)
		this.#start()
	}

	async destroy(): Promise<void> {
		this.#stop()
		this.#client = null
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/**
	 * Runs a control route on behalf of an action. Adds `?station=` when a station is configured, logs a refusal with
	 * the API's error code and message (and the player's or Camera Assist's own answer when there is one), and asks
	 * for an immediate poll after a success. Never throws: a failed press is a log line, not a module error.
	 */
	async runControl(label: string, path: string, query: Query = {}): Promise<boolean> {
		const client = this.#client
		if (client === null) {
			this.log('warn', `${label}: no Core address configured`)
			return false
		}

		// Variable writes go through VRA Cloud and camera commands through Camera Assist: both may need longer.
		const ackTimeout = /^\/(variables|cameras|angles)\//.test(path) ? SLOW_CONTROL_ACK_TIMEOUT_MS : undefined
		const result = await client.control(path, { ...query, station: this.config.station || undefined }, ackTimeout)
		if (result.ok) {
			this.log('debug', `${label}: ok (${result.status})`)
			this.#refreshSoon()
			return true
		}

		this.log('warn', `${label} failed: ${describeFailure(result)}${ackDetail(result.body)}`)
		if (result.status === 401) this.updateStatus(InstanceStatus.AuthenticationFailure, result.message)
		return false
	}

	// ── lifecycle ─────────────────────────────────────────────────────────────────────────────────────────────────

	#applyConfig(config: ModuleConfig, secrets: ModuleSecrets | undefined): void {
		this.config = normaliseConfig(config)
		this.#token = secrets?.token?.trim() || undefined
	}

	#start(): void {
		this.#stop()
		this.#generation++
		this.#connected = false
		this.#connection = null
		this.#lastFailure = null
		if (this.model.rev !== null) {
			this.#clearModel()
			this.#publishState()
		}

		const problem = configProblem(this.config, this.#token)
		if (problem !== null) {
			this.#client = null
			this.updateStatus(InstanceStatus.BadConfig, problem)
			return
		}

		this.#client = new CoreApiClient({ host: this.config.host, port: this.config.port, token: this.#token })
		this.updateStatus(InstanceStatus.Connecting, this.#client.baseUrl)
		this.#schedule(0)
	}

	#stop(): void {
		if (this.#timer !== null) clearTimeout(this.#timer)
		this.#timer = null
		this.#refreshRequested = false
	}

	#schedule(delayMs: number): void {
		const generation = this.#generation
		if (this.#timer !== null) clearTimeout(this.#timer)
		this.#timer = setTimeout(() => {
			this.#timer = null
			void this.#step(generation)
		}, delayMs)
	}

	/** Polls again right away, or right after the request in flight. */
	#refreshSoon(): void {
		if (!this.#connected) return
		if (this.#busy) this.#refreshRequested = true
		else this.#schedule(0)
	}

	async #step(generation: number): Promise<void> {
		if (generation !== this.#generation || this.#busy) return
		this.#busy = true
		try {
			if (!this.#connected) await this.#probe(generation)
			if (this.#connected && generation === this.#generation) await this.#poll(generation)
		} catch (err) {
			// Defensive: a bug in a definition builder must not stop the loop.
			this.log('error', `poll step failed: ${err instanceof Error ? err.message : String(err)}`)
		} finally {
			this.#busy = false
		}
		if (generation !== this.#generation) return

		const refresh = this.#refreshRequested
		this.#refreshRequested = false
		this.#schedule(!this.#connected ? RECONNECT_INTERVAL_MS : refresh ? 0 : this.config.pollInterval)
	}

	// ── connection check and polling ──────────────────────────────────────────────────────────────────────────────

	/** `GET /api/v2`: sets the status from the answer. */
	async #probe(generation: number): Promise<void> {
		const client = this.#client
		if (client === null) return
		const result = await client.info()
		if (generation !== this.#generation) return

		if (result.ok) {
			const principal = result.body.principal
			const who = principal ? `${principal.name} (${principal.access})` : 'connected'
			this.#connected = true
			this.#lastFailure = null
			this.#connection = {
				version: result.body.version,
				principal: principal?.name ?? '',
				access: principal?.access ?? '',
			}
			this.#okText = principal?.access === 'read' ? `${who}: read only` : who
			this.updateStatus(InstanceStatus.Ok, this.#okText)
			this.log('info', `Connected to ${client.baseUrl} as ${who}, Core ${result.body.version}`)
			// The Core ignores the token from the Core machine itself, and lets an unknown token fall through to LAN
			// access: say so, or a wrong token goes unnoticed until the module runs elsewhere.
			if (this.#token !== undefined && principal !== null && principal.kind !== 'device') {
				this.log(
					'warn',
					`The device token was not used: the Core let Companion in as ${principal.kind} (${principal.name}). ` +
						(principal.kind === 'loopback'
							? 'Calls from the Core machine itself need no token.'
							: 'Check the token: an unknown token falls back to LAN access.'),
				)
			}
			return
		}

		this.#reportFailure(result)
	}

	/** `GET /api/v2/state`: applies a changed snapshot. */
	async #poll(generation: number): Promise<void> {
		const client = this.#client
		if (client === null) return
		const result = await client.state()
		if (generation !== this.#generation) return

		if (!result.ok) {
			this.#reportFailure(result)
			return
		}

		if (this.#lastFailure !== null) {
			this.#lastFailure = null
			this.updateStatus(InstanceStatus.Ok, this.#okText)
		}

		const snapshot = result.body
		const detailsDue = Date.now() - this.#detailsAt > DETAILS_REFRESH_MS
		if (snapshot.rev === this.model.rev && !detailsDue) return

		const model = modelFromSnapshot(snapshot, this.model)
		if (!isPlayoutV2(model.outputs)) {
			// Only the Output Player v2 payload is supported; an older player's outputs are left out.
			if (!this.#warnedPlayout)
				this.log('warn', 'An output runs an Output Player before v2: its outputs are not supported and left out')
			this.#warnedPlayout = true
			model.outputs = model.outputs.filter((o) => isPlayoutV2([o]))
		}
		const structure = structureKey(model)
		if (structure !== this.#structure || detailsDue) {
			const before = detailsKey(model)
			await this.#loadDetails(client, model)
			if (generation !== this.#generation) return
			this.model = model
			if (structure !== this.#structure || detailsKey(model) !== before) {
				// Only marked as built once the definitions are in: a builder that throws is retried on the next poll.
				this.#defineAll()
				this.#structure = structure
			}
		} else {
			this.model = model
		}
		this.#publishState()
	}

	/**
	 * Reads what the snapshot leaves out but the definitions need: camera angles (angle dropdown) and variable types
	 * (BOOLEAN presets). A failure keeps the previous details; the definitions then fall back to what the snapshot has.
	 */
	async #loadDetails(client: CoreApiClient, model: CoreModel): Promise<void> {
		this.#detailsAt = Date.now()
		if (model.available.cameras) {
			const cameras = await client.cameras()
			if (cameras.ok) {
				model.angles = new Map(listOf(cameras.body.items).map((c) => [c.id, listOf(c.angles)]))
			} else {
				this.log('debug', `camera angles not read: ${describeFailure(cameras)}`)
			}
		}
		if (model.available.variables) {
			const variables = await client.variables()
			if (variables.ok) {
				model.variableDetails = new Map(listOf(variables.body.items).map((v) => [v.id, v]))
			} else {
				this.log('debug', `variable details not read: ${describeFailure(variables)}`)
			}
		}
	}

	/**
	 * Sets the status for a failed probe or poll and logs it once per distinct failure. Refusals that need the user
	 * (401, 403) and an unreachable Core send the loop back to probing; other errors (a 503 while the Core starts)
	 * keep polling.
	 */
	#reportFailure(result: Extract<ApiResult<unknown>, { ok: false }>): void {
		const text = describeFailure(result)
		const first = text !== this.#lastFailure
		this.#lastFailure = text

		let status: InstanceStatus
		if (result.status === 0) status = InstanceStatus.ConnectionFailure
		else if (result.status === 401) status = InstanceStatus.AuthenticationFailure
		else if (result.status === 403) status = InstanceStatus.InsufficientPermissions
		else status = InstanceStatus.UnknownWarning

		const lost = status !== InstanceStatus.UnknownWarning
		if (lost) {
			this.#connected = false
			this.#connection = null
			// Do not keep showing tally or on-air state the module can no longer see.
			if (this.model.rev !== null) {
				this.#clearModel()
				this.#publishState()
			}
		}

		if (first) {
			this.updateStatus(status, statusMessage(result))
			this.log(lost ? 'warn' : 'info', `${this.#client?.baseUrl ?? 'Core'}: ${text}`)
		}
	}

	// ── definitions and values ────────────────────────────────────────────────────────────────────────────────────

	/** Rebuilds every definition from the current model. */
	#defineAll(): void {
		const m = this.model
		this.log(
			'info',
			`Definitions rebuilt: ${m.signals.length} signals, ${m.macros.length} macros, ${m.cameras.length} cameras, ` +
				`${m.outputs.length} outputs, ${m.variables.length} variables`,
		)
		UpdateActions(this)
		UpdateFeedbacks(this)
		this.#layout = buildVariableLayout(this.model, () => this.#connection)
		this.setVariableDefinitions(this.#layout.definitions)
		UpdatePresets(this, this.#layout)
		this.setVariableValues(variableValues(this.model, this.#layout))
	}

	/** Pushes the model's values to the variables and re-checks every feedback. */
	#publishState(): void {
		this.setVariableValues(variableValues(this.model, this.#layout))
		this.checkAllFeedbacks()
	}

	/**
	 * Forgets the state but keeps the definitions and the detail maps: dropdowns and presets stay as they were while
	 * the Core is away, and the first snapshot after a reconnect only rebuilds them when the studio really changed.
	 */
	#clearModel(): void {
		this.model = { ...emptyModel(), angles: this.model.angles, variableDetails: this.model.variableDetails }
	}
}

/** What the definitions take from the detail reads: angle names, variable types and display names. */
function detailsKey(model: CoreModel): string {
	return JSON.stringify([
		[...model.angles].map(([camera, angles]) => [camera, angles.map((a) => [a.id, a.name])]),
		[...model.variableDetails].map(([id, d]) => [id, d.data_type, d.display_name]),
	])
}

/** A list the Core should always send; anything else reads as empty. */
function listOf<T>(value: T[] | null | undefined): T[] {
	return Array.isArray(value) ? value : []
}

/** The status text for a failed probe or poll: what the user should check. */
function statusMessage(result: Extract<ApiResult<unknown>, { ok: false }>): string {
	if (result.status === 403 && result.error === 'feature_disabled')
		return `${result.message} (Studio settings → Core API: switch on the API and the System feature)`
	if (result.status === 403 && result.error === 'forbidden')
		return `${result.message} (the device needs the System feature: Studio settings → Core API → Devices)`
	return result.message
}

function describeFailure(result: Extract<ApiResult<unknown>, { ok: false }>): string {
	return result.status === 0
		? `${result.error}: ${result.message}`
		: `${result.status} ${result.error}: ${result.message}`
}

/** A refused output or camera command carries the player's or Camera Assist's own answer in `ack`. */
function ackDetail(body: Record<string, unknown> | undefined): string {
	const ack = body?.['ack']
	if (typeof ack !== 'object' || ack === null) return ''
	const { error, reason } = ack as { error?: unknown; reason?: unknown }
	if (typeof error === 'string') return ` (player: ${error})`
	if (typeof reason === 'string') return ` (Camera Assist: ${reason})`
	return ''
}

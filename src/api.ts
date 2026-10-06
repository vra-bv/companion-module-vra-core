/**
 * A small typed client for the VRA Core API v2 (`http://{core}:{port}/api/v2`).
 *
 * - `fetch` with a hard 3 s bound per request; no other dependencies.
 * - The device token goes out as `Authorization: Bearer <token>`, and only when one is configured: without it the
 *   Core lets the caller in by address (loopback, or LAN access when the studio switched it on).
 * - Calls never throw. They answer an {@link ApiResult}, so the poll loop and the actions can tell a refusal
 *   (`401`, `409 station_mismatch`, …) from a Core that cannot be reached.
 */

import type { ApiInfo, CameraDetail, StateSnapshot, VariableDetail } from './state.js'

/** Bound of every request. Companion buttons should feel instant; a Core that needs longer is reported as down. */
export const REQUEST_TIMEOUT_MS = 3000

/**
 * The acknowledgement wait the Core may use on a control route (`?timeout=`). It stays below
 * {@link REQUEST_TIMEOUT_MS} so the Core answers `504 timeout` itself instead of the request being cut off without an
 * answer. Signal, studio and output commands carry their own 2 s bounds; camera commands would otherwise wait 5 s.
 */
export const CONTROL_ACK_TIMEOUT_MS = 2500

export interface ApiClientOptions {
	host: string
	port: number
	token: string | undefined
}

/** How a call ended. */
export type ApiResult<T> =
	| { ok: true; status: number; body: T }
	| {
			ok: false
			/** HTTP status, or 0 when no answer came (network error, timeout). */
			status: number
			/** The API's error code (`unauthorized`, `not_found`, …), or `network` / `timeout` / `bad_response`. */
			error: string
			/** Human text: the API's `message`, or the network error. */
			message: string
			/** The JSON body of a refusal, when there was one (e.g. a refused output command carries `ack`). */
			body?: Record<string, unknown>
	  }

/** Query values; undefined values are left out, an empty string is sent as `key=`. */
export type Query = Record<string, string | number | boolean | undefined>

/** Encodes one path segment (macro names with spaces, angle names, …). */
export const seg = (value: string | number): string => encodeURIComponent(String(value))

export class CoreApiClient {
	readonly #base: string
	readonly #token: string | undefined

	constructor(options: ApiClientOptions) {
		// IPv6 literals need brackets in a URL.
		const host = options.host.includes(':') && !options.host.startsWith('[') ? `[${options.host}]` : options.host
		this.#base = `http://${host}:${options.port}/api/v2`
		this.#token = options.token?.trim() || undefined
	}

	/** The base URL, for log lines. Never contains the token. */
	get baseUrl(): string {
		return this.#base
	}

	/** `GET /api/v2`: features and principal; also the connection check. */
	info(): Promise<ApiResult<ApiInfo>> {
		return this.request<ApiInfo>('GET', '')
	}

	/** `GET /api/v2/state`: the poller snapshot. */
	state(): Promise<ApiResult<StateSnapshot>> {
		return this.request<StateSnapshot>('GET', '/state')
	}

	/** `GET /api/v2/cameras`: the cameras with their angles. */
	cameras(): Promise<ApiResult<{ items: CameraDetail[] | null }>> {
		return this.request<{ items: CameraDetail[] | null }>('GET', '/cameras')
	}

	/** `GET /api/v2/variables`: the station's variables with their types. */
	variables(): Promise<ApiResult<{ items: VariableDetail[] | null }>> {
		return this.request<{ items: VariableDetail[] | null }>('GET', '/variables')
	}

	/**
	 * Calls a control route with POST (the Core accepts GET and POST on every control path; arguments stay in the
	 * path and query, never in a body). `path` is relative to `/api/v2` and starts with `/`.
	 */
	control(path: string, query: Query = {}): Promise<ApiResult<Record<string, unknown>>> {
		return this.request<Record<string, unknown>>('POST', path, { timeout: CONTROL_ACK_TIMEOUT_MS, ...query })
	}

	async request<T>(method: 'GET' | 'POST', path: string, query: Query = {}): Promise<ApiResult<T>> {
		const url = new URL(this.#base + path)
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined) continue
			url.searchParams.set(key, String(value))
		}

		const headers: Record<string, string> = { Accept: 'application/json' }
		if (this.#token) headers['Authorization'] = `Bearer ${this.#token}`

		let response: Response
		try {
			response = await fetch(url, { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
		} catch (err) {
			const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
			return {
				ok: false,
				status: 0,
				error: timedOut ? 'timeout' : 'network',
				message: timedOut ? `no answer within ${REQUEST_TIMEOUT_MS} ms` : describeNetworkError(err),
			}
		}

		// Every /api/v2 answer is JSON, refusals included. An unknown path answers 404 with an empty body.
		const text = await response.text().catch(() => '')
		let body: unknown = undefined
		if (text.length > 0) {
			try {
				body = JSON.parse(text)
			} catch {
				body = undefined
			}
		}
		const json = isRecord(body) ? body : undefined

		if (response.ok) {
			if (json === undefined) {
				return { ok: false, status: response.status, error: 'bad_response', message: 'the Core answered no JSON' }
			}
			return { ok: true, status: response.status, body: json as T }
		}

		return {
			ok: false,
			status: response.status,
			error: typeof json?.['error'] === 'string' ? json['error'] : `http_${response.status}`,
			message:
				typeof json?.['message'] === 'string'
					? json['message']
					: `${response.status} ${response.statusText || 'error'}`.trim(),
			body: json,
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `fetch failed` hides the reason in `cause` (ECONNREFUSED, ENOTFOUND, …); surface it. */
function describeNetworkError(err: unknown): string {
	if (!(err instanceof Error)) return String(err)
	const cause = (err as Error & { cause?: unknown }).cause
	if (cause instanceof Error) {
		const code = (cause as Error & { code?: unknown }).code
		return typeof code === 'string' ? `${code}: ${cause.message}` : cause.message
	}
	return err.message
}

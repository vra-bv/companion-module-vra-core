import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

/** The connection settings. The device token is kept apart in {@link ModuleSecrets}. */
export type ModuleConfig = {
	/** Address of the machine that runs the VRA Core. */
	host: string
	/** Core API port, `api_port` in the studio's Core settings (3002 by default). */
	port: number
	/** How often `GET /api/v2/state` is polled, in milliseconds. */
	pollInterval: number
	/**
	 * Optional station id or name. Sent as `?station=` on every action, so a button set up for one station does
	 * nothing (`409 station_mismatch`) while another station holds the studio.
	 */
	station: string
}

/**
 * Kept in Companion's secrets store, not in the config: the config is shown in the web UI and exported with
 * the page, the secrets are not.
 */
export type ModuleSecrets = {
	/** Device token `vra_…` from Studio settings → Core API → Devices. Empty when LAN access lets Companion in. */
	token?: string
}

/** Companion usually runs on the Core machine itself: then the default address works without a token. */
export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 3002
export const DOCS_URL = 'https://docs.visualradioassist.live/develop-with-vra/core-control-api'
/** Lowercase base32 without 0 1 l o, as the Core issues them. */
export const TOKEN_PATTERN = /^vra_[a-km-np-z2-9]{32}$/
export const DEFAULT_POLL_INTERVAL = 1000
export const MIN_POLL_INTERVAL = 250

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'VRA Core API v2',
			value:
				'Companion on the Core machine itself: keep 127.0.0.1 and leave the token empty. ' +
				'Companion on another machine: enter the Core’s address, and create a device in VRA Cloud under ' +
				'Studio settings → Core API → Devices for its token (not needed when LAN access lets this machine in).',
			width: 12,
		},
		{
			type: 'static-text',
			id: 'docs',
			label: 'Documentation',
			value: DOCS_URL,
			width: 12,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Core address',
			tooltip: 'IP address or host name of the machine that runs the VRA Core. A pasted URL works too.',
			width: 8,
			default: DEFAULT_HOST,
			regex: Regex.SOMETHING,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
			asInteger: true,
		},
		{
			type: 'secret-text',
			id: 'token',
			label: 'Device token',
			tooltip: 'vra_ followed by 32 letters and digits. Optional when LAN access is on.',
			width: 8,
			// Lowercase base32 without 0 1 l o, as the Core issues them.
			regex: '/^(vra_[a-km-np-z2-9]{32})?$/',
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (ms)',
			tooltip: `How often the Core state is read. At least ${MIN_POLL_INTERVAL} ms.`,
			width: 4,
			min: MIN_POLL_INTERVAL,
			max: 60000,
			default: DEFAULT_POLL_INTERVAL,
			asInteger: true,
		},
		{
			type: 'textinput',
			id: 'station',
			label: 'Station (optional)',
			tooltip:
				'Station id or name. When set, every action carries ?station= and is refused while another station holds the studio.',
			width: 8,
		},
	]
}

/**
 * The config with defaults filled in and the poll interval clamped, so the rest of the module can trust it. A pasted
 * URL (`http://192.168.1.50:3002/api/v2`) is reduced to its host, and its port wins over the port field.
 */
export function normaliseConfig(config: Partial<ModuleConfig> | undefined): ModuleConfig {
	let host = (config?.host ?? '').trim()
	let port = Number(config?.port)
	const poll = Number(config?.pollInterval)
	if (/^[a-z]+:\/\//i.test(host)) {
		try {
			const url = new URL(host)
			host = url.hostname.replace(/^\[|\]$/g, '')
			if (url.port) port = Number(url.port)
		} catch {
			// Not a URL after all: leave it for the Core address check.
		}
	} else if (/^[^:]+:\d+$/.test(host)) {
		// `host:port` (not an IPv6 address, which has more than one colon)
		const at = host.lastIndexOf(':')
		port = Number(host.slice(at + 1))
		host = host.slice(0, at)
	}
	return {
		host,
		port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT,
		pollInterval: Number.isFinite(poll) ? Math.max(MIN_POLL_INTERVAL, Math.round(poll)) : DEFAULT_POLL_INTERVAL,
		station: (config?.station ?? '').trim(),
	}
}

/** What is wrong with the settings, or null. Shown as the connection status. */
export function configProblem(config: ModuleConfig, token: string | undefined): string | null {
	if (config.host === '') return 'Set the Core address (127.0.0.1 when Companion runs on the Core machine)'
	if (/\s/.test(config.host)) return `Core address "${config.host}" contains a space`
	if (token !== undefined && !TOKEN_PATTERN.test(token))
		return 'The device token is vra_ followed by 32 letters and digits: copy it again from Studio settings → Core API → Devices'
	return null
}

import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig, ModuleSecrets } from './config.js'

/**
 * Upgrade scripts for saved configs, actions and feedbacks. Once released, a script can never be removed or
 * reordered: Companion runs the ones a saved connection has not seen yet, in order.
 */
export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, ModuleSecrets>[] = []

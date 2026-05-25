import type { Project } from './types'
import { migrate, CURRENT_VERSION } from './migrations'

export { CURRENT_VERSION }

export function validateProject(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid project file: expected a JSON object')
  }
  const version = (raw as Record<string, unknown>).version
  const fromVersion = typeof version === 'number' ? version : 0
  if (fromVersion > CURRENT_VERSION) {
    throw new Error(
      `Project file was created with a newer version of Lights (v${fromVersion}). ` +
      `This build supports up to v${CURRENT_VERSION}. Please update the app.`
    )
  }
  return migrate(raw, fromVersion)
}

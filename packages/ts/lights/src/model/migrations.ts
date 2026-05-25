import type { Project } from './types'

type Migration = (prev: unknown) => unknown

const migrations: Migration[] = [
  // v0 → v1: add version field, ensure graphConfig.modules defaults to {}
  (raw) => {
    const obj = raw as Record<string, unknown>
    return {
      ...obj,
      version: 1,
      slides: Array.isArray(obj.slides)
        ? (obj.slides as Record<string, unknown>[]).map(slide => ({
            ...slide,
            graphConfig: slide.graphConfig ?? { modules: {} },
          }))
        : [],
    }
  },
]

export const CURRENT_VERSION = migrations.length

export function migrate(raw: unknown, fromVersion: number): Project {
  let current = raw
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    current = migrations[v](current)
  }
  return current as Project
}

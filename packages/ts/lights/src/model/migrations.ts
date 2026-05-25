/**
 * # Project file migration system
 *
 * ## How versioning works
 *
 * Every saved `.lights.json` file carries a top-level `version` integer.
 * Files written before versioning was introduced have no `version` field
 * and are treated as v0.
 *
 * `CURRENT_VERSION` equals `migrations.length`. It increments automatically
 * each time a migration is appended — no manual bookkeeping needed.
 *
 * On `project:open`, `validateProject()` (schema.ts) runs the migration chain
 * to bring the file up to `CURRENT_VERSION` before it reaches the renderer.
 * Files from a newer app version are rejected with a user-facing error.
 *
 * ## Adding a migration
 *
 * 1. Append a function to the `migrations` array below.
 *    - Index N is the migration from vN → v(N+1).
 *    - Input is `unknown` — the previous (potentially ancient) shape.
 *    - Output should match the shape expected by the *next* migration
 *      (or `Project` if it is the last one).
 *    - Treat input defensively: use `?? fallback` for any new required field.
 *    - Keep transformations non-destructive: spread first, then override.
 * 2. Update `Project` in `types.ts` if the shape changed.
 * 3. Add a comment explaining what changed and why.
 *
 * ## Migration history
 *
 * | From → To | Change                                                    |
 * |-----------|-----------------------------------------------------------|
 * | v0 → v1   | Added `version` field; defaulted `graphConfig.modules` to `{}` on each slide |
 */

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

import type { DetectionCanvasRenderer } from './renderer'

type RendererFactory = (params: Record<string, unknown>) => DetectionCanvasRenderer

const registry = new Map<string, RendererFactory>()

export function registerRenderer(id: string, factory: RendererFactory): void {
  registry.set(id, factory)
}

export function createRenderer(
  id: string,
  params?: Record<string, unknown>,
): DetectionCanvasRenderer | null {
  const factory = registry.get(id)
  return factory ? factory(params ?? {}) : null
}

export function getRendererIds(): string[] {
  return [...registry.keys()]
}

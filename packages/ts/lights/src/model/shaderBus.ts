// Module-level bus that Canvas registers its uniform setter into.
// Keeps the reaction engine decoupled from the Three.js component tree.

type SetUniformFn = (layerId: string, name: string, value: number) => void

export const shaderBus: { setUniform: SetUniformFn } = {
  setUniform: () => {},
}

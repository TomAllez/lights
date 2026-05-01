import { contextBridge, ipcRenderer } from 'electron'
import type { GraphCommand, GraphEvent, LightsBridge } from '../src/ipc/types'

const bridge: LightsBridge = {
  sendCommand: (cmd: GraphCommand) => ipcRenderer.send('graph:command', cmd),
  onEvent: (handler: (event: GraphEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: GraphEvent) => handler(event)
    ipcRenderer.on('graph:event', listener)
    return () => ipcRenderer.off('graph:event', listener)
  },
  sendSlide: (slide: unknown) => ipcRenderer.send('output:slide', slide),
  onOutputRender: (handler: (slide: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, slide: unknown) => handler(slide)
    ipcRenderer.on('output:render', listener)
    return () => ipcRenderer.off('output:render', listener)
  },
  pickImageFile: () => ipcRenderer.invoke('dialog:pick-image') as Promise<{ name: string; src: string } | null>,
}

contextBridge.exposeInMainWorld('lights', bridge)

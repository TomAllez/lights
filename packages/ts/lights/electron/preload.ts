import { contextBridge, ipcRenderer } from 'electron'
import type { GraphCommand, GraphEvent, LightsBridge } from '../src/ipc/types'

const bridge: LightsBridge = {
  sendCommand: (cmd: GraphCommand) => ipcRenderer.send('graph:command', cmd),
  onEvent: (handler: (event: GraphEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: GraphEvent) => handler(event)
    ipcRenderer.on('graph:event', listener)
    return () => ipcRenderer.off('graph:event', listener)
  },
}

contextBridge.exposeInMainWorld('lights', bridge)

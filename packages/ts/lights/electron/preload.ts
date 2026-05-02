import { contextBridge, ipcRenderer } from 'electron'
import type { GraphCommand, GraphEvent, LightsBridge } from '../src/ipc/types'

function onChannel(channel: string, handler: (...args: unknown[]) => void): () => void {
  const listener = (_: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

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

  saveProject: (project: unknown) =>
    ipcRenderer.invoke('project:save', { project }) as Promise<{ filePath: string } | null>,
  saveProjectAs: (project: unknown) =>
    ipcRenderer.invoke('project:save-as', { project }) as Promise<{ filePath: string } | null>,
  notifyDirty: (isDirty: boolean) => ipcRenderer.send('project:set-dirty', isDirty),
  confirmQuit: () => ipcRenderer.send('project:quit-confirmed'),

  onMenuSave: (handler) => onChannel('menu:save', handler),
  onMenuSaveAs: (handler) => onChannel('menu:save-as', handler),
  onMenuSaveAndQuit: (handler) => onChannel('menu:save-and-quit', handler),
  onMenuNew: (handler) => onChannel('menu:new', handler),
  onProjectOpened: (handler) =>
    onChannel('project:opened', (data) => handler(data as { project: unknown; filePath: string })),
}

contextBridge.exposeInMainWorld('lights', bridge)

import { contextBridge } from 'electron'

// IPC bridge will be wired in issue #7
contextBridge.exposeInMainWorld('lights', {})

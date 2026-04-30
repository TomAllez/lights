import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { GraphCommand, GraphEvent } from '../src/ipc/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null
let stubInterval: ReturnType<typeof setInterval> | null = null

function emit(event: GraphEvent) {
  win?.webContents.send('graph:event', event)
}

function startStubGraph() {
  if (stubInterval !== null) {
    clearInterval(stubInterval)
    stubInterval = null
  }
  emit({ type: 'graph:status', status: 'running' })
  stubInterval = setInterval(() => {
    emit({ type: 'frame', data: new ArrayBuffer(0) })
  }, 33)
}

function stopStubGraph() {
  if (stubInterval !== null) {
    clearInterval(stubInterval)
    stubInterval = null
  }
  emit({ type: 'graph:status', status: 'stopped' })
}

ipcMain.on('graph:command', (_event, cmd: GraphCommand) => {
  switch (cmd.type) {
    case 'slide:activate':
      startStubGraph()
      break
    case 'graph:stop':
      stopStubGraph()
      break
  }
})

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
    },
  })

  win.on('closed', () => {
    stopStubGraph()
    win = null
  })

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.APP_ROOT!, 'dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

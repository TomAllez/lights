import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { GraphCommand, GraphEvent } from '../src/ipc/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null
let outputWin: BrowserWindow | null = null
let lastSlide: unknown = null
let stubInterval: ReturnType<typeof setInterval> | null = null

function emit(event: GraphEvent) {
  win?.webContents.send('graph:event', event)
}

// Encodes a static right-hand pose for overlay testing (1 byte handedness + 21×12 bytes)
function mockHandpose(): ArrayBuffer {
  const buf = new ArrayBuffer(1 + 21 * 12)
  const view = new DataView(buf)
  new Uint8Array(buf)[0] = 1 // Right
  const lm = [
    [0.50, 0.70], [0.45, 0.62], [0.40, 0.55], [0.35, 0.50], [0.30, 0.45],
    [0.47, 0.55], [0.45, 0.45], [0.44, 0.37], [0.43, 0.30],
    [0.50, 0.54], [0.50, 0.44], [0.50, 0.36], [0.50, 0.28],
    [0.53, 0.55], [0.54, 0.45], [0.54, 0.37], [0.55, 0.30],
    [0.57, 0.57], [0.59, 0.49], [0.60, 0.43], [0.61, 0.38],
  ]
  for (let i = 0; i < 21; i++) {
    const off = 1 + i * 12
    view.setFloat32(off,     lm[i][0], true)
    view.setFloat32(off + 4, lm[i][1], true)
    view.setFloat32(off + 8, 0,        true)
  }
  return buf
}

function startStubGraph() {
  if (stubInterval !== null) {
    clearInterval(stubInterval)
    stubInterval = null
  }
  emit({ type: 'graph:status', status: 'running' })
  let tick = 0
  stubInterval = setInterval(() => {
    emit({ type: 'frame', width: 320, height: 240, data: new ArrayBuffer(0) })
    // Emit a mock hand every 10 frames so the overlay can be tested visually
    if (tick % 10 === 0) {
      emit({ type: 'detection', moduleId: 'HandPoseEstimation', position: { x: 0.5, y: 0.5 }, data: mockHandpose() })
    }
    tick++
  }, 33)
}

function stopStubGraph() {
  if (stubInterval !== null) {
    clearInterval(stubInterval)
    stubInterval = null
  }
  emit({ type: 'graph:status', status: 'stopped' })
}

ipcMain.handle('dialog:pick-image', async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.on('output:slide', (_event, slide: unknown) => {
  lastSlide = slide
  outputWin?.webContents.send('output:render', slide)
})

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

function createOutputWindow() {
  outputWin = new BrowserWindow({
    width: 800,
    height: 450,
    backgroundColor: '#000000',
    title: 'Lights — Output',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
    },
  })

  outputWin.on('closed', () => { outputWin = null })

  outputWin.webContents.on('did-finish-load', () => {
    if (lastSlide !== null) outputWin?.webContents.send('output:render', lastSlide)
  })

  if (DEV_SERVER_URL) {
    outputWin.loadURL(`${DEV_SERVER_URL}?output=1`)
  } else {
    outputWin.loadFile(path.join(process.env.APP_ROOT!, 'dist/index.html'), { query: { output: '1' } })
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
    },
  })

  win.on('closed', () => {
    win = null
    stopStubGraph()
  })

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(process.env.APP_ROOT!, 'dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  createOutputWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

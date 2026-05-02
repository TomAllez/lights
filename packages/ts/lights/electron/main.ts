import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { GraphCommand, GraphEvent } from '../src/ipc/types'
import { GraphStatus } from '../src/ipc/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null
let outputWin: BrowserWindow | null = null
let lastSlide: unknown = null
let stubInterval: ReturnType<typeof setInterval> | null = null
let currentFilePath: string | null = null
let isDirty = false

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
  emit({ type: 'graph:status', status: GraphStatus.Running })
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
  emit({ type: 'graph:status', status: GraphStatus.Stopped })
}

ipcMain.handle('dialog:pick-image', async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime =
    ext === 'png'  ? 'image/png'      :
    ext === 'gif'  ? 'image/gif'      :
    ext === 'webp' ? 'image/webp'     :
    ext === 'svg'  ? 'image/svg+xml'  :
                     'image/jpeg'
  const data = await fs.readFile(filePath)
  return { name: path.basename(filePath), src: `data:${mime};base64,${data.toString('base64')}` }
})

function winTitle() {
  const base = currentFilePath ? path.basename(currentFilePath) : 'Untitled'
  return isDirty ? `Lights — ${base} •` : `Lights — ${base}`
}

ipcMain.handle('project:save', async (_event, { project }: { project: unknown }) => {
  let filePath = currentFilePath
  if (!filePath) {
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: 'project.lights.json',
      filters: [{ name: 'Lights Project', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null
    filePath = result.filePath
  }
  await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8')
  currentFilePath = filePath
  isDirty = false
  win?.setTitle(winTitle())
  return { filePath }
})

ipcMain.handle('project:save-as', async (_event, { project }: { project: unknown }) => {
  const result = await dialog.showSaveDialog(win!, {
    defaultPath: currentFilePath ? path.basename(currentFilePath) : 'project.lights.json',
    filters: [{ name: 'Lights Project', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null
  const filePath = result.filePath
  await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8')
  currentFilePath = filePath
  isDirty = false
  win?.setTitle(winTitle())
  return { filePath }
})

ipcMain.on('project:set-dirty', (_event, dirty: boolean) => {
  isDirty = dirty
  win?.setTitle(winTitle())
})

ipcMain.on('project:quit-confirmed', () => {
  isDirty = false
  win?.destroy()
})

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            currentFilePath = null
            isDirty = false
            win?.setTitle('Lights')
            win?.webContents.send('menu:new')
          },
        },
        { type: 'separator' },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(win!, {
              filters: [{ name: 'Lights Project', extensions: ['json'] }],
              properties: ['openFile'],
            })
            if (result.canceled || result.filePaths.length === 0) return
            const filePath = result.filePaths[0]
            try {
              const data = await fs.readFile(filePath, 'utf-8')
              const project = JSON.parse(data)
              currentFilePath = filePath
              isDirty = false
              win?.setTitle(winTitle())
              win?.webContents.send('project:opened', { project, filePath })
            } catch {
              await dialog.showMessageBox(win!, {
                type: 'error',
                message: 'Could not open project',
                detail: `Failed to read ${path.basename(filePath)}.`,
              })
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => win?.webContents.send('menu:save'),
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => win?.webContents.send('menu:save-as'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

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

  win.on('close', (e) => {
    if (!isDirty) return
    e.preventDefault()
    dialog.showMessageBox(win!, {
      type: 'question',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: 'Save changes to your project?',
      detail: 'Your changes will be lost if you don\'t save them.',
    }).then(({ response }) => {
      if (response === 0) {
        win?.webContents.send('menu:save-and-quit')
      } else if (response === 1) {
        isDirty = false
        win?.destroy()
      }
    })
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
  buildMenu()
  createWindow()
  createOutputWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

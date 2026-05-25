import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerGraphHandlers } from './graph'
import { validateProject } from '../src/model/schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null
let outputWin: BrowserWindow | null = null
let graphHandlers: { stop: () => void } | null = null
let lastSlide: unknown = null
let currentFilePath: string | null = null
let isDirty = false

ipcMain.handle('dialog:pick-image', async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime =
    ext === 'png' ? 'image/png' :
      ext === 'gif' ? 'image/gif' :
        ext === 'webp' ? 'image/webp' :
          ext === 'svg' ? 'image/svg+xml' :
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
              const project = validateProject(JSON.parse(data))
              currentFilePath = filePath
              isDirty = false
              win?.setTitle(winTitle())
              win?.webContents.send('project:opened', { project, filePath })
            } catch (err) {
              await dialog.showMessageBox(win!, {
                type: 'error',
                message: 'Could not open project',
                detail: err instanceof Error ? err.message : `Failed to read ${path.basename(filePath)}.`,
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

  outputWin.on('closed', () => {
    outputWin = null
    if (win && !win.isDestroyed()) {
      win.webContents.send('output:closed')
    }
  })

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
    graphHandlers?.stop()
    graphHandlers = null
    outputWin?.close()
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
  graphHandlers = registerGraphHandlers(win!, () => outputWin)
})

app.on('before-quit', () => {
  graphHandlers?.stop()
  outputWin?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MenuAction, PendingSave } from '../shared/types'
import { Vault } from './vault'

const DEFAULT_ROOT = process.platform === 'win32' ? 'G:\\My Drive\\BT Notes' : null
const settingsFile = () => join(app.getPath('userData'), 'settings.json')

let win: BrowserWindow | null = null
let vault: Vault | null = null

/** The notes folder: BT_NOTES_ROOT if set, then the saved choice, then the default Google Drive folder. */
async function savedRoot(): Promise<string | null> {
  if (process.env.BT_NOTES_ROOT) return process.env.BT_NOTES_ROOT
  try {
    const { root } = JSON.parse(await readFile(settingsFile(), 'utf8'))
    if (root) return root
  } catch {
    // No settings yet on first run.
  }
  return DEFAULT_ROOT && existsSync(DEFAULT_ROOT) ? DEFAULT_ROOT : null
}

function openVault(root: string): void {
  vault?.close()
  vault = new Vault(root, (event) => win?.webContents.send('vault:event', event))
  vault.watch()
}

function requireVault(): Vault {
  if (!vault) throw new Error('No notes folder is open')
  return vault
}

ipcMain.handle('vault:root', () => vault?.root ?? null)
ipcMain.handle('vault:choose', async () => {
  const result = await dialog.showOpenDialog(win!, {
    title: 'Choose your notes folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const root = result.filePaths[0]
  await writeFile(settingsFile(), JSON.stringify({ root }, null, 2))
  openVault(root)
  return root
})
ipcMain.handle('vault:load', () => requireVault().loadAll())
ipcMain.handle('vault:save', (_e, save: PendingSave) => requireVault().save(save))
ipcMain.handle('vault:trash', (_e, path: string) => requireVault().trash(path))
// Synchronous save used while the window unloads, when async replies can no longer arrive.
// Each note is saved on its own, so one failure doesn't cost the others their edits.
ipcMain.on('vault:save-now', (event, saves: PendingSave[]) => {
  const errors: string[] = []
  for (const save of saves) {
    try {
      requireVault().save(save)
    } catch (err) {
      errors.push(`${save.path}: ${(err as Error).message}`)
      console.error('Save on close failed:', save.path, err)
    }
  }
  event.returnValue = errors.length ? errors.join('\n') : null
})

function sendMenu(action: MenuAction): void {
  win?.webContents.send('menu', action)
}

function buildMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new-note') },
        { label: 'Change Notes Folder…', click: () => sendMenu('choose-folder') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Search Notes', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendMenu('search') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  return Menu.buildFromTemplate(template)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 760,
    minHeight: 480,
    title: 'BT Notes',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#ffffff',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  })

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.on('closed', () => {
    win = null
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildMenu())
  const root = await savedRoot()
  if (root) openVault(root)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  vault?.close()
  if (process.platform !== 'darwin') app.quit()
})

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultRoots } from '../shared/notesRoot'
import type { MenuAction, PendingSave } from '../shared/types'
import { fileVersion, handleScheme, registerScheme, savePdfPreview } from './files'
import { Vault } from './vault'

const settingsFile = () => join(app.getPath('userData'), 'settings.json')

let win: BrowserWindow | null = null
let vault: Vault | null = null

/** The notes folder: BT_NOTES_ROOT if set, then the saved choice, then the first default folder that exists. */
async function savedRoot(): Promise<string | null> {
  if (process.env.BT_NOTES_ROOT) return process.env.BT_NOTES_ROOT
  try {
    const { root } = JSON.parse(await readFile(settingsFile(), 'utf8'))
    if (root) return root
  } catch {
    // No settings yet on first run.
  }
  return defaultRoots().find((root) => existsSync(root)) ?? null
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
ipcMain.handle('vault:attachment', (_e, name: string, data: Uint8Array) => requireVault().addAttachment(name, data))
ipcMain.handle('vault:import', (_e, source: string) => requireVault().importFile(source))
ipcMain.handle('vault:read', async (_e, path: string) => {
  const abs = requireVault().abs(path)
  const version = await fileVersion(abs)
  return { data: await readFile(abs), version }
})
ipcMain.handle('vault:open', (_e, path: string) => openFile(requireVault().abs(path)))
ipcMain.handle('vault:pdf-preview', (_e, path: string, version: string, data: Uint8Array) =>
  savePdfPreview(requireVault().abs(path), version, data),
)

/**
 * Files that open in their own app from a board. Boards and their files can come from other
 * devices and other people, so anything that could run code, such as .exe, .lnk, .bat or
 * macro-enabled Office files, is shown in its folder instead of being opened.
 */
const OPENABLE = /\.(pdf|docx?|rtf|xlsx?|csv|pptx?|txt|md|png|jpe?g|gif|webp|bmp|heic|heif|tiff?|avif|mp4|m4v|mov|webm|mkv|avi|wmv|3gp|mp3|m4a|wav|aac|flac)$/i

async function openFile(abs: string): Promise<string> {
  if (!OPENABLE.test(abs)) {
    shell.showItemInFolder(abs)
    return `Files of this type aren't opened from boards, so its folder was opened instead.`
  }
  const error = await shell.openPath(abs)
  return error && `Couldn't open it: ${error}`
}
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

registerScheme()

app.whenReady().then(async () => {
  handleScheme((rel) => vault?.abs(rel) ?? null)
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

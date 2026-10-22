import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchLinkPreview } from '../shared/linkPreview'
import { defaultRoots } from '../shared/notesRoot'
import { defaultWorkspaceName, normalizeSettings, readSettings, settingsOf, type WorkspaceState } from '../shared/workspaces'
import type { MenuAction, PendingSave } from '../shared/types'
import { docInfo } from './docInfo'
import { fileVersion, handleScheme, registerScheme, savePdfPreview } from './files'
import { Vault } from './vault'

// The app was called BT Notes. Its settings folder keeps that name, so the saved notes folder,
// previews and board views carry over, and the MCP server and Apple Notes import still find them.
// BT_NOTES_USER_DATA gives a test copy its own, so it can run beside the installed app.
app.setPath('userData', process.env.BT_NOTES_USER_DATA || join(app.getPath('appData'), 'BT Notes'))

const settingsFile = () => join(app.getPath('userData'), 'settings.json')

let win: BrowserWindow | null = null
let vault: Vault | null = null

// ---- Workspaces: notes folders to switch between, kept in the settings file ----

const sameFolder = (a: string, b: string) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase()

function workspaceState(): WorkspaceState {
  return normalizeSettings(readSettings(settingsFile()))
}

async function saveWorkspaces(state: WorkspaceState): Promise<void> {
  await writeFile(settingsFile(), JSON.stringify(settingsOf(state), null, 2))
}

/** Makes a folder the open workspace, adding it to the list if it's new, and opens it. */
async function openWorkspace(root: string): Promise<string> {
  const state = workspaceState()
  const known = state.workspaces.find((w) => sameFolder(w.path, root))
  if (!known) state.workspaces.push({ name: defaultWorkspaceName(root, state.workspaces), path: root })
  state.active = known?.path ?? root
  state.capture ??= state.active
  await saveWorkspaces(state)
  openVault(state.active)
  return state.active
}

/**
 * The notes folder to open: BT_NOTES_ROOT if set, then the open workspace, or the first one whose
 * folder is on this computer (a Work folder may only be on the work laptop), then the first
 * default folder that exists.
 */
async function savedRoot(): Promise<string | null> {
  if (process.env.BT_NOTES_ROOT) return process.env.BT_NOTES_ROOT
  const { workspaces, active } = workspaceState()
  if (active && existsSync(active)) return active
  return workspaces.find((w) => existsSync(w.path))?.path ?? active ?? defaultRoots().find((root) => existsSync(root)) ?? null
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
/** File → Change Notes Folder: points the open workspace at another folder, keeping its name. */
ipcMain.handle('vault:choose', async () => {
  const result = await dialog.showOpenDialog(win!, {
    title: 'Choose your notes folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const root = result.filePaths[0]
  const state = workspaceState()
  const current = state.workspaces.find((w) => vault && sameFolder(w.path, vault.root))
  if (current && !state.workspaces.some((w) => sameFolder(w.path, root))) {
    if (state.capture && sameFolder(state.capture, current.path)) state.capture = root
    current.path = root
    await saveWorkspaces(state)
  }
  return openWorkspace(root)
})

ipcMain.handle('workspaces:list', () => {
  const state = workspaceState()
  return {
    workspaces: state.workspaces.map((w) => ({ ...w, available: existsSync(w.path) })),
    active: vault?.root ?? state.active,
    capture: state.capture,
  }
})
ipcMain.handle('workspaces:switch', async (_e, path: string) => {
  const workspace = workspaceState().workspaces.find((w) => sameFolder(w.path, path))
  if (!workspace) throw new Error('There’s no such workspace')
  if (!existsSync(workspace.path)) throw new Error(`The ${workspace.name} workspace’s folder isn’t on this computer: ${workspace.path}`)
  return openWorkspace(workspace.path)
})
ipcMain.handle('workspaces:add', async () => {
  const result = await dialog.showOpenDialog(win!, {
    title: 'Choose a notes folder for the new workspace',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return openWorkspace(result.filePaths[0])
})
ipcMain.handle('workspaces:rename', async (_e, path: string, name: string) => {
  const state = workspaceState()
  const workspace = state.workspaces.find((w) => sameFolder(w.path, path))
  if (!workspace || !name.trim()) return
  workspace.name = name.trim()
  await saveWorkspaces(state)
})
/** Takes a workspace off the list; its folder and files stay where they are. */
ipcMain.handle('workspaces:remove', async (_e, path: string) => {
  const state = workspaceState()
  if (vault && sameFolder(vault.root, path)) throw new Error('Switch to another workspace before removing this one')
  state.workspaces = state.workspaces.filter((w) => !sameFolder(w.path, path))
  if (state.capture && sameFolder(state.capture, path)) state.capture = state.workspaces[0]?.path ?? null
  await saveWorkspaces(state)
})
ipcMain.handle('workspaces:capture', async (_e, path: string) => {
  const state = workspaceState()
  const workspace = state.workspaces.find((w) => sameFolder(w.path, path))
  if (!workspace) return
  state.capture = workspace.path
  await saveWorkspaces(state)
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
ipcMain.handle('vault:doc-info', (_e, path: string) => docInfo(requireVault().abs(path)))
ipcMain.handle('links:preview', (_e, url: string) => (typeof url === 'string' ? fetchLinkPreview(url) : null))

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
        { label: 'Find Folder…', accelerator: 'CmdOrCtrl+K', click: () => sendMenu('find-folder') },
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
    title: 'Vizual Notes',
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
  // A built Mac app gets its icon from the app bundle; run from source, the Dock would show
  // Electron's, so show Vizual Notes's instead.
  if (process.platform === 'darwin' && !app.isPackaged) {
    const icon = join(app.getAppPath(), 'build', 'icon-mac.png')
    if (existsSync(icon)) app.dock?.setIcon(icon)
  }
  handleScheme((rel) => vault?.abs(rel) ?? null)
  Menu.setApplicationMenu(buildMenu())
  const root = await savedRoot()
  // A test run's folder (BT_NOTES_ROOT) isn't added to the workspaces.
  if (root && !process.env.BT_NOTES_ROOT) await openWorkspace(root)
  else if (root) openVault(root)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  vault?.close()
  if (process.platform !== 'darwin') app.quit()
})

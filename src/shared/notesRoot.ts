/**
 * The notes folder for tools that run outside the app (the MCP server, the Apple Notes importer):
 * BT_NOTES_ROOT if set, else the folder the app last opened, else Dropbox's BT Notes folder.
 * Node only; the app itself asks Electron for its settings folder.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function notesRoot(): string {
  if (process.env.BT_NOTES_ROOT) return process.env.BT_NOTES_ROOT
  // Where Electron keeps the app's settings on each platform.
  const appData =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : join(homedir(), '.config')
  try {
    const { root } = JSON.parse(readFileSync(join(appData, 'BT Notes', 'settings.json'), 'utf8'))
    if (root && existsSync(root)) return root
  } catch {
    // The app hasn't saved a folder choice.
  }
  // Where Dropbox keeps it; current Mac versions of Dropbox use ~/Library/CloudStorage.
  const dropbox = [join(homedir(), 'Library', 'CloudStorage', 'Dropbox', 'BT Notes'), join(homedir(), 'Dropbox', 'BT Notes')]
  return dropbox.find((root) => existsSync(root)) ?? dropbox[1]
}

/**
 * Where the notes folder is. The app, the MCP server and the Apple Notes importer all use this:
 * BT_NOTES_ROOT if set, else the folder the app last opened, else the first default folder that
 * exists. Node only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where to look for BT Notes when no folder has been chosen: iCloud Drive first, where it lives
 * now, then Dropbox, where it lived before. On a Mac, iCloud Drive is ~/Library/Mobile
 * Documents/com~apple~CloudDocs and current Dropbox versions use ~/Library/CloudStorage; on
 * Windows, iCloud for Windows uses ~/iCloudDrive.
 */
export function defaultRoots(): string[] {
  const home = homedir()
  return process.platform === 'darwin'
    ? [
        join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BT Notes'),
        join(home, 'Library', 'CloudStorage', 'Dropbox', 'BT Notes'),
        join(home, 'Dropbox', 'BT Notes'),
      ]
    : [join(home, 'iCloudDrive', 'BT Notes'), join(home, 'Dropbox', 'BT Notes')]
}

/** The folder the app last opened, from its settings file, if it still exists. */
function savedRoot(settingsFile: string): string | null {
  try {
    const { root } = JSON.parse(readFileSync(settingsFile, 'utf8'))
    if (root && existsSync(root)) return root
  } catch {
    // The app hasn't saved a folder choice.
  }
  return null
}

/** Where Electron keeps the app's settings on each platform. */
function settingsFile(): string {
  const appData =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : join(homedir(), '.config')
  return join(appData, 'BT Notes', 'settings.json')
}

/** The notes folder for tools that run outside the app. */
export function notesRoot(): string {
  if (process.env.BT_NOTES_ROOT) return process.env.BT_NOTES_ROOT
  const defaults = defaultRoots()
  return savedRoot(settingsFile()) ?? defaults.find((root) => existsSync(root)) ?? defaults[0]
}

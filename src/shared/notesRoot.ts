/**
 * Where the notes folder is. The app, the MCP server and the Apple Notes importer all use this:
 * BT_NOTES_ROOT if set, else the workspace open in the app, else the first default folder that
 * exists. Node only.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeSettings, readSettings } from './workspaces.ts'

/**
 * Where to look for the notes folder (still called BT Notes) when none has been chosen: iCloud Drive first, where it lives
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

/** Where Electron keeps the app's settings on each platform. */
function settingsFile(): string {
  const appData =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : join(homedir(), '.config')
  // The app's settings folder kept the app's old name, BT Notes.
  return join(appData, 'BT Notes', 'settings.json')
}

/** The workspaces in the app's settings. */
function workspaceState() {
  return normalizeSettings(readSettings(settingsFile()))
}

/** The notes folder for tools that run outside the app: the workspace open in the app. */
export function notesRoot(): string {
  if (process.env.BT_NOTES_ROOT) return process.env.BT_NOTES_ROOT
  const { active } = workspaceState()
  if (active && existsSync(active)) return active
  const defaults = defaultRoots()
  return defaults.find((root) => existsSync(root)) ?? defaults[0]
}

/**
 * Where Apple Notes captures go: the workspace chosen for them (at first, the first workspace),
 * whichever one is open in the app, so captures from the phone never land in Work by accident.
 */
export function captureRoot(): string {
  if (process.env.BT_NOTES_ROOT) return process.env.BT_NOTES_ROOT
  const { capture } = workspaceState()
  return capture && existsSync(capture) ? capture : notesRoot()
}

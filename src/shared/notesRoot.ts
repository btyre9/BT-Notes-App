/**
 * Where the notes folder is. The app, the MCP server and the Apple Notes importer all use this:
 * BT_NOTES_ROOT if set, else the workspace open in the app, else the first default folder that
 * exists. Node only.
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeSettings, readSettings } from './workspaces.ts'

/**
 * Where to look for the notes folder (still called BT Notes) when none has been chosen: Google
 * Drive first, where it's moving (PLAN.md phase 13), then iCloud Drive, where it lives until the
 * move, then Dropbox, where it lived before.
 * - Google Drive for desktop on a Mac keeps each account in ~/Library/CloudStorage/GoogleDrive-<email>;
 *   on Windows it's the G: drive when streaming, or ~/My Drive when mirroring.
 * - iCloud Drive is ~/Library/Mobile Documents/com~apple~CloudDocs on a Mac and ~/iCloudDrive
 *   with iCloud for Windows. Current Dropbox versions on a Mac use ~/Library/CloudStorage.
 */
export function defaultRoots(platform: NodeJS.Platform = process.platform, home = homedir()): string[] {
  if (platform === 'darwin') {
    const cloudStorage = join(home, 'Library', 'CloudStorage')
    return [
      ...googleDriveAccounts(cloudStorage).map((account) => join(cloudStorage, account, 'My Drive', 'BT Notes')),
      join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BT Notes'),
      join(cloudStorage, 'Dropbox', 'BT Notes'),
      join(home, 'Dropbox', 'BT Notes'),
    ]
  }
  return [
    ...(platform === 'win32' ? ['G:\\My Drive\\BT Notes'] : []),
    join(home, 'My Drive', 'BT Notes'),
    join(home, 'iCloudDrive', 'BT Notes'),
    join(home, 'Dropbox', 'BT Notes'),
  ]
}

/** The Google Drive accounts signed in to Google Drive for desktop on a Mac. */
function googleDriveAccounts(cloudStorage: string): string[] {
  try {
    return readdirSync(cloudStorage)
      .filter((name) => name.startsWith('GoogleDrive-'))
      .sort()
  } catch {
    return []
  }
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

/**
 * Workspaces: notes folders the app switches between, such as Personal and Work, each with its
 * own Home, folders, notes and Inbox. They're kept in the app's settings file with the open one
 * (`root`) and the one Apple Notes captures go to (`captureRoot`). Settings from before
 * workspaces, with only `root`, become a list of one. Node only.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

export interface Workspace {
  name: string
  path: string
}

/** What the settings file holds. */
export interface Settings {
  root?: string
  workspaces?: Workspace[]
  captureRoot?: string
}

export interface WorkspaceState {
  workspaces: Workspace[]
  /** The open workspace's folder. */
  active: string | null
  /** Where Apple Notes captures go. */
  capture: string | null
}

const same = (a: string, b: string) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase()

/** A first name for a workspace: Work for a company OneDrive, else Personal, else the folder's name. */
export function defaultWorkspaceName(path: string, taken: Workspace[]): string {
  const base = /OneDrive - /i.test(path) ? 'Work' : 'Personal'
  const names = new Set(taken.map((w) => w.name.toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  const folder = basename(path.replace(/[\\/]+$/, '')) || base
  if (!names.has(folder.toLowerCase())) return folder
  let i = 2
  while (names.has(`${folder} ${i}`.toLowerCase())) i++
  return `${folder} ${i}`
}

export function normalizeSettings(settings: Settings): WorkspaceState {
  const workspaces: Workspace[] = []
  for (const w of settings.workspaces ?? []) {
    if (!w || typeof w.path !== 'string' || !w.path || workspaces.some((x) => same(x.path, w.path))) continue
    workspaces.push({ name: typeof w.name === 'string' && w.name.trim() ? w.name.trim() : defaultWorkspaceName(w.path, workspaces), path: w.path })
  }
  if (settings.root && !workspaces.some((w) => same(w.path, settings.root!))) {
    workspaces.push({ name: defaultWorkspaceName(settings.root, workspaces), path: settings.root })
  }
  const find = (path: string | undefined) => (path ? (workspaces.find((w) => same(w.path, path))?.path ?? null) : null)
  const active = find(settings.root) ?? workspaces[0]?.path ?? null
  return { workspaces, active, capture: find(settings.captureRoot) ?? workspaces[0]?.path ?? active }
}

/** The settings file written back from a workspace state. */
export function settingsOf(state: WorkspaceState): Settings {
  return {
    ...(state.active ? { root: state.active } : {}),
    workspaces: state.workspaces,
    ...(state.capture ? { captureRoot: state.capture } : {}),
  }
}

export function readSettings(file: string): Settings {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Settings) : {}
  } catch {
    return {}
  }
}

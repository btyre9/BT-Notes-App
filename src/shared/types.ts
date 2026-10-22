/**
 * A note (`.md`) or board (`.canvas`) in the notes folder. `path` is relative to the folder and
 * uses forward slashes.
 */
export interface NoteFile {
  path: string
  content: string
  mtime: number
}

export type VaultEvent =
  | { type: 'changed'; file: NoteFile }
  | { type: 'removed'; path: string }

/**
 * Everything the UI needs from storage. The desktop app implements it with local files;
 * the iPhone app will implement the same interface on top of the Dropbox API.
 */
export interface VaultApi {
  root(): Promise<string | null>
  chooseRoot(): Promise<string | null>
  loadAll(): Promise<NoteFile[]>
  /**
   * Writes a note (renaming it first if `renameFrom` is set) and returns the path used, which
   * differs from `path` if that name was taken by a file the app hadn't loaded yet.
   * Saves reach storage in the order they're called.
   */
  save(save: PendingSave): Promise<string>
  trash(path: string): Promise<void>
  /** Copies a dropped or pasted file into Attachments/ and returns its path there. */
  addAttachment(name: string, data: Uint8Array): Promise<string>
  /** Copies a file from disk into Attachments/ (or uses it where it is, if it's already there). */
  importFile(sourcePath: string): Promise<string>
  /** A file's bytes and an id for this version of it. */
  readFile(path: string): Promise<{ data: Uint8Array; version: string }>
  /** Opens a file in its default app; resolves to a message for the user, or '' on success. */
  openFile(path: string): Promise<string>
  /** Stores the first-page preview of a PDF, which the window draws, for the version it read. */
  savePdfPreview(path: string, version: string, data: Uint8Array): Promise<void>
  /** A Word, PowerPoint, Excel, text or PDF file's title, if it has one, and its first lines. */
  docInfo(path: string): Promise<{ title?: string; lines: string[] }>
  onEvent(callback: (event: VaultEvent) => void): () => void
}

export type MenuAction = 'new-note' | 'choose-folder' | 'search' | 'find-folder'

/** A note save: write `content` to `path`, first moving the file from `renameFrom` if set. */
export interface PendingSave {
  renameFrom?: string
  path: string
  content: string
}

export interface LinksApi {
  /** A web page's title, description, preview image and site name, or null if it can't be read. */
  preview(url: string): Promise<import('./linkPreview').LinkPreview | null>
}

export interface AppApi {
  onMenu(callback: (action: MenuAction) => void): () => void
  /** Saves synchronously; returns an error message or null. Only for use during unload. */
  saveNow(saves: PendingSave[]): string | null
  /** Where a dropped file is on disk, or '' for one that isn't, such as a pasted image. */
  filePath(file: File): string
}

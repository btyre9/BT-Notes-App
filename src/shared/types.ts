/** A Markdown file in the notes folder. `path` is relative to the folder and uses forward slashes. */
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
 * the iPhone app will implement the same interface on top of the Google Drive API.
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
  onEvent(callback: (event: VaultEvent) => void): () => void
}

export type MenuAction = 'new-note' | 'choose-folder' | 'search'

/** A note save: write `content` to `path`, first moving the file from `renameFrom` if set. */
export interface PendingSave {
  renameFrom?: string
  path: string
  content: string
}

export interface AppApi {
  onMenu(callback: (action: MenuAction) => void): () => void
  /** Saves synchronously; returns an error message or null. Only for use during unload. */
  saveNow(saves: PendingSave[]): string | null
}

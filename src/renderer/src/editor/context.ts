/** What the editor needs to know about other notes, supplied by the app. */
export interface EditorContext {
  resolve(target: string): { title: string; snippet: string } | null
  open(target: string): void
  linkNames(): string[]
  /** The open note's path in the notes folder, for images linked relative to it. */
  notePath(): string | null
}

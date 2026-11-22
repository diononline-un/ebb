/**
 * Prop and row types of the dump feature. They live outside the .tsx files on purpose: the
 * no-hardcoded-text test reads JSX text between `>` and `<`, and `Promise<void>` inside a type
 * literal looks exactly like that.
 */

export type DumpEntry = {
  id: string
  text: string
  taskId: string | null
  /** Still in the offline queue, so no action until it reaches the server. */
  pending: boolean
}

export type DumpListProps = {
  entries: DumpEntry[]
  onToTask: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
}

export type DumpComposerProps = {
  onSubmit: (text: string) => Promise<boolean>
  busy: boolean
  error: string | null
}

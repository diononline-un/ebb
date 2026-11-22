import type { TriageAnswer } from '../../../shared/triage.ts'

/** Sends one answer and resolves when the server has taken it. */
export type TriageHandler = (taskId: string, answer: TriageAnswer) => Promise<void>

/** Answers 'conflict' when another task already holds today's anchor. */
export type AnchorHandler = (taskId: string, replace: boolean) => Promise<'ok' | 'conflict'>

import type { ReactNode } from 'react'

export type AuthFrameProps = {
  title: string
  children: ReactNode
  footer?: ReactNode
}

/** Auth screens stand alone: no navigation bar, one column, everything within thumb reach. */
export function AuthFrame({ title, children, footer }: AuthFrameProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-content flex-col justify-center gap-8 px-4 py-12">
      <h1 className="text-title">{title}</h1>
      {children}
      {footer ? <div className="flex flex-col gap-3 text-small text-ink-2">{footer}</div> : null}
    </main>
  )
}

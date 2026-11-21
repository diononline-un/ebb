import type { ComponentProps } from 'react'
import { Input } from '../../ui/Input.tsx'

export type AuthFieldProps = ComponentProps<'input'> & {
  label: string
  hint?: string
}

export function AuthField({ label, hint, id, ...props }: AuthFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small text-ink-2">
        {label}
      </label>
      <Input {...props} id={id} />
      {hint ? <p className="text-meta text-ink-3">{hint}</p> : null}
    </div>
  )
}

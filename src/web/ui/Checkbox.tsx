import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * Circle checkbox, 24 px visual inside a 44 px hit area (§6 anatomy).
 * The checked state uses --signal, never red or orange.
 */
export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn('group flex size-11 shrink-0 items-center justify-center rounded-pill', className)}
      {...props}
    >
      <span className="flex size-6 items-center justify-center rounded-pill border border-line bg-ground text-signal-ink group-data-[state=checked]:border-signal group-data-[state=checked]:bg-signal">
        <CheckboxPrimitive.Indicator>
          <Check size={16} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  )
}

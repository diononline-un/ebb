import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

const button = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-body font-medium motion-quick disabled:pointer-events-none disabled:text-ink-3',
  {
    variants: {
      variant: {
        primary: 'bg-signal text-signal-ink hover:bg-signal-hover',
        secondary: 'border border-line bg-surface-2 text-ink hover:bg-surface-sunken',
        ghost: 'text-ink-2 hover:bg-surface-sunken hover:text-ink',
        danger: 'text-danger hover:bg-surface-sunken',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof button> & {
    asChild?: boolean
  }

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'

  return <Component className={cn(button({ variant }), className)} {...props} />
}

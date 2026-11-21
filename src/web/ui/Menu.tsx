import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export const Menu = DropdownMenuPrimitive.Root
export const MenuTrigger = DropdownMenuPrimitive.Trigger

export function MenuContent({ className, align = 'end', sideOffset = 8, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 rounded-card border border-line bg-surface-2 p-1 shadow-float', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex min-h-11 cursor-default select-none items-center gap-2 rounded-control px-3 text-body text-ink outline-none data-[highlighted]:bg-surface-sunken',
        className,
      )}
      {...props}
    />
  )
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('my-1 h-px bg-line', className)} {...props} />
}

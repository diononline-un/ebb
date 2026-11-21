import { cn } from '../lib/cn.ts'

export type TideLineProps = {
  /** The one staged moment (§7): scaleX 0 -> 1 when the anchor is done. */
  animateIn?: boolean
  className?: string
}

export function TideLine({ animateIn = false, className }: TideLineProps) {
  return <div aria-hidden="true" className={cn('ebb-tide-line', animateIn && 'ebb-tide-line--in', className)} />
}

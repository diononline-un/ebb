import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button.tsx'
import { IconButton } from '../../ui/IconButton.tsx'
import { Input } from '../../ui/Input.tsx'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui/Menu.tsx'
import { Sheet } from '../../ui/Sheet.tsx'

export type MoveSlot = 'inbox' | 'block1' | 'block2' | 'block3' | 'block4' | 'errands'

export type MoveTarget = { slot: MoveSlot; position?: number } | { doDate: string }

const SLOTS: MoveSlot[] = ['inbox', 'block1', 'block2', 'block3', 'block4', 'errands']

export type MoveMenuProps = {
  /** Already translated name of the task, for the screen reader label of the trigger. */
  taskTitle: string
  onMove: (target: MoveTarget) => void
}

/**
 * The mouse-free way to move a task (DESIGN §6 keeps lists as lists, so a menu replaces dragging):
 * the same targets the drag offers, plus errands and another day.
 */
export function MoveMenu({ taskTitle, onMove }: MoveMenuProps) {
  const { t } = useTranslation('today')
  const [dayOpen, setDayOpen] = useState(false)
  const [pickedDate, setPickedDate] = useState('')

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton label={t('move.menuLabel', { title: taskTitle })}>
            <ChevronDown size={20} aria-hidden="true" />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => onMove({ slot: 'inbox' })}>{t('move.inbox')}</MenuItem>
          {SLOTS.filter((slot) => slot !== 'inbox' && slot !== 'errands').map((slot) => (
            <MenuItem key={slot} onSelect={() => onMove({ slot })}>
              {t(slot)}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => onMove({ slot: 'errands' })}>{t('move.errands')}</MenuItem>
          <MenuItem onSelect={() => setDayOpen(true)}>{t('move.anotherDay')}</MenuItem>
        </MenuContent>
      </Menu>

      <Sheet open={dayOpen} onOpenChange={setDayOpen} title={t('move.pickDay')}>
        <div className="flex flex-col gap-3">
          <label htmlFor="move-day" className="text-small text-ink-2">
            {t('move.pickDayLabel')}
          </label>
          <Input
            id="move-day"
            type="date"
            value={pickedDate}
            onChange={(event) => setPickedDate(event.target.value)}
          />
          <Button
            type="button"
            disabled={!pickedDate}
            onClick={() => {
              onMove({ doDate: pickedDate })
              setDayOpen(false)
              setPickedDate('')
            }}
          >
            {t('move.confirmDay')}
          </Button>
        </div>
      </Sheet>
    </>
  )
}

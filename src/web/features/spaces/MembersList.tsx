import { useTranslation } from 'react-i18next'
import type { Member } from '../../../shared/schemas/spaces.ts'

export type MembersListProps = {
  members: Member[]
  /** Only the owner removes people, and only other people: the owner row carries no button. */
  canRemove: boolean
  onRemove: (userId: string) => void
}

/** The people of a space as a plain list with lines, no cards (DESIGN §6). */
export function MembersList({ members, canRemove, onRemove }: MembersListProps) {
  const { t } = useTranslation('spaces')

  if (members.length === 0) return <p className="text-body text-ink-2">{t('peopleEmpty')}</p>

  return (
    <ul className="flex flex-col">
      {members.map((member) => {
        const label = member.name || member.email
        return (
          <li
            key={member.userId}
            className="flex min-h-13 items-center gap-3 border-b border-line py-1 last:border-b-0"
          >
            <span className="flex flex-1 flex-col justify-center py-1">
              <span className="text-body text-ink">{label}</span>
              <span className="text-meta text-ink-3">
                {t(`role.${member.role}`)} · {member.email}
              </span>
            </span>
            {canRemove && member.role !== 'owner' ? (
              <button
                type="button"
                aria-label={t('removeLabel', { name: label })}
                onClick={() => onRemove(member.userId)}
                className="min-h-11 rounded-control px-3 text-small text-ink-2 motion-quick hover:bg-surface-sunken hover:text-ink"
              >
                {t('remove')}
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

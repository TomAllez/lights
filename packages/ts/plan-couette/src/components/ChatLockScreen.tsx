import type { Profile, Phase } from '../types'
import { CountdownTimer } from './CountdownTimer'

type ChatLockScreenProps = {
  phase: Phase
  likedProfiles: Profile[]
  millisecondsUntilUnlock: number
}

const PREVIEW_PROFILE_COUNT = 3

export function ChatLockScreen({ phase, likedProfiles, millisecondsUntilUnlock }: ChatLockScreenProps) {
  const countdownLabel =
    phase === 'sunday-waiting' ? 'Plus que' : "Le chat s'ouvre dans"

  const previewProfiles = likedProfiles.slice(0, PREVIEW_PROFILE_COUNT)
  const placeholderCount = Math.max(0, PREVIEW_PROFILE_COUNT - previewProfiles.length)

  return (
    <div className="chat-lock-screen">
      <div className="chat-lock-icon">🔒</div>
      <h2 className="chat-lock-title">Le chat s'ouvre dimanche à 14h</h2>
      <p className="chat-lock-subtitle">
        D'ici là, craque pour des profils et tes matchs seront là à 14h pile !
      </p>

      <CountdownTimer
        targetMilliseconds={millisecondsUntilUnlock}
        label={countdownLabel}
      />

      <div className="chat-lock-preview">
        {previewProfiles.map(profile => (
          <img
            key={profile.id}
            className="chat-lock-preview-avatar"
            src={profile.photo}
            alt=""
            aria-hidden="true"
          />
        ))}
        {Array.from({ length: placeholderCount }).map((_, index) => (
          <div key={`placeholder-${index}`} className="chat-lock-preview-placeholder" />
        ))}
      </div>
    </div>
  )
}

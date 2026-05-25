import { useState, useCallback } from 'react'
import type { Profile } from '../types'
import { ProfileCard } from './ProfileCard'

type ExitDirection = 'left' | 'right' | null

// Duration must match the CSS transition on .profile-card.exiting-*
const CARD_EXIT_ANIMATION_MS = 400

type ProfileStackProps = {
  visibleProfiles: Profile[]
  onLike: (profileId: string) => void
  onPass: (profileId: string) => void
}

export function ProfileStack({ visibleProfiles, onLike, onPass }: ProfileStackProps) {
  const [exitDirection, setExitDirection] = useState<ExitDirection>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  const currentProfile = visibleProfiles[0] ?? null
  const nextProfile = visibleProfiles[1] ?? null

  const handleAction = useCallback(
    (direction: 'left' | 'right', profileId: string) => {
      if (isAnimating) return
      setIsAnimating(true)
      setExitDirection(direction)

      setTimeout(() => {
        if (direction === 'right') {
          onLike(profileId)
        } else {
          onPass(profileId)
        }
        setExitDirection(null)
        setIsAnimating(false)
      }, CARD_EXIT_ANIMATION_MS)
    },
    [isAnimating, onLike, onPass]
  )

  return (
    <div className="profile-stack-container">
      <p className="profile-stack-hint">Swipe ❤️ pour liker, ✕ pour passer</p>

      {currentProfile ? (
        <>
          <div className="card-stage">
            {/* Peek card behind current card */}
            {nextProfile && <div className="card-peek" />}
            <ProfileCard profile={currentProfile} exitDirection={exitDirection} />
          </div>

          <div className="action-buttons">
            <button
              className="action-btn action-btn-pass"
              onClick={() => handleAction('left', currentProfile.id)}
              disabled={isAnimating}
              aria-label="Passer"
            >
              ✕
            </button>
            <button
              className="action-btn action-btn-like"
              onClick={() => handleAction('right', currentProfile.id)}
              disabled={isAnimating}
              aria-label="J'aime"
            >
              ❤️
            </button>
          </div>
        </>
      ) : (
        <div className="card-stage-empty">
          <span className="card-stage-empty-emoji">✨</span>
          <p className="card-stage-empty-title">Tu as tout vu !</p>
          <p className="card-stage-empty-text">
            Tu as vu tous les profils disponibles. Reviens jeudi prochain !
          </p>
        </div>
      )}
    </div>
  )
}

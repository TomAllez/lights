import type { Profile, Phase } from '../types'

type MatchesGridProps = {
  likedProfiles: Profile[]
  phase: Phase
  onOpenChat: (profileId: string) => void
  onShowToast: (text: string) => void
}

export function MatchesGrid({ likedProfiles, phase, onOpenChat, onShowToast }: MatchesGridProps) {
  const isChatUnlocked = phase === 'unlocked'

  function handleMatchTap(profileId: string) {
    if (isChatUnlocked) {
      onOpenChat(profileId)
    } else {
      onShowToast("Le chat s'ouvre dimanche à 14h 🔒")
    }
  }

  if (likedProfiles.length === 0) {
    return (
      <div className="matches-container">
        <div className="empty-state">
          <span className="empty-state-emoji">💛</span>
          <p className="empty-state-title">Pas encore de coup de cœur</p>
          <p className="empty-state-text">
            Tu n'as pas encore craqué pour quelqu'un 💛 Va jeter un œil aux profils !
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="matches-container">
      <p className="matches-title">{likedProfiles.length} coup{likedProfiles.length > 1 ? 's' : ''} de cœur</p>
      <div className="matches-grid">
        {likedProfiles.map(profile => (
          <div
            key={profile.id}
            className="match-card"
            onClick={() => handleMatchTap(profile.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && handleMatchTap(profile.id)}
            aria-label={`${isChatUnlocked ? 'Ouvrir le chat avec' : 'Voir le profil de'} ${profile.name}`}
          >
            <div className="match-card-photo-wrap">
              <img
                className="match-card-photo"
                src={profile.photo}
                alt={profile.name}
                loading="lazy"
              />
              <div className="match-card-heart">❤️</div>
            </div>
            <div className="match-card-info">
              <p className="match-card-name">{profile.name}</p>
              <p className="match-card-age">{profile.age} ans</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

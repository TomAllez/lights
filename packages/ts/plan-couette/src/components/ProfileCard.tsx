import type { Profile } from '../types'

type ExitDirection = 'left' | 'right' | null

type ProfileCardProps = {
  profile: Profile
  exitDirection: ExitDirection
}

export function ProfileCard({ profile, exitDirection }: ProfileCardProps) {
  const exitClass =
    exitDirection === 'right'
      ? ' exiting-right'
      : exitDirection === 'left'
      ? ' exiting-left'
      : ''

  return (
    <div className={`profile-card${exitClass}`}>
      {exitDirection === 'right' && (
        <div className="like-flash visible">J'AIME ❤️</div>
      )}
      {exitDirection === 'left' && (
        <div className="pass-flash visible">PASSER ✕</div>
      )}

      <img
        className="profile-card-photo"
        src={profile.photo}
        alt={profile.name}
        loading="eager"
      />

      <div className="profile-card-overlay">
        <div className="profile-card-name-row">
          <span className="profile-card-name">{profile.name}</span>
          <span className="profile-card-age">{profile.age}</span>
          <span className="profile-card-distance">{profile.distance} km</span>
        </div>

        <p className="profile-card-bio">{profile.bio}</p>

        <div className="profile-card-tags">
          {profile.tags.map(tag => (
            <span key={tag} className="profile-card-tag">
              {tag}
            </span>
          ))}
        </div>

        <p className="profile-card-looking">
          <strong>Je cherche :</strong> {profile.lookingFor}
        </p>
      </div>
    </div>
  )
}

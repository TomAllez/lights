import { CountdownTimer } from './CountdownTimer'

type TooEarlyScreenProps = {
  millisecondsUntilBrowse: number
}

export function TooEarlyScreen({ millisecondsUntilBrowse }: TooEarlyScreenProps) {
  return (
    <div className="too-early-screen">
      <span className="too-early-emoji">🛋️</span>
      <h1 className="too-early-title">Reviens jeudi !</h1>
      <p className="too-early-subtitle">
        L'appli se déverrouille jeudi pour que tu puisses explorer les profils.
        Le chat, lui, s'ouvre dimanche à 14h.
      </p>
      <div className="too-early-card">
        <CountdownTimer
          targetMilliseconds={millisecondsUntilBrowse}
          label="Ouverture dans"
        />
      </div>
    </div>
  )
}

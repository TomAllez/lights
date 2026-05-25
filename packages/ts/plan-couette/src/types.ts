export type Phase = 'locked' | 'browse' | 'sunday-waiting' | 'unlocked'

export type Profile = {
  id: string
  name: string
  age: number
  photo: string
  bio: string
  tags: string[]
  lookingFor: string
  distance: number
  openingMessage: string
}

export type MessageAuthor = 'me' | 'them'

export type ChatMessage = {
  from: MessageAuthor
  text: string
  timestamp: number
}

export type Tab = 'discover' | 'matches' | 'messages'

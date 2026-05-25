import { useState, useRef, useEffect, useCallback } from 'react'
import type { Profile, ChatMessage } from '../types'
import type { MessagesState } from '../hooks/useMessages'

type ChatSectionProps = {
  likedProfiles: Profile[]
  messagesState: MessagesState
  initialOpenProfileId: string | null
  onClearInitialProfile: () => void
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function ChatSection({
  likedProfiles,
  messagesState,
  initialOpenProfileId,
  onClearInitialProfile,
}: ChatSectionProps) {
  const [openProfileId, setOpenProfileId] = useState<string | null>(initialOpenProfileId)

  useEffect(() => {
    if (initialOpenProfileId !== null) {
      setOpenProfileId(initialOpenProfileId)
      messagesState.markRead(initialOpenProfileId)
      onClearInitialProfile()
    }
  }, [initialOpenProfileId, messagesState, onClearInitialProfile])

  function handleSelectProfile(profileId: string) {
    setOpenProfileId(profileId)
    messagesState.markRead(profileId)
  }

  function handleCloseChat() {
    setOpenProfileId(null)
  }

  const openProfile = openProfileId
    ? (likedProfiles.find(p => p.id === openProfileId) ?? null)
    : null

  return (
    <div className="chat-section">
      <div className="chat-section-inner">
        <ChatList
          likedProfiles={likedProfiles}
          messagesState={messagesState}
          onSelectProfile={handleSelectProfile}
        />

        {openProfile && (
          <ChatWindow
            profile={openProfile}
            messages={messagesState.messagesByProfileId[openProfile.id] ?? []}
            onSend={text => messagesState.sendMessage(openProfile.id, text)}
            onBack={handleCloseChat}
          />
        )}
      </div>
    </div>
  )
}

// ── Conversation list ─────────────────────────────────────────────────────────

type ChatListProps = {
  likedProfiles: Profile[]
  messagesState: MessagesState
  onSelectProfile: (profileId: string) => void
}

function ChatList({ likedProfiles, messagesState, onSelectProfile }: ChatListProps) {
  const sortedProfiles = [...likedProfiles].sort((profileA, profileB) => {
    const lastMessageA = messagesState.getLastMessage(profileA.id)
    const lastMessageB = messagesState.getLastMessage(profileB.id)
    const timestampA = lastMessageA?.timestamp ?? 0
    const timestampB = lastMessageB?.timestamp ?? 0
    return timestampB - timestampA
  })

  if (sortedProfiles.length === 0) {
    return (
      <div className="chat-list">
        <div className="empty-state">
          <span className="empty-state-emoji">💬</span>
          <p className="empty-state-title">Aucune conversation</p>
          <p className="empty-state-text">
            Like des profils pour débloquer le chat dimanche à 14h !
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-list">
      {sortedProfiles.map(profile => {
        const lastMessage = messagesState.getLastMessage(profile.id)
        const hasUnread = messagesState.getUnreadCount(profile.id) > 0

        return (
          <div
            key={profile.id}
            className="chat-list-item"
            onClick={() => onSelectProfile(profile.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelectProfile(profile.id)}
          >
            <div className="chat-list-avatar-wrap">
              <img
                className="chat-list-avatar"
                src={profile.photo}
                alt={profile.name}
                loading="lazy"
              />
              {hasUnread && <div className="chat-list-unread-dot" />}
            </div>

            <div className="chat-list-info">
              <p className="chat-list-name">{profile.name}</p>
              <p className="chat-list-preview">
                {lastMessage
                  ? (lastMessage.from === 'me' ? 'Moi : ' : '') + lastMessage.text
                  : 'Nouvelle connexion 💛'}
              </p>
            </div>

            {lastMessage && (
              <span className="chat-list-time">
                {formatMessageTime(lastMessage.timestamp)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Chat window ───────────────────────────────────────────────────────────────

type ChatWindowProps = {
  profile: Profile
  messages: ChatMessage[]
  onSend: (text: string) => void
  onBack: () => void
}

function ChatWindow({ profile, messages, onSend, onBack }: ChatWindowProps) {
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(() => {
    const trimmedText = inputText.trim()
    if (!trimmedText) return
    onSend(trimmedText)
    setInputText('')
  }, [inputText, onSend])

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <button className="chat-back-btn" onClick={onBack} aria-label="Retour">
          ←
        </button>
        <img
          className="chat-window-avatar"
          src={profile.photo}
          alt={profile.name}
        />
        <div>
          <p className="chat-window-name">{profile.name}</p>
          <p className="chat-window-status">En ligne 🌙</p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <ChatBubble key={index} message={message} profilePhoto={profile.photo} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <input
          className="chat-input"
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écris un message..."
          aria-label="Message"
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!inputText.trim()}
          aria-label="Envoyer"
        >
          ➤
        </button>
      </div>
    </div>
  )
}

type ChatBubbleProps = {
  message: ChatMessage
  profilePhoto: string
}

function ChatBubble({ message, profilePhoto }: ChatBubbleProps) {
  const isMine = message.from === 'me'

  return (
    <div className={`chat-message-group ${isMine ? 'mine' : 'theirs'}`}>
      <div className={`chat-message-row ${isMine ? 'mine' : 'theirs'}`}>
        {!isMine && (
          <img
            className="chat-message-avatar"
            src={profilePhoto}
            alt=""
            aria-hidden="true"
          />
        )}
        <div className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
          {message.text}
        </div>
      </div>
      <span className="chat-bubble-time">{formatMessageTime(message.timestamp)}</span>
    </div>
  )
}

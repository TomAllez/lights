import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChatMessage, Phase } from '../types'
import { ALL_PROFILES } from '../data/profiles'

const STORAGE_KEY_MESSAGES = 'pcd_messages'
const STORAGE_KEY_CHAT_SEEDED = 'pcd_chat_seeded'

type MessagesByProfileId = Record<string, ChatMessage[]>

function loadMessagesFromStorage(): MessagesByProfileId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MESSAGES)
    if (!raw) return {}
    return JSON.parse(raw) as MessagesByProfileId
  } catch {
    return {}
  }
}

function saveMessagesToStorage(messages: MessagesByProfileId): void {
  localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages))
}

function isChatSeeded(): boolean {
  return localStorage.getItem(STORAGE_KEY_CHAT_SEEDED) === 'true'
}

function markChatAsSeeded(): void {
  localStorage.setItem(STORAGE_KEY_CHAT_SEEDED, 'true')
}

function buildOpeningMessages(likedProfileIds: string[]): MessagesByProfileId {
  const seededMessages: MessagesByProfileId = {}
  const openingTimestamp = Date.now()

  likedProfileIds.forEach((profileId, index) => {
    const profile = ALL_PROFILES.find(p => p.id === profileId)
    if (!profile) return
    seededMessages[profileId] = [
      {
        from: 'them',
        text: profile.openingMessage,
        // Stagger by 1 second so sort order is deterministic
        timestamp: openingTimestamp + index * 1000,
      },
    ]
  })

  return seededMessages
}

export type MessagesState = {
  messagesByProfileId: MessagesByProfileId
  sendMessage: (profileId: string, text: string) => void
  getLastMessage: (profileId: string) => ChatMessage | null
  getUnreadCount: (profileId: string) => number
  markRead: (profileId: string) => void
}

const READ_TIMESTAMPS_KEY = 'pcd_read_timestamps'

function loadReadTimestamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(READ_TIMESTAMPS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

function saveReadTimestamps(timestamps: Record<string, number>): void {
  localStorage.setItem(READ_TIMESTAMPS_KEY, JSON.stringify(timestamps))
}

export function useMessages(phase: Phase, likedProfileIds: string[]): MessagesState {
  const [messagesByProfileId, setMessagesByProfileId] = useState<MessagesByProfileId>(
    loadMessagesFromStorage
  )
  const [readTimestamps, setReadTimestamps] = useState<Record<string, number>>(
    loadReadTimestamps
  )
  // Track whether seeding has happened in this session to avoid re-seeding
  const hasSeededRef = useRef(false)

  useEffect(() => {
    if (phase !== 'unlocked') return
    if (isChatSeeded()) return
    if (hasSeededRef.current) return
    hasSeededRef.current = true

    const openingMessages = buildOpeningMessages(likedProfileIds)
    setMessagesByProfileId(previous => {
      const merged: MessagesByProfileId = { ...previous }
      for (const [profileId, messages] of Object.entries(openingMessages)) {
        if (!merged[profileId] || merged[profileId].length === 0) {
          merged[profileId] = messages
        }
      }
      saveMessagesToStorage(merged)
      return merged
    })
    markChatAsSeeded()
  }, [phase, likedProfileIds])

  const sendMessage = useCallback((profileId: string, text: string) => {
    const newMessage: ChatMessage = {
      from: 'me',
      text,
      timestamp: Date.now(),
    }
    setMessagesByProfileId(previous => {
      const existingThread = previous[profileId] ?? []
      const updated = {
        ...previous,
        [profileId]: [...existingThread, newMessage],
      }
      saveMessagesToStorage(updated)
      return updated
    })
  }, [])

  const getLastMessage = useCallback(
    (profileId: string): ChatMessage | null => {
      const thread = messagesByProfileId[profileId]
      if (!thread || thread.length === 0) return null
      return thread[thread.length - 1]
    },
    [messagesByProfileId]
  )

  const getUnreadCount = useCallback(
    (profileId: string): number => {
      const thread = messagesByProfileId[profileId]
      if (!thread) return 0
      const lastReadTimestamp = readTimestamps[profileId] ?? 0
      return thread.filter(
        message => message.from === 'them' && message.timestamp > lastReadTimestamp
      ).length
    },
    [messagesByProfileId, readTimestamps]
  )

  const markRead = useCallback((profileId: string) => {
    setReadTimestamps(previous => {
      const updated = { ...previous, [profileId]: Date.now() }
      saveReadTimestamps(updated)
      return updated
    })
  }, [])

  return {
    messagesByProfileId,
    sendMessage,
    getLastMessage,
    getUnreadCount,
    markRead,
  }
}

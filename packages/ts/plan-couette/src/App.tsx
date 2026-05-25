import { useState, useCallback } from 'react'
import type { Tab } from './types'
import { ALL_PROFILES } from './data/profiles'
import { useSundayState } from './hooks/useSundayState'
import { useMessages } from './hooks/useMessages'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { TooEarlyScreen } from './components/TooEarlyScreen'
import { ProfileStack } from './components/ProfileStack'
import { MatchesGrid } from './components/MatchesGrid'
import { ChatSection } from './components/ChatSection'
import { ChatLockScreen } from './components/ChatLockScreen'
import { Toast, useToast } from './components/Toast'

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('discover')
  const [chatTargetProfileId, setChatTargetProfileId] = useState<string | null>(null)

  const {
    phase,
    millisecondsUntilBrowse,
    millisecondsUntilUnlock,
    likedProfileIds,
    passedProfileIds,
    likeProfile,
    passProfile,
  } = useSundayState()

  const messagesState = useMessages(phase, likedProfileIds)
  const { toastMessages, showToast, dismissToast } = useToast()

  const likedProfiles = ALL_PROFILES.filter(p => likedProfileIds.includes(p.id))

  // Profiles the user hasn't yet acted on (neither liked nor passed)
  const unseenProfiles = ALL_PROFILES.filter(
    p => !likedProfileIds.includes(p.id) && !passedProfileIds.includes(p.id)
  )

  // Count unread messages across all liked profiles
  const totalUnreadCount = likedProfileIds.reduce(
    (total, profileId) => total + messagesState.getUnreadCount(profileId),
    0
  )

  const handleOpenChatWithProfile = useCallback((profileId: string) => {
    setChatTargetProfileId(profileId)
    setActiveTab('messages')
  }, [])

  const handleClearChatTarget = useCallback(() => {
    setChatTargetProfileId(null)
  }, [])

  if (phase === 'locked') {
    return (
      <div className="app-shell">
        <Header />
        <div className="app-content">
          <TooEarlyScreen millisecondsUntilBrowse={millisecondsUntilBrowse} />
        </div>
        <Toast messages={toastMessages} onDismiss={dismissToast} />
      </div>
    )
  }

  function renderActiveTab() {
    if (activeTab === 'discover') {
      return (
        <ProfileStack
          visibleProfiles={unseenProfiles}
          onLike={likeProfile}
          onPass={passProfile}
        />
      )
    }

    if (activeTab === 'matches') {
      return (
        <MatchesGrid
          likedProfiles={likedProfiles}
          phase={phase}
          onOpenChat={handleOpenChatWithProfile}
          onShowToast={showToast}
        />
      )
    }

    // messages tab
    if (phase !== 'unlocked') {
      return (
        <ChatLockScreen
          phase={phase}
          likedProfiles={likedProfiles}
          millisecondsUntilUnlock={millisecondsUntilUnlock}
        />
      )
    }

    return (
      <ChatSection
        likedProfiles={likedProfiles}
        messagesState={messagesState}
        initialOpenProfileId={chatTargetProfileId}
        onClearInitialProfile={handleClearChatTarget}
      />
    )
  }

  return (
    <div className="app-shell">
      <Header />
      <div className="app-content">{renderActiveTab()}</div>
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadMessageCount={totalUnreadCount}
      />
      <Toast messages={toastMessages} onDismiss={dismissToast} />
    </div>
  )
}

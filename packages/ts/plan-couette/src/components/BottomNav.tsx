import type { Tab } from '../types'

type BottomNavProps = {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  unreadMessageCount: number
}

type NavTabDefinition = {
  id: Tab
  label: string
  icon: string
}

const NAV_TABS: NavTabDefinition[] = [
  { id: 'discover', label: 'Découvrir', icon: '🔍' },
  { id: 'matches', label: 'Coups de cœur', icon: '💛' },
  { id: 'messages', label: 'Messages', icon: '💬' },
]

export function BottomNav({ activeTab, onTabChange, unreadMessageCount }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      {NAV_TABS.map(tab => (
        <button
          key={tab.id}
          className={`nav-tab${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <span className="nav-tab-icon">{tab.icon}</span>
          <span className="nav-tab-label">{tab.label}</span>
          {tab.id === 'messages' && unreadMessageCount > 0 && (
            <span className="nav-tab-badge">{unreadMessageCount}</span>
          )}
        </button>
      ))}
    </nav>
  )
}

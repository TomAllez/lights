import { useState, useEffect, useCallback } from 'react'
import type { Phase } from '../types'

const STORAGE_KEY_LIKES = 'pcd_likes'
const STORAGE_KEY_PASSED = 'pcd_passed'

function readStringArrayFromStorage(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

function writeStringArrayToStorage(key: string, value: string[]): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function resolvePhaseFromUrlParam(): Phase | null {
  const params = new URLSearchParams(window.location.search)
  const override = params.get('phase')
  if (
    override === 'locked' ||
    override === 'browse' ||
    override === 'sunday-waiting' ||
    override === 'unlocked'
  ) {
    return override
  }
  return null
}

function computePhaseFromDate(now: Date): Phase {
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const hourOfDay = now.getHours()

  if (dayOfWeek === 0) {
    // Sunday
    return hourOfDay >= 14 ? 'unlocked' : 'sunday-waiting'
  }

  if (dayOfWeek >= 4 && dayOfWeek <= 6) {
    // Thursday, Friday, Saturday
    return 'browse'
  }

  // Monday (1), Tuesday (2), Wednesday (3)
  return 'locked'
}

function computeMillisecondsUntilNextThursday(now: Date): number {
  const dayOfWeek = now.getDay()
  // Thursday is day 4; find how many days forward to reach it
  const daysUntilThursday = ((4 - dayOfWeek + 7) % 7) || 7
  const nextThursday = new Date(now)
  nextThursday.setDate(now.getDate() + daysUntilThursday)
  nextThursday.setHours(0, 0, 0, 0)
  return nextThursday.getTime() - now.getTime()
}

function computeMillisecondsUntilSunday14(now: Date): number {
  const dayOfWeek = now.getDay()
  const daysUntilSunday = ((0 - dayOfWeek + 7) % 7) || 7
  const nextSunday = new Date(now)
  nextSunday.setDate(now.getDate() + daysUntilSunday)
  nextSunday.setHours(14, 0, 0, 0)
  return nextSunday.getTime() - now.getTime()
}

export type SundayState = {
  phase: Phase
  millisecondsUntilBrowse: number
  millisecondsUntilUnlock: number
  likedProfileIds: string[]
  passedProfileIds: string[]
  likeProfile: (profileId: string) => void
  passProfile: (profileId: string) => void
}

export function useSundayState(): SundayState {
  const [likedProfileIds, setLikedProfileIds] = useState<string[]>(() =>
    readStringArrayFromStorage(STORAGE_KEY_LIKES)
  )
  const [passedProfileIds, setPassedProfileIds] = useState<string[]>(() =>
    readStringArrayFromStorage(STORAGE_KEY_PASSED)
  )
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const urlOverride = resolvePhaseFromUrlParam()
  const phase: Phase = urlOverride ?? computePhaseFromDate(now)

  const millisecondsUntilBrowse = computeMillisecondsUntilNextThursday(now)
  const millisecondsUntilUnlock = computeMillisecondsUntilSunday14(now)

  const likeProfile = useCallback((profileId: string) => {
    setLikedProfileIds(previous => {
      if (previous.includes(profileId)) return previous
      const updated = [...previous, profileId]
      writeStringArrayToStorage(STORAGE_KEY_LIKES, updated)
      return updated
    })
    setPassedProfileIds(previous => {
      const updated = previous.filter(id => id !== profileId)
      writeStringArrayToStorage(STORAGE_KEY_PASSED, updated)
      return updated
    })
  }, [])

  const passProfile = useCallback((profileId: string) => {
    setPassedProfileIds(previous => {
      if (previous.includes(profileId)) return previous
      const updated = [...previous, profileId]
      writeStringArrayToStorage(STORAGE_KEY_PASSED, updated)
      return updated
    })
  }, [])

  return {
    phase,
    millisecondsUntilBrowse,
    millisecondsUntilUnlock,
    likedProfileIds,
    passedProfileIds,
    likeProfile,
    passProfile,
  }
}

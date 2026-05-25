import { useState, useEffect, useCallback } from 'react'

type ToastMessage = {
  id: number
  text: string
}

type ToastProps = {
  messages: ToastMessage[]
  onDismiss: (id: number) => void
}

export function Toast({ messages, onDismiss }: ToastProps) {
  return (
    <div className="toast-container">
      {messages.map(message => (
        <ToastItem key={message.id} message={message} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

type ToastItemProps = {
  message: ToastMessage
  onDismiss: (id: number) => void
}

function ToastItem({ message, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(message.id), 3000)
    return () => clearTimeout(timer)
  }, [message.id, onDismiss])

  return (
    <div className="toast-item" onClick={() => onDismiss(message.id)}>
      {message.text}
    </div>
  )
}

let nextToastId = 1

export function useToast() {
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([])

  const showToast = useCallback((text: string) => {
    const id = nextToastId++
    setToastMessages(prev => [...prev, { id, text }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToastMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  return { toastMessages, showToast, dismissToast }
}

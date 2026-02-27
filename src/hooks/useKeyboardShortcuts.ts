import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (INPUT_TAGS.has(el.tagName)) return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + S → trigger form save on /new-trade
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (location.pathname === '/new-trade') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('trade:save'))
        }
        return
      }

      // Single-key shortcuts — skip when user is typing
      if (isTyping()) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault()
          navigate('/new-trade')
          break
        case 'l':
        case 'L':
          e.preventDefault()
          navigate('/trade-log')
          break
        case 'd':
        case 'D':
          e.preventDefault()
          navigate('/')
          break
        case 'Escape':
          // Blur focused element to dismiss dropdowns, date pickers, etc.
          ;(document.activeElement as HTMLElement | null)?.blur()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, location.pathname])
}

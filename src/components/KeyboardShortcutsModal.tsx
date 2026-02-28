import { useState, useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (INPUT_TAGS.has(el.tagName)) return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

const SHORTCUTS = [
  { key: 'N', description: 'New Trade' },
  { key: 'L', description: 'Trade Log' },
  { key: 'D', description: 'Dashboard' },
  { key: '⚡', description: 'Quick Entry (sidebar)' },
  { key: 'Cmd+S', description: 'Save trade (on New Trade page)' },
  { key: 'Esc', description: 'Blur focused element' },
  { key: '↑ ↓', description: 'Navigate rows in Trade Log' },
  { key: 'Enter', description: 'Expand / collapse row in Trade Log' },
  { key: '?', description: 'Show this modal' },
]

export default function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false)
        return
      }
      if (e.key === '?' && !isTyping() && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-card-hover"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ks-title"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard size={15} className="text-accent" aria-hidden="true" />
            <h2 id="ks-title" className="font-semibold text-text-primary">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-0.5">
          {SHORTCUTS.map(({ key, description }) => (
            <div
              key={key}
              className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
            >
              <span className="text-sm text-text-secondary">{description}</span>
              <kbd className="px-2 py-0.5 rounded bg-bg-secondary border border-border text-xs font-mono text-text-primary">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

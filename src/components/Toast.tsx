import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: string
  message: string
  type: ToastType
  action?: ToastAction
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DOT_COLOR: Record<ToastType, string> = {
  success: 'bg-profit',
  error: 'bg-loss',
  info: 'bg-accent',
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', action?: ToastAction) => {
      const id = Math.random().toString(36).slice(2)
      // Keep at most 5 toasts; drop the oldest if over limit
      setToasts(prev => [...prev.slice(-4), { id, message, type, action }])
      const timer = setTimeout(() => dismiss(id), 3500)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-bg-card shadow-card-hover pointer-events-auto toast-slide-in"
              style={{ minWidth: 260, maxWidth: 360 }}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[toast.type]}`} />
              <span className="text-sm text-text-primary flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action!.onClick()
                    dismiss(toast.id)
                  }}
                  className="text-xs text-accent font-semibold hover:underline underline-offset-2 shrink-0"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="text-text-muted hover:text-text-primary shrink-0 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

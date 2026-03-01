import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAutoSync } from "./hooks/useAutoSync";
import { useIbkrSync } from "./hooks/useIbkrSync";
import { usePreMarketReminder } from "./hooks/usePreMarketReminder";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import UpdaterDialog from "./components/UpdaterDialog";
import { ToastProvider } from "./components/Toast";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import { runMigrations } from "./lib/db"
import { loadCredentials } from "./lib/credentials";

const Dashboard   = lazy(() => import('./pages/Dashboard'))
const NewTrade    = lazy(() => import('./pages/NewTrade'))
const TradeLog    = lazy(() => import('./pages/TradeLog'))
const Review      = lazy(() => import('./pages/Review'))
const Analytics   = lazy(() => import('./pages/Analytics'))
const Journal     = lazy(() => import('./pages/Journal'))
const Playbook    = lazy(() => import('./pages/Playbook'))
const News        = lazy(() => import('./pages/News'))
const Settings    = lazy(() => import('./pages/Settings'))
const AIAnalysis  = lazy(() => import('./pages/AIAnalysis'))
const Simulator   = lazy(() => import('./pages/Simulator'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  )
}

function App() {
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)

  useEffect(() => {
    // 5s timeout guards against Tauri IPC hang on credentials load
    const timeout = new Promise<void>(resolve => setTimeout(resolve, 5000))
    Promise.race([loadCredentials(), timeout]).then(() => setCredentialsLoaded(true))
  }, [])

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason)
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [])

  runMigrations()
  useAutoSync();
  useIbkrSync();
  usePreMarketReminder();
  useKeyboardShortcuts();

  if (!credentialsLoaded) {
    return (
      <ToastProvider>
        <PageLoader />
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <UpdaterDialog />
      <KeyboardShortcutsModal />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="new-trade" element={<NewTrade />} />
              <Route path="trade-log" element={<TradeLog />} />
              <Route path="review" element={<Review />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="journal" element={<Journal />} />
              <Route path="playbook" element={<Playbook />} />
              <Route path="news" element={<News />} />
              <Route path="settings" element={<Settings />} />
              <Route path="ai-analysis" element={<AIAnalysis />} />
              <Route path="simulator" element={<Simulator />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;

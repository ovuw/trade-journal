import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X, RefreshCw } from "lucide-react";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; body: string | null | undefined }
  | { kind: "downloading"; progress: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export default function UpdaterDialog() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setState({ kind: "checking" });
        const update = await check();
        if (update?.available) {
          setState({ kind: "available", version: update.version, body: update.body });
        } else {
          setState({ kind: "idle" });
        }
      } catch {
        setState({ kind: "idle" });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  async function handleDownload() {
    if (state.kind !== "available") return;
    const version = state.version;
    const body = state.body;
    try {
      const update = await check();
      if (!update?.available) return;
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setState({ kind: "downloading", progress: 0 });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setState({ kind: "downloading", progress: total > 0 ? Math.round((downloaded / total) * 100) : 0 });
        } else if (event.event === "Finished") {
          setState({ kind: "ready" });
        }
      });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      setTimeout(() => setState({ kind: "available", version, body }), 3000);
    }
  }

  async function handleRestart() {
    await relaunch();
  }

  if (dismissed || state.kind === "idle" || state.kind === "checking") {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-xl border border-border bg-bg-card shadow-card-hover">
      {state.kind === "available" && (
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <Download size={13} className="text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary leading-none">Update available</p>
                <p className="text-xs text-text-muted mt-0.5">v{state.version}</p>
              </div>
            </div>
            <button onClick={() => setDismissed(true)} className="text-text-muted hover:text-text-primary p-0.5">
              <X size={14} />
            </button>
          </div>
          {state.body && (
            <p className="mb-3 text-xs text-text-secondary leading-relaxed line-clamp-3">{state.body}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 btn-primary text-xs py-1.5"
            >
              Update Now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {state.kind === "downloading" && (
        <div className="p-4">
          <p className="text-sm font-semibold text-text-primary mb-2.5">Downloading update…</p>
          <div className="h-1.5 w-full rounded-full bg-bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-xs text-text-muted">{state.progress}%</p>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-profit/10 flex items-center justify-center shrink-0">
              <RefreshCw size={13} className="text-profit" />
            </div>
            <p className="text-sm font-semibold text-text-primary">Ready to install</p>
          </div>
          <p className="text-xs text-text-secondary mb-3">Restart the app to apply the update.</p>
          <button onClick={handleRestart} className="w-full btn-primary text-xs py-1.5">
            Restart &amp; Install
          </button>
        </div>
      )}

      {state.kind === "error" && (
        <div className="p-4">
          <p className="text-sm font-semibold text-loss mb-1">Update failed</p>
          <p className="text-xs text-text-secondary">{state.message}</p>
        </div>
      )}
    </div>
  );
}

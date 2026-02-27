import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

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
          setState({
            kind: "available",
            version: update.version,
            body: update.body,
          });
        } else {
          setState({ kind: "idle" });
        }
      } catch {
        // Silently ignore — updater errors shouldn't interrupt the user
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
          const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          setState({ kind: "downloading", progress: pct });
        } else if (event.event === "Finished") {
          setState({ kind: "ready" });
        }
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      // Re-surface the available banner so user can retry
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
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-lg border border-gray-700 bg-gray-900 shadow-2xl">
      {state.kind === "available" && (
        <div className="p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              Update available — v{state.version}
            </span>
            <button
              onClick={() => setDismissed(true)}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            >
              ×
            </button>
          </div>
          {state.body && (
            <p className="mb-3 text-xs text-gray-400 line-clamp-3">{state.body}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Update Now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {state.kind === "downloading" && (
        <div className="p-4">
          <p className="mb-2 text-sm font-semibold text-white">Downloading update…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-gray-400">{state.progress}%</p>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="p-4">
          <p className="mb-1 text-sm font-semibold text-white">Update ready to install</p>
          <p className="mb-3 text-xs text-gray-400">
            Restart the app to apply the update.
          </p>
          <button
            onClick={handleRestart}
            className="w-full rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Restart &amp; Install
          </button>
        </div>
      )}

      {state.kind === "error" && (
        <div className="p-4">
          <p className="mb-1 text-sm font-semibold text-red-400">Update failed</p>
          <p className="text-xs text-gray-400">{state.message}</p>
        </div>
      )}
    </div>
  );
}

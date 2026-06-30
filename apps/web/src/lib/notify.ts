import type { QueueRun } from "../types"

// Desktop notification when a queue run finishes while the tab is backgrounded.
// This gates *browser-only* behaviour (the Notification API), so unlike the
// server-side app settings it lives in localStorage, not /api/settings/app.

const STORAGE_KEY = "tm_notify_queue_done"

export function queueNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function setQueueNotifyEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0")
  } catch {
    // Private mode / quota: silently no-op, the toggle just won't persist.
  }
}

// Whether a notification should actually fire. Pure so the branch logic (enabled
// + permission + the tab being hidden) is testable without the DOM/Notification.
// We only notify when the tab is hidden — if the operator is looking at the app,
// the in-app banner + toast already tell them, and a desktop popup is noise.
export function shouldNotify(
  enabled: boolean,
  hidden: boolean,
  permission: NotificationPermission
): boolean {
  return enabled && hidden && permission === "granted"
}

// Ask for permission when the operator opts in (a no-op if already decided).
export async function ensureNotifyPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied"
  if (Notification.permission !== "default") return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function notifyQueueDone(run: QueueRun): void {
  if (!("Notification" in window)) return
  if (!shouldNotify(queueNotifyEnabled(), document.hidden, Notification.permission)) {
    return
  }
  const ok = run.completed_count ?? 0
  const total = run.operation_count ?? 0
  const failed = run.failed_count ?? 0
  const body = failed
    ? `${ok}/${total} ok · ${failed} failed`
    : `${ok}/${total} operations ok`
  try {
    const notification = new Notification(
      `Queue ${run.status.replace("_", " ")}`,
      { body, tag: `tm-run-${run.id}` }
    )
    // Bring the app back to the foreground when the operator clicks the popup.
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Construction can throw on some platforms even when granted; ignore.
  }
}

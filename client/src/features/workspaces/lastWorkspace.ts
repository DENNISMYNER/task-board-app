// Remembers the last workspace you opened so "/" can take you straight back to it.
// localStorage can throw (private windows, blocked storage), so every access is guarded:
// the app works the same without it, you just land on your first workspace.
const KEY = "task-board:last-workspace";

export function readLastWorkspace(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLastWorkspace(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable: nothing to do */
  }
}

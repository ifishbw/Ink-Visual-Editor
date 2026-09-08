/**
 * The bridge electron/preload.ts exposes on `window`. Undefined in the browser build, so every
 * use has to be optional — the app must keep working under `npm run dev` with no Electron at all.
 * Keep this in sync with the object passed to contextBridge in electron/preload.ts.
 */
interface InkVisualBridge {
  readonly isDesktop: true;
  readonly versions: { app: string; electron: string; chrome: string; node: string };
  /** Files changed on disk, watched by the main process. Returns an unsubscribe function. */
  onChange(cb: (e: { path: string; hash: string | null; event: string }) => void): () => void;
  /** The File > Open Project… menu item, delivering an absolute root .ink path. Returns an unsubscribe function. */
  onOpenProject(cb: (path: string) => void): () => void;
  /** Native Open File dialog; resolves to the chosen absolute path or null when cancelled. */
  pickRoot(startDir: string | null): Promise<string | null>;
}

interface Window {
  inkvisual?: InkVisualBridge;
}

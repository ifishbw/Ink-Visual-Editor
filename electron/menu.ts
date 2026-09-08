/**
 * The application menu.
 *
 * Deliberately missing: Ctrl+S, and the stock undo/redo roles. The renderer handles Ctrl+S and
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y itself at window level (src/App.tsx) against one store-owned
 * snapshot stack (src/model/history.ts). A menu accelerator is consumed before the page sees the
 * key, so any of those here would silently break saving and undo. The clipboard roles stay:
 * CodeMirror relies on the native cut/copy/paste path.
 */
import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions, shell } from 'electron';

export interface MenuActions {
  /** Show the Open dialog and hand the chosen root to the renderer. */
  openProject(win: BrowserWindow | null): void;
}

const GITHUB_URL = 'https://github.com/ifishbw/Ink-Visual-Editor';
const INK_GUIDE_URL = 'https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md';

export function installAppMenu(actions: MenuActions): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? ([{ role: 'appMenu' }] satisfies MenuItemConstructorOptions[]) : []),
    {
      label: '&File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: (_item, win) => actions.openProject(win instanceof BrowserWindow ? win : null),
        },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' }],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      role: 'help',
      submenu: [
        { label: 'InkVisual on GitHub', click: () => void shell.openExternal(GITHUB_URL) },
        { label: 'ink language guide', click: () => void shell.openExternal(INK_GUIDE_URL) },
        { type: 'separator' },
        { label: 'About InkVisual', click: (_item, win) => showAbout(win instanceof BrowserWindow ? win : null) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout(win: BrowserWindow | null): void {
  const detail = [
    `Version ${app.getVersion()}`,
    `Electron ${process.versions.electron}`,
    `Chromium ${process.versions.chrome}`,
    `Node ${process.versions.node}`,
  ].join('\n');
  const options = { type: 'info' as const, title: 'About InkVisual', message: 'InkVisual', detail, buttons: ['OK'] };
  if (win) void dialog.showMessageBox(win, options);
  else void dialog.showMessageBox(options);
}

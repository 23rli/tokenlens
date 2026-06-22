import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } from 'electron';
import { join } from 'node:path';
import { ApiClient } from './services/apiClient';
import { IngestionBridge } from './services/ingestionBridge';
import { IPC, type IngestionMode, type StatusEvent, type WindowMode } from '../shared/contracts';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let windowMode: WindowMode = 'expanded';

const api = new ApiClient();
const bridge = new IngestionBridge(api);

const SIZES: Record<WindowMode, { w: number; h: number }> = {
  minimized: { w: 240, h: 260 },
  expanded: { w: 400, h: 600 },
  deep: { w: 760, h: 680 },
};

// Tiny valid PNG used as a tray icon placeholder (procedural art lives in-window).
const TRAY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVR4nO3OMQ0AIAwEwId/0Q' +
  'kJ7QcLd1cBkpkVAAAAAAAAAAAAAAAAAAAAAAAAAAAAfBpdiQEBaQ7p9wAAAABJRU5ErkJggg==';

function positionWindow(): void {
  if (!win) return;
  const { workArea } = screen.getPrimaryDisplay();
  const [w = SIZES[windowMode].w, h = SIZES[windowMode].h] = win.getSize();
  win.setPosition(workArea.x + workArea.width - w - 16, workArea.y + workArea.height - h - 16);
}

function setWindowMode(mode: WindowMode): void {
  windowMode = mode;
  if (!win) return;
  const s = SIZES[mode];
  win.setSize(s.w, s.h, false);
  positionWindow();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: SIZES[windowMode].w,
    height: SIZES[windowMode].h,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  positionWindow();

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => {
    win = null;
  });
}

function createTray(): void {
  try {
    const icon = nativeImage.createFromDataURL(TRAY_ICON);
    tray = new Tray(icon);
    tray.setToolTip('EcoPrompt Guardians');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show / Hide', click: () => (win?.isVisible() ? win.hide() : win?.show()) },
        { label: 'Compact', click: () => setWindowMode('minimized') },
        { label: 'Expanded', click: () => setWindowMode('expanded') },
        { label: 'Deep insight', click: () => setWindowMode('deep') },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
    tray.on('click', () => (win?.isVisible() ? win.hide() : win?.show()));
  } catch {
    // Tray is a convenience; the always-on-top window provides all controls.
    tray = null;
  }
}

function buildStatus(): StatusEvent {
  return {
    apiOnline: api.online,
    coachConfigured: api.coachConfigured,
    mode: bridge.getMode(),
    scriptedPosition: bridge.getScriptedPosition(),
    scriptedLength: bridge.getScriptedLength(),
    storage: api.storage,
    liveAvailable: bridge.liveAvailable(),
  };
}

function pushStatus(): void {
  win?.webContents.send(IPC.STATUS_EVENT, buildStatus());
}

function registerIpc(): void {
  ipcMain.handle(IPC.GET_STATUS, async () => {
    await api.health();
    return buildStatus();
  });
  ipcMain.handle(IPC.SET_MODE, async (_e, mode: IngestionMode) => {
    await bridge.setMode(mode);
    pushStatus();
    return true;
  });
  ipcMain.handle(IPC.SCRIPTED_NEXT, () => {
    bridge.scriptedNext();
    pushStatus();
  });
  ipcMain.handle(IPC.SCRIPTED_PLAY, () => {
    bridge.scriptedPlay();
    pushStatus();
  });
  ipcMain.handle(IPC.SCRIPTED_PAUSE, () => {
    bridge.scriptedPause();
    pushStatus();
  });
  ipcMain.handle(IPC.SCRIPTED_RESET, async () => {
    await bridge.scriptedReset();
    pushStatus();
  });
  ipcMain.handle(IPC.SUBMIT_MANUAL, (_e, text: string) => bridge.submitManual(text));
  ipcMain.handle(IPC.ACCEPT_REWRITE, (_e, rewrite?: string) => bridge.acceptRewrite(rewrite));
  ipcMain.handle(IPC.GET_METRICS, () => bridge.getMetrics());
  ipcMain.handle(IPC.SET_WINDOW_MODE, (_e, mode: WindowMode) => setWindowMode(mode));
  ipcMain.handle(IPC.QUIT, () => app.quit());
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  createTray();

  bridge.onScore((e) => {
    win?.webContents.send(IPC.SCORE_EVENT, e);
    pushStatus();
  });

  await api.health();
  await bridge.setMode('scripted');
  pushStatus();

  setInterval(() => {
    void api.health().then(pushStatus);
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

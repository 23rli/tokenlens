import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type EcoApi,
  type IngestionMode,
  type ScoreEvent,
  type StatusEvent,
  type WindowMode,
} from '../shared/contracts';

const eco: EcoApi = {
  getStatus: () => ipcRenderer.invoke(IPC.GET_STATUS),
  setMode: (mode: IngestionMode) => ipcRenderer.invoke(IPC.SET_MODE, mode),
  scriptedNext: () => ipcRenderer.invoke(IPC.SCRIPTED_NEXT),
  scriptedPlay: () => ipcRenderer.invoke(IPC.SCRIPTED_PLAY),
  scriptedPause: () => ipcRenderer.invoke(IPC.SCRIPTED_PAUSE),
  scriptedReset: () => ipcRenderer.invoke(IPC.SCRIPTED_RESET),
  submitManual: (text: string) => ipcRenderer.invoke(IPC.SUBMIT_MANUAL, text),
  acceptRewrite: (rewrite?: string) => ipcRenderer.invoke(IPC.ACCEPT_REWRITE, rewrite),
  getMetrics: () => ipcRenderer.invoke(IPC.GET_METRICS),
  setWindowMode: (mode: WindowMode) => ipcRenderer.invoke(IPC.SET_WINDOW_MODE, mode),
  quit: () => ipcRenderer.invoke(IPC.QUIT),
  onScore: (cb: (e: ScoreEvent) => void) => {
    const handler = (_: unknown, e: ScoreEvent): void => cb(e);
    ipcRenderer.on(IPC.SCORE_EVENT, handler);
    return () => ipcRenderer.off(IPC.SCORE_EVENT, handler);
  },
  onStatus: (cb: (s: StatusEvent) => void) => {
    const handler = (_: unknown, s: StatusEvent): void => cb(s);
    ipcRenderer.on(IPC.STATUS_EVENT, handler);
    return () => ipcRenderer.off(IPC.STATUS_EVENT, handler);
  },
};

contextBridge.exposeInMainWorld('eco', eco);

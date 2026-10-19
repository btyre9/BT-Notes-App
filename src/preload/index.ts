import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppApi, VaultApi } from '../shared/types'

function listen<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const vault: VaultApi = {
  root: () => ipcRenderer.invoke('vault:root'),
  chooseRoot: () => ipcRenderer.invoke('vault:choose'),
  loadAll: () => ipcRenderer.invoke('vault:load'),
  save: (save) => ipcRenderer.invoke('vault:save', save),
  trash: (path) => ipcRenderer.invoke('vault:trash', path),
  onEvent: (callback) => listen('vault:event', callback),
}

const appApi: AppApi = {
  onMenu: (callback) => listen('menu', callback),
  saveNow: (saves) => ipcRenderer.sendSync('vault:save-now', saves),
}

contextBridge.exposeInMainWorld('bt', { vault, app: appApi })

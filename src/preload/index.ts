import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { AppApi, LinksApi, VaultApi } from '../shared/types'

function listen<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

/**
 * Paths of files the user dropped or picked. Only these can be copied into the notes folder, so
 * the window can't ask for some other file on disk.
 */
const droppedPaths = new Set<string>()

const vault: VaultApi = {
  root: () => ipcRenderer.invoke('vault:root'),
  chooseRoot: () => ipcRenderer.invoke('vault:choose'),
  loadAll: () => ipcRenderer.invoke('vault:load'),
  save: (save) => ipcRenderer.invoke('vault:save', save),
  trash: (path) => ipcRenderer.invoke('vault:trash', path),
  addAttachment: (name, data) => ipcRenderer.invoke('vault:attachment', name, data),
  importFile: (sourcePath) =>
    droppedPaths.has(sourcePath)
      ? ipcRenderer.invoke('vault:import', sourcePath)
      : Promise.reject(new Error('Only dropped or chosen files can be added')),
  readFile: (path) => ipcRenderer.invoke('vault:read', path),
  openFile: (path) => ipcRenderer.invoke('vault:open', path),
  savePdfPreview: (path, version, data) => ipcRenderer.invoke('vault:pdf-preview', path, version, data),
  docInfo: (path) => ipcRenderer.invoke('vault:doc-info', path),
  onEvent: (callback) => listen('vault:event', callback),
}

const appApi: AppApi = {
  onMenu: (callback) => listen('menu', callback),
  saveNow: (saves) => ipcRenderer.sendSync('vault:save-now', saves),
  filePath: (file) => {
    const path = webUtils.getPathForFile(file)
    if (path) droppedPaths.add(path)
    return path
  },
}

const links: LinksApi = {
  preview: (url) => ipcRenderer.invoke('links:preview', url),
}

contextBridge.exposeInMainWorld('bt', { vault, app: appApi, links })

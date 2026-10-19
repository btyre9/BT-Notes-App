/// <reference types="svelte" />
/// <reference types="vite/client" />

import type { AppApi, VaultApi } from '../../shared/types'

declare global {
  interface Window {
    bt: { vault: VaultApi; app: AppApi }
  }
}

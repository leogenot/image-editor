import type { Alpine } from 'alpinejs'
// @ts-ignore
import { createEditorStore } from './lib/store.js'

export default (Alpine: Alpine) => {
  createEditorStore(Alpine)
}

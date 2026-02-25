import type { Alpine } from 'alpinejs'
// @ts-ignore
import { createEditorStore } from './lib/store.js'
// @ts-ignore
import Collapse from '@alpinejs/collapse'

export default (Alpine: Alpine) => {
  Alpine.plugin(Collapse)
  createEditorStore(Alpine)
}

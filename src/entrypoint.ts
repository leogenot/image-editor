import type { Alpine } from 'alpinejs'
import { createEditorStore } from './lib/store'
import Collapse from '@alpinejs/collapse'

export default (Alpine: Alpine) => {
  Alpine.plugin(Collapse)
  createEditorStore(Alpine)
}

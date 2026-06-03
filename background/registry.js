// =============================================================
// background/registry.js — Feature Registry (Service Worker)
// Manages feature startup based on persisted enabled flags.
// Features register themselves; registry never imports features.
// =============================================================

import { StorageService } from '../services/storage.js';

const _registry = new Map();  // id → { ...feature, active: false }

export const Registry = {

  // Called by each feature file to declare itself
  register(feature) {
    if (!feature.id) throw new Error('Feature must have an id');
    _registry.set(feature.id, { ...feature, active: false });
  },

  // Start all features that are enabled (reads storage)
  async startAll() {
    const { enabledFeatures = {} } = await StorageService.get({ enabledFeatures: {} });
    for (const [id, feature] of _registry) {
      const enabled = enabledFeatures[id] ?? feature.defaultEnabled ?? true;
      if (enabled) this._start(id);
    }
  },

  _start(id) {
    const feature = _registry.get(id);
    if (feature && !feature.active) {
      feature.init?.();
      feature.active = true;
    }
  },

};

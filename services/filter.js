// =============================================================
// services/filter.js — FilterService
// Shared domain/URL filtering logic used by all features.
// Each feature registers its own namespace via register(featureId)
// which returns a filter state object owned by that feature.
// Features call the returned state object instead of re-implementing
// filter logic inline or passing magic feature IDs around.
// =============================================================

import { matchesDomainFilter, normalizeUrl, isHttpTab } from '../shared/url-utils.js';

const _rules = new Map();  // featureId → filter state

export const FilterService = {

  // Register a namespace and return a small state object for the feature to own.
  register(featureId) {
    const filters = [];
    const state = {
      id: featureId,
      filters,
      shouldProcess(url) {
        return FilterService.shouldProcess(featureId, url);
      },
      filterTabs(tabs) {
        return FilterService.filterTabs(featureId, tabs);
      },
      hasFilters() {
        return FilterService.hasFilters(featureId);
      },
    };
    _rules.set(featureId, state);
    return state;
  },

  // Full pipeline: isHttp → normalize → not excluded → passes domain filter
  shouldProcess(featureId, url) {
    const norm = normalizeUrl(url);
    if (!norm) return false;
    const rule = _rules.get(featureId);
    if (!rule) return true;
    return !rule.filters.length || matchesDomainFilter(url, rule.filters);
  },

  // Filter a tab list through the feature's domain filter pipeline
  filterTabs(featureId, tabs) {
    return tabs.filter(t => isHttpTab(t) && this.shouldProcess(featureId, t.url));
  },

  // Check if the feature has any active filters
  hasFilters(featureId) {
    return (_rules.get(featureId)?.filters.length ?? 0) > 0;
  },
};

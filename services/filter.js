// =============================================================
// services/filter.js — FilterService
// Shared domain/URL filtering logic used by all features.
// Each feature registers its own namespace via register(featureId)
// which returns a mutable filters array the panel owns directly.
// Features call FilterService.filterTabs() instead of re-implementing
// filter logic inline.
// =============================================================

import { matchesDomainFilter, normalizeUrl, isHttpTab } from '../shared/url-utils.js';

const _rules = new Map();  // featureId → { filters: [], excludedUrls: Set }

export const FilterService = {

  // Register a namespace — returns the mutable filters array for the panel to own
  register(featureId) {
    const filters = [];
    _rules.set(featureId, { filters, excludedUrls: new Set() });
    return filters;
  },

  // Full pipeline: isHttp → normalize → not excluded → passes domain filter
  shouldProcess(featureId, url) {
    const norm = normalizeUrl(url);
    if (!norm) return false;
    const rule = _rules.get(featureId);
    if (!rule) return true;
    if (rule.excludedUrls.has(norm)) return false;
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

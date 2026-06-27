// =============================================================
// core/filters.js — filter state + matching pipeline
// =============================================================

import { matchesDomainFilter, normalizeUrl, isHttpTab, isDomainToken, normDomain } from './urls.js';

export function createFilterState(initialFilters = []) {
  const filters = [...initialFilters];

  return {
    filters,

    add(raw) {
      for (const token of raw.split(',')) {
        const trimmed = token.trim();
        if (!trimmed) continue;
        const domain = normDomain(trimmed);
        const value = isDomainToken(domain) ? domain : trimmed.toLowerCase();
        if (value && !filters.includes(value)) filters.push(value);
      }
    },

    removeAt(index) {
      filters.splice(index, 1);
    },

    clear() {
      filters.splice(0, filters.length);
    },

    shouldProcess(url) {
      const norm = normalizeUrl(url);
      if (!norm) return false;
      return !filters.length || matchesDomainFilter(url, filters);
    },

    filterTabs(tabs) {
      return tabs.filter(tab => isHttpTab(tab) && this.shouldProcess(tab.url));
    },

    hasFilters() {
      return filters.length > 0;
    },
  };
}

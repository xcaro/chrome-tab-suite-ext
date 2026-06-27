// =============================================================
// core/bookmarks.js — Chrome bookmarks adapter
// =============================================================

export const BookmarkService = {
  createFolder(parentId, title) {
    return chrome.bookmarks.create({ parentId, title });
  },

  createBookmark(parentId, title, url) {
    return chrome.bookmarks.create({ parentId, title, url });
  },
};

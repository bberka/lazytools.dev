'use client';

import { useEffect, useState } from 'react';
import { TAGS_IN_ORDER } from '@/lib/tags';
import type { ToolTag } from '@/lib/types';
import {
  createHomeViewStateStore,
  createSessionStorage,
  DEFAULT_HOME_VIEW_STATE,
  type HomeViewState,
} from './view-state';

/** The home page's view state, kept in this tab's `sessionStorage`. */
export const homeViewState = createHomeViewStateStore(
  createSessionStorage(),
  TAGS_IN_ORDER.map((tag) => tag.id)
);

/** What the home page narrows its tools by. */
export type HomeFilters = Omit<HomeViewState, 'scrollY'>;

export interface HomeView extends HomeFilters {
  /** Searches as the user types. The results start over from the top. */
  setSearchQuery(query: string): void;
  /** Empties the search box and leaves the page where it is scrolled. */
  clearSearch(): void;
  /**
   * Selects a tag, or none with `null`, and jumps to the top of the page. A
   * tag replaces favorites-only.
   */
  selectTag(tag: ToolTag | null): void;
  /**
   * Switches favorites-only on or off and jumps to the top of the page.
   * Favorites-only replaces the selected tag.
   */
  toggleFavoritesOnly(): void;
}

const DEFAULT_FILTERS: HomeFilters = {
  searchQuery: DEFAULT_HOME_VIEW_STATE.searchQuery,
  selectedTag: DEFAULT_HOME_VIEW_STATE.selectedTag,
  showFavoritesOnly: DEFAULT_HOME_VIEW_STATE.showFavoritesOnly,
};

function isSameFilters(a: HomeFilters, b: HomeFilters): boolean {
  return (
    a.searchQuery === b.searchQuery &&
    a.selectedTag === b.selectedTag &&
    a.showFavoritesOnly === b.showFavoritesOnly
  );
}

// How long to wait for the page to grow tall enough for a stored scroll
// offset: 120 animation frames, about 2 seconds.
const MAX_SCROLL_RESTORE_FRAMES = 120;

/**
 * Scrolls to a stored offset as soon as the page is tall enough to reach it,
 * and gives up after about 2 seconds. Calls `onSettled` in both cases.
 * Returns a function that abandons the attempt.
 */
function restoreScroll(scrollY: number, onSettled: () => void): () => void {
  let frameId = 0;
  let frames = 0;

  const attempt = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll >= scrollY) {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      onSettled();
    } else if (frames++ >= MAX_SCROLL_RESTORE_FRAMES) {
      onSettled();
    } else {
      frameId = requestAnimationFrame(attempt);
    }
  };

  attempt();
  return () => cancelAnimationFrame(frameId);
}

/**
 * The home page's filters and the actions that change them, remembered for
 * the session together with the scroll position.
 *
 * The server render and the first client render show the defaults, so the
 * static HTML hydrates without a mismatch. The stored view is applied right
 * after mount, and a reset from elsewhere (the header logo) is applied while
 * the page is on screen.
 */
export function useHomeViewState(): HomeView {
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    // Read here, after mount, and never during render (see above)
    const { scrollY, ...stored } = homeViewState.restore();
    setFilters((current) => (isSameFilters(current, stored) ? current : stored));

    // Scroll offsets are saved only once the stored one has been applied or
    // given up on, so the scrolling before that cannot overwrite it.
    let isTrackingScroll = false;
    const trackScroll = () => {
      isTrackingScroll = true;
    };
    let abandonScrollRestore = () => {};
    if (scrollY > 0) {
      abandonScrollRestore = restoreScroll(scrollY, trackScroll);
    } else {
      trackScroll();
    }

    const handleScroll = () => {
      if (isTrackingScroll) homeViewState.save({ scrollY: window.scrollY });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    const stopListeningToReset = homeViewState.onReset(() => {
      abandonScrollRestore();
      trackScroll();
      setFilters(DEFAULT_FILTERS);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    return () => {
      abandonScrollRestore();
      window.removeEventListener('scroll', handleScroll);
      stopListeningToReset();
    };
  }, []);

  // A change by the user is shown and stored at once. Unless told to keep it,
  // the stored scroll offset goes too: it belonged to the list shown before.
  const change = (changes: Partial<HomeFilters>, { keepScroll = false } = {}) => {
    setFilters((current) => {
      const next = { ...current, ...changes };
      return isSameFilters(current, next) ? current : next;
    });
    homeViewState.save(keepScroll ? changes : { ...changes, scrollY: 0 });
  };

  const jumpToTop = () => window.scrollTo({ top: 0, behavior: 'instant' });

  return {
    ...filters,
    setSearchQuery(query) {
      change({ searchQuery: query });
    },
    clearSearch() {
      change({ searchQuery: '' }, { keepScroll: true });
    },
    selectTag(tag) {
      change(tag ? { selectedTag: tag, showFavoritesOnly: false } : { selectedTag: null });
      jumpToTop();
    },
    toggleFavoritesOnly() {
      change(
        filters.showFavoritesOnly
          ? { showFavoritesOnly: false }
          : { showFavoritesOnly: true, selectedTag: null }
      );
      jumpToTop();
    },
  };
}

import { TAGS_IN_ORDER } from '@/lib/tags';
import type { Tool, ToolComponentLoader, ToolRegistry, ToolTag } from '@/lib/types';
import { TOOL_REGISTRY } from '@/lib/utils/tool-registry';

// The tool catalog answers every question about the tools: which exist, which
// are offered for discovery, and how they are looked up, searched, filtered and
// grouped. Callers ask the catalog and never walk the registry themselves.
//
// Hidden policy, stated once: a hidden tool is left out of discovery (browse
// lists, tag groups, search results) and is always available by id (its route,
// favorites, recents).

export interface ToolCatalogEntry {
  tool: Tool;
  /** Lazy loader for the tool's component. */
  load: ToolComponentLoader;
}

export interface ToolFilter {
  /** Search text. Blank keeps every discoverable tool, in catalog order. */
  query?: string;
  /** Keep only tools that carry this tag. */
  tag?: ToolTag | null;
  /** Keep only the tools with these ids (the user's favorites). */
  onlyFavorites?: readonly string[] | null;
}

export interface ToolTagGroup {
  tag: ToolTag;
  tools: Tool[];
}

export interface ToolCatalog {
  /** Every tool, hidden ones included. For routes, the sitemap and precaching. */
  all(): readonly Tool[];
  /** The tools offered for discovery, in catalog order. */
  discoverable(): readonly Tool[];
  /** A tool and its component loader by slug. Hidden tools resolve too. */
  get(id: string): ToolCatalogEntry | undefined;
  /**
   * The tools behind a list of ids such as favorites or recents, hidden ones
   * included. Unknown ids are skipped and each tool appears once. Results
   * follow the order of `ids` unless `order` is 'catalog'.
   */
  byIds(ids: readonly string[], options?: { order?: 'given' | 'catalog' }): Tool[];
  /**
   * Discoverable tools matching the query, best match first. A blank query
   * returns them all in catalog order.
   */
  search(query: string): Tool[];
  /** Search narrowed by tag and by favorites. Hidden favorites are included. */
  filter(criteria?: ToolFilter): Tool[];
  /**
   * Tools grouped under each of their tags, in canonical tag order. Empty
   * groups are left out. Defaults to every discoverable tool.
   */
  groupByTag(tools?: readonly Tool[]): ToolTagGroup[];
}

// Descriptions are kept within strict limits for visual consistency in the UI
const MIN_DESCRIPTION_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 65;

function assertDescriptionLength(id: string, description: string): void {
  const length = description.length;
  if (length < MIN_DESCRIPTION_LENGTH || length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Tool Description Limit Error: Description for tool "${id}" is ${length} characters. ` +
        `It must be between ${MIN_DESCRIPTION_LENGTH} and ${MAX_DESCRIPTION_LENGTH} characters (inclusive).`
    );
  }
}

function isDiscoverable(tool: Tool): boolean {
  return !tool.hidden;
}

function hasTokenPrefix(text: string, query: string): boolean {
  const cleanText = text.toLowerCase();
  const cleanQuery = query.toLowerCase();
  const formattedText = cleanText
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2');
  const tokens = formattedText.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => token.startsWith(cleanQuery));
}

function calculateSearchScore(tool: Tool, query: string): number {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return 0;

  let score = 0;
  const toolName = tool.name.toLowerCase();
  const toolId = tool.id.toLowerCase();
  const toolDesc = tool.description.toLowerCase();
  const toolKeywords = (tool.keywords || []).map((k) => k.toLowerCase());
  const toolTags = tool.tags.map((t) => t.toLowerCase());

  // 1. Exact matches (highest priority)
  if (toolName === cleanQuery) {
    score += 100;
  } else if (toolId === cleanQuery) {
    score += 90;
  } else if (toolKeywords.includes(cleanQuery)) {
    score += 85;
  }

  // 2. Starts with / Prefix matches (high priority)
  if (toolName.startsWith(cleanQuery)) {
    score += 40;
  } else if (hasTokenPrefix(toolName, cleanQuery)) {
    score += 20;
  }

  if (toolId.startsWith(cleanQuery)) {
    score += 30;
  } else if (hasTokenPrefix(toolId, cleanQuery)) {
    score += 15;
  }

  // 3. Keyword matches
  for (const keyword of toolKeywords) {
    if (keyword.startsWith(cleanQuery)) {
      score += 25;
    } else if (hasTokenPrefix(keyword, cleanQuery)) {
      score += 10;
    }
  }

  // 4. Word-based matching (for multi-word queries)
  const queryWords = cleanQuery.split(/[\s-_]+/).filter(Boolean);
  if (queryWords.length > 1) {
    let wordMatches = 0;
    for (const word of queryWords) {
      let wordScore = 0;
      if (toolName === word) {
        wordScore = Math.max(wordScore, 30);
      } else if (hasTokenPrefix(toolName, word)) {
        wordScore = Math.max(wordScore, 10);
      }

      if (toolKeywords.includes(word)) {
        wordScore = Math.max(wordScore, 15);
      } else if (toolKeywords.some((k) => hasTokenPrefix(k, word))) {
        wordScore = Math.max(wordScore, 5);
      }

      if (hasTokenPrefix(toolDesc, word)) {
        wordScore = Math.max(wordScore, 5);
      }

      if (toolTags.some((t) => hasTokenPrefix(t, word))) {
        wordScore = Math.max(wordScore, 3);
      }

      if (wordScore > 0) {
        score += wordScore;
        wordMatches++;
      }
    }

    // Boost score if all query words matched something in the tool
    if (wordMatches === queryWords.length) {
      score += 30;
    }
  } else {
    // Single word description match
    if (hasTokenPrefix(toolDesc, cleanQuery)) {
      score += 10;
    }
    // Single word tag match
    if (toolTags.some((t) => hasTokenPrefix(t, cleanQuery))) {
      score += 5;
    }
  }

  return score;
}

/**
 * Builds a catalog from a registry value. Throws if an entry breaks the
 * description length limit, so a bad registry fails at module load.
 */
export function createToolCatalog(registry: ToolRegistry): ToolCatalog {
  const entries = new Map<string, ToolCatalogEntry>();

  for (const [id, entry] of Object.entries(registry)) {
    assertDescriptionLength(id, entry.description);
    entries.set(id, {
      tool: {
        id,
        name: entry.name,
        description: entry.description,
        tags: entry.tags,
        icon: entry.icon,
        keywords: [...(entry.keywords ?? [])],
        featured: entry.featured,
        hidden: entry.hidden,
      },
      load: entry.component,
    });
  }

  const tools: readonly Tool[] = [...entries.values()].map((entry) => entry.tool);
  const discoverable: readonly Tool[] = tools.filter(isDiscoverable);
  const hidden: readonly Tool[] = tools.filter((tool) => !isDiscoverable(tool));

  function search(query: string): Tool[] {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [...discoverable];

    // The sort is stable, so equal scores keep catalog order
    return discoverable
      .map((tool) => ({ tool, score: calculateSearchScore(tool, cleanQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ tool }) => tool);
  }

  return {
    all: () => tools,

    discoverable: () => discoverable,

    get: (id) => entries.get(id),

    byIds(ids, { order = 'given' } = {}) {
      const wanted = new Set(ids);
      if (order === 'catalog') return tools.filter((tool) => wanted.has(tool.id));

      return [...wanted]
        .map((id) => entries.get(id)?.tool)
        .filter((tool): tool is Tool => tool !== undefined);
    },

    search,

    filter({ query = '', tag = null, onlyFavorites = null } = {}) {
      let matches = search(query);

      if (tag) {
        matches = matches.filter((tool) => tool.tags.includes(tag));
      }

      if (onlyFavorites) {
        // Favorites are reached by id, so hidden favorites belong in the list.
        // They follow the visible matches and are not narrowed by query or tag.
        const favorites = new Set(onlyFavorites);
        matches = [...matches, ...hidden].filter((tool) => favorites.has(tool.id));
      }

      return matches;
    },

    groupByTag(list = discoverable) {
      const listed = list.filter(isDiscoverable);
      return TAGS_IN_ORDER.map((tag) => ({
        tag: tag.id,
        tools: listed.filter((tool) => tool.tags.includes(tag.id)),
      })).filter((group) => group.tools.length > 0);
    },
  };
}

/** The app's catalog, built from the tool registry. */
export const toolCatalog = createToolCatalog(TOOL_REGISTRY);

import type { Tool, TagInfo, ToolTag } from '../types';
import { TOOL_REGISTRY } from './tool-registry';

// Tag definitions
export const TAGS: Record<ToolTag, TagInfo> = {
  converters: {
    id: 'converters',
    name: 'Converters',
    icon: 'RefreshCw',
    description: 'Convert between different formats',
    color: 'text-blue-500',
  },
  'encoders-decoders': {
    id: 'encoders-decoders',
    name: 'Encoders & Decoders',
    icon: 'Lock',
    description: 'Encode and decode various formats',
    color: 'text-purple-500',
  },
  generators: {
    id: 'generators',
    name: 'Generators',
    icon: 'Sparkles',
    description: 'Generate random data',
    color: 'text-green-500',
  },
  'formatters-validators': {
    id: 'formatters-validators',
    name: 'Formatters & Validators',
    icon: 'FileCheck',
    description: 'Format and validate data',
    color: 'text-orange-500',
  },
  'text-tools': {
    id: 'text-tools',
    name: 'Text Tools',
    icon: 'Type',
    description: 'Text manipulation utilities',
    color: 'text-pink-500',
  },
  utilities: {
    id: 'utilities',
    name: 'Utilities',
    icon: 'Wrench',
    description: 'General utilities',
    color: 'text-cyan-500',
  },
  security: {
    id: 'security',
    name: 'Security',
    icon: 'ShieldCheck',
    description: 'Encryption, hashing, and key generation',
    color: 'text-red-500',
  },
  networking: {
    id: 'networking',
    name: 'Networking',
    icon: 'Globe',
    description: 'Network utilities and diagnostics',
    color: 'text-indigo-500',
  },
  design: {
    id: 'design',
    name: 'Design',
    icon: 'Palette',
    description: 'Design and accessibility tools',
    color: 'text-violet-500',
  },
  calculators: {
    id: 'calculators',
    name: 'Calculators',
    icon: 'Calculator',
    description: 'Math, percentage, and conversion calculators',
    color: 'text-emerald-500',
  },
  'pdf-tools': {
    id: 'pdf-tools',
    name: 'PDF Tools',
    icon: 'FileText',
    description: 'Merge, split, and convert PDF documents',
    color: 'text-red-600',
  },
  'image-tools': {
    id: 'image-tools',
    name: 'Image Tools',
    icon: 'Image',
    description: 'Edit, compress, and transform images',
    color: 'text-orange-600',
  },
};

// Tool metadata is derived from the typed registry so metadata and component
// wiring cannot drift apart.
export const TOOLS: Tool[] = Object.entries(TOOL_REGISTRY).map(
  ([id, tool]) => ({
    id,
    name: tool.name,
    description: tool.description,
    tags: tool.tags,
    icon: tool.icon,
    keywords: [...(tool.keywords ?? [])],
    featured: 'featured' in tool ? tool.featured : undefined,
    hidden: 'hidden' in tool ? tool.hidden : undefined,
  })
);

// Helper functions
export function getToolById(id: string): Tool | undefined {
  return TOOLS.find((tool) => tool.id === id);
}

export function getToolsByTag(tag: ToolTag): Tool[] {
  return TOOLS.filter((tool) => tool.tags.includes(tag) && !tool.hidden);
}

export function getAllTags(): TagInfo[] {
  return Object.values(TAGS);
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

export function calculateSearchScore(tool: Tool, query: string): number {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return 0;

  let score = 0;
  const toolName = tool.name.toLowerCase();
  const toolId = tool.id.toLowerCase();
  const toolDesc = tool.description.toLowerCase();
  const toolKeywords = (tool.keywords || []).map((k) => k.toLowerCase());
  const toolTags = (tool.tags || []).map((t) => t.toLowerCase());

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

export function searchTools(query: string): Tool[] {
  const cleanQuery = query.trim().toLowerCase();

  if (!cleanQuery) return TOOLS.filter((t) => !t.hidden).map((t) => ({ ...t, score: undefined }));

  return TOOLS.map((tool) => ({
    ...tool,
    score: calculateSearchScore(tool, cleanQuery),
  }))
    .filter((tool) => !tool.hidden && (tool.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function filterTools(
  searchQuery: string,
  tag: ToolTag | null,
  favoritesOnly: boolean,
  favorites: string[]
): Tool[] {
  let filtered = searchQuery ? searchTools(searchQuery) : TOOLS.filter((t) => !t.hidden).map((t) => ({ ...t, score: undefined }));

  // Filter by tag
  if (tag) {
    filtered = filtered.filter((tool) => tool.tags.includes(tag));
  }

  // Filter by favorites — include hidden sub-tools that are individually favorited
  if (favoritesOnly) {
    const favoritedHidden = TOOLS.filter(
      (t) => t.hidden && favorites.includes(t.id)
    ).map((t) => ({ ...t, score: undefined }));
    const combined = [...filtered, ...favoritedHidden];
    // Deduplicate by id
    const seen = new Set<string>();
    filtered = combined.filter((tool) => {
      if (seen.has(tool.id)) return false;
      seen.add(tool.id);
      return favorites.includes(tool.id);
    });
  }

  return filtered;
}

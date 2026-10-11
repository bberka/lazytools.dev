import {
  Calculator,
  FileCheck,
  FileText,
  Globe,
  Image as ImageIcon,
  Lock,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Type,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ToolTag } from '@/lib/types';

// Everything about a tag lives here: its name, description, icon, the classes
// each surface renders it with, and the canonical order. `TAGS` is keyed by the
// `ToolTag` union, so a new tag fails typecheck until every field is filled in.
//
// Class strings are full literals on purpose. Tailwind finds them by scanning
// this file, and each surface keeps its own shades: do not build them from
// parts or reuse one surface's classes on another.

export interface Tag {
  id: ToolTag;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Text colour of the tag's icon and headings: home sections, tool cards, palette rows. */
  color: string;
  /** Tag badge on a command palette row. */
  badge: {
    bg: string;
    text: string;
    border: string;
  };
  /** Tag chip in the home page filter bar. */
  chip: {
    borderSelected: string;
    bgSelected: string;
    bgHover: string;
    textSelected: string;
    textHover: string;
    borderHover: string;
    bgActiveHover: string;
  };
  /** Tag shortcut tile on the not-found page. */
  tile: {
    border: string;
    bg: string;
    hover: string;
    text: string;
    glow: string;
  };
}

// Declaration order is the canonical tag order (see TAGS_IN_ORDER)
export const TAGS: Record<ToolTag, Tag> = {
  converters: {
    id: 'converters',
    name: 'Converters',
    description: 'Convert between different formats',
    icon: RefreshCw,
    color: 'text-blue-500',
    badge: {
      bg: 'bg-blue-500/10 dark:bg-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/20 dark:border-blue-500/30',
    },
    chip: {
      borderSelected: 'border-blue-500/50 dark:border-blue-400/50',
      bgSelected: 'bg-blue-500/10 dark:bg-blue-500/20',
      bgHover: 'hover:bg-blue-500/5 dark:hover:bg-blue-500/10',
      textSelected: 'text-blue-600 dark:text-blue-400',
      textHover: 'hover:text-blue-600 dark:hover:text-blue-400',
      borderHover: 'hover:border-blue-500/30 dark:hover:border-blue-400/30',
      bgActiveHover: 'hover:bg-blue-500/15 dark:hover:bg-blue-500/25',
    },
    tile: {
      border: 'border-blue-500/20 dark:border-blue-400/20',
      bg: 'bg-blue-500/5',
      hover: 'hover:border-blue-500/50 hover:bg-blue-500/10 dark:hover:border-blue-400/50 dark:hover:bg-blue-500/10',
      text: 'text-blue-600 dark:text-blue-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]',
    },
  },
  'encoders-decoders': {
    id: 'encoders-decoders',
    name: 'Encoders & Decoders',
    description: 'Encode and decode various formats',
    icon: Lock,
    color: 'text-purple-500',
    badge: {
      bg: 'bg-purple-500/10 dark:bg-purple-500/20',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-500/20 dark:border-purple-500/30',
    },
    chip: {
      borderSelected: 'border-purple-500/50 dark:border-purple-400/50',
      bgSelected: 'bg-purple-500/10 dark:bg-purple-500/20',
      bgHover: 'hover:bg-purple-500/5 dark:hover:bg-purple-500/10',
      textSelected: 'text-purple-600 dark:text-purple-400',
      textHover: 'hover:text-purple-600 dark:hover:text-purple-400',
      borderHover: 'hover:border-purple-500/30 dark:hover:border-purple-400/30',
      bgActiveHover: 'hover:bg-purple-500/15 dark:hover:bg-purple-500/25',
    },
    tile: {
      border: 'border-purple-500/20 dark:border-purple-400/20',
      bg: 'bg-purple-500/5',
      hover: 'hover:border-purple-500/50 hover:bg-purple-500/10 dark:hover:border-purple-400/50 dark:hover:bg-purple-500/10',
      text: 'text-purple-600 dark:text-purple-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(168,85,247,0.2)]',
    },
  },
  generators: {
    id: 'generators',
    name: 'Generators',
    description: 'Generate random data',
    icon: Sparkles,
    color: 'text-green-500',
    badge: {
      bg: 'bg-green-500/10 dark:bg-green-500/20',
      text: 'text-green-600 dark:text-green-400',
      border: 'border-green-500/20 dark:border-green-500/30',
    },
    chip: {
      borderSelected: 'border-green-500/50 dark:border-green-400/50',
      bgSelected: 'bg-green-500/10 dark:bg-green-500/20',
      bgHover: 'hover:bg-green-500/5 dark:hover:bg-green-500/10',
      textSelected: 'text-green-600 dark:text-green-400',
      textHover: 'hover:text-green-600 dark:hover:text-green-400',
      borderHover: 'hover:border-green-500/30 dark:hover:border-green-400/30',
      bgActiveHover: 'hover:bg-green-500/15 dark:hover:bg-green-500/25',
    },
    tile: {
      border: 'border-green-500/20 dark:border-green-400/20',
      bg: 'bg-green-500/5',
      hover: 'hover:border-green-500/50 hover:bg-green-500/10 dark:hover:border-green-400/50 dark:hover:bg-green-500/10',
      text: 'text-green-600 dark:text-green-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]',
    },
  },
  'formatters-validators': {
    id: 'formatters-validators',
    name: 'Formatters & Validators',
    description: 'Format and validate data',
    icon: FileCheck,
    color: 'text-orange-500',
    badge: {
      bg: 'bg-orange-500/10 dark:bg-orange-500/20',
      text: 'text-orange-600 dark:text-orange-400',
      border: 'border-orange-500/20 dark:border-orange-500/30',
    },
    chip: {
      borderSelected: 'border-orange-500/50 dark:border-orange-400/50',
      bgSelected: 'bg-orange-500/10 dark:bg-orange-500/20',
      bgHover: 'hover:bg-orange-500/5 dark:hover:bg-orange-500/10',
      textSelected: 'text-orange-600 dark:text-orange-400',
      textHover: 'hover:text-orange-600 dark:hover:text-orange-400',
      borderHover: 'hover:border-orange-500/30 dark:hover:border-orange-400/30',
      bgActiveHover: 'hover:bg-orange-500/15 dark:hover:bg-orange-500/25',
    },
    tile: {
      border: 'border-orange-500/20 dark:border-orange-400/20',
      bg: 'bg-orange-500/5',
      hover: 'hover:border-orange-500/50 hover:bg-orange-500/10 dark:hover:border-orange-400/50 dark:hover:bg-orange-500/10',
      text: 'text-orange-600 dark:text-orange-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(249,115,22,0.2)]',
    },
  },
  'text-tools': {
    id: 'text-tools',
    name: 'Text Tools',
    description: 'Text manipulation utilities',
    icon: Type,
    color: 'text-pink-500',
    badge: {
      bg: 'bg-pink-500/10 dark:bg-pink-500/20',
      text: 'text-pink-600 dark:text-pink-400',
      border: 'border-pink-500/20 dark:border-pink-500/30',
    },
    chip: {
      borderSelected: 'border-pink-500/50 dark:border-pink-400/50',
      bgSelected: 'bg-pink-500/10 dark:bg-pink-500/20',
      bgHover: 'hover:bg-pink-500/5 dark:hover:bg-pink-500/10',
      textSelected: 'text-pink-600 dark:text-pink-400',
      textHover: 'hover:text-pink-600 dark:hover:text-pink-400',
      borderHover: 'hover:border-pink-500/30 dark:hover:border-pink-400/30',
      bgActiveHover: 'hover:bg-pink-500/15 dark:hover:bg-pink-500/25',
    },
    tile: {
      border: 'border-pink-500/20 dark:border-pink-400/20',
      bg: 'bg-pink-500/5',
      hover: 'hover:border-pink-500/50 hover:bg-pink-500/10 dark:hover:border-pink-400/50 dark:hover:bg-pink-500/10',
      text: 'text-pink-600 dark:text-pink-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(236,72,153,0.2)]',
    },
  },
  utilities: {
    id: 'utilities',
    name: 'Utilities',
    description: 'General utilities',
    icon: Wrench,
    color: 'text-cyan-500',
    badge: {
      bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
      text: 'text-cyan-600 dark:text-cyan-400',
      border: 'border-cyan-500/20 dark:border-cyan-500/30',
    },
    chip: {
      borderSelected: 'border-cyan-500/50 dark:border-cyan-400/50',
      bgSelected: 'bg-cyan-500/10 dark:bg-cyan-500/20',
      bgHover: 'hover:bg-cyan-500/5 dark:hover:bg-cyan-500/10',
      textSelected: 'text-cyan-600 dark:text-cyan-400',
      textHover: 'hover:text-cyan-600 dark:hover:text-cyan-400',
      borderHover: 'hover:border-cyan-500/30 dark:hover:border-cyan-400/30',
      bgActiveHover: 'hover:bg-cyan-500/15 dark:hover:bg-cyan-500/25',
    },
    tile: {
      border: 'border-cyan-500/20 dark:border-cyan-400/20',
      bg: 'bg-cyan-500/5',
      hover: 'hover:border-cyan-500/50 hover:bg-cyan-500/10 dark:hover:border-cyan-400/50 dark:hover:bg-cyan-500/10',
      text: 'text-cyan-600 dark:text-cyan-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]',
    },
  },
  security: {
    id: 'security',
    name: 'Security',
    description: 'Encryption, hashing, and key generation',
    icon: ShieldCheck,
    color: 'text-red-500',
    badge: {
      bg: 'bg-red-500/10 dark:bg-red-500/20',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/20 dark:border-red-500/30',
    },
    chip: {
      borderSelected: 'border-red-500/50 dark:border-red-400/50',
      bgSelected: 'bg-red-500/10 dark:bg-red-500/20',
      bgHover: 'hover:bg-red-500/5 dark:hover:bg-red-500/10',
      textSelected: 'text-red-600 dark:text-red-400',
      textHover: 'hover:text-red-600 dark:hover:text-red-400',
      borderHover: 'hover:border-red-500/30 dark:hover:border-red-400/30',
      bgActiveHover: 'hover:bg-red-500/15 dark:hover:bg-red-500/25',
    },
    tile: {
      border: 'border-red-500/20 dark:border-red-400/20',
      bg: 'bg-red-500/5',
      hover: 'hover:border-red-500/50 hover:bg-red-500/10 dark:hover:border-red-400/50 dark:hover:bg-red-500/10',
      text: 'text-red-600 dark:text-red-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]',
    },
  },
  networking: {
    id: 'networking',
    name: 'Networking',
    description: 'Network utilities and diagnostics',
    icon: Globe,
    color: 'text-indigo-500',
    badge: {
      bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
      text: 'text-indigo-600 dark:text-indigo-400',
      border: 'border-indigo-500/20 dark:border-indigo-500/30',
    },
    chip: {
      borderSelected: 'border-indigo-500/50 dark:border-indigo-400/50',
      bgSelected: 'bg-indigo-500/10 dark:bg-indigo-500/20',
      bgHover: 'hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10',
      textSelected: 'text-indigo-600 dark:text-indigo-400',
      textHover: 'hover:text-indigo-600 dark:hover:text-indigo-400',
      borderHover: 'hover:border-indigo-500/30 dark:hover:border-indigo-400/30',
      bgActiveHover: 'hover:bg-indigo-500/15 dark:hover:bg-indigo-500/25',
    },
    tile: {
      border: 'border-indigo-500/20 dark:border-indigo-400/20',
      bg: 'bg-indigo-500/5',
      hover: 'hover:border-indigo-500/50 hover:bg-indigo-500/10 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/10',
      text: 'text-indigo-600 dark:text-indigo-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]',
    },
  },
  design: {
    id: 'design',
    name: 'Design',
    description: 'Design and accessibility tools',
    icon: Palette,
    color: 'text-violet-500',
    badge: {
      bg: 'bg-violet-500/10 dark:bg-violet-500/20',
      text: 'text-violet-600 dark:text-violet-400',
      border: 'border-violet-500/20 dark:border-violet-500/30',
    },
    chip: {
      borderSelected: 'border-violet-500/50 dark:border-violet-400/50',
      bgSelected: 'bg-violet-500/10 dark:bg-violet-500/20',
      bgHover: 'hover:bg-violet-500/5 dark:hover:bg-violet-500/10',
      textSelected: 'text-violet-600 dark:text-violet-400',
      textHover: 'hover:text-violet-600 dark:hover:text-violet-400',
      borderHover: 'hover:border-violet-500/30 dark:hover:border-violet-400/30',
      bgActiveHover: 'hover:bg-violet-500/15 dark:hover:bg-violet-500/25',
    },
    tile: {
      border: 'border-violet-500/20 dark:border-violet-400/20',
      bg: 'bg-violet-500/5',
      hover: 'hover:border-violet-500/50 hover:bg-violet-500/10 dark:hover:border-violet-400/50 dark:hover:bg-violet-500/10',
      text: 'text-violet-600 dark:text-violet-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(139,92,246,0.2)]',
    },
  },
  calculators: {
    id: 'calculators',
    name: 'Calculators',
    description: 'Math, percentage, and conversion calculators',
    icon: Calculator,
    color: 'text-emerald-500',
    badge: {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-500/20 dark:border-emerald-500/30',
    },
    chip: {
      borderSelected: 'border-emerald-500/50 dark:border-emerald-400/50',
      bgSelected: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      bgHover: 'hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10',
      textSelected: 'text-emerald-600 dark:text-emerald-400',
      textHover: 'hover:text-emerald-600 dark:hover:text-emerald-400',
      borderHover: 'hover:border-emerald-500/30 dark:hover:border-emerald-400/30',
      bgActiveHover: 'hover:bg-emerald-500/15 dark:hover:bg-emerald-500/25',
    },
    tile: {
      border: 'border-emerald-500/20 dark:border-emerald-400/20',
      bg: 'bg-emerald-500/5',
      hover: 'hover:border-emerald-500/50 hover:bg-emerald-500/10 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/10',
      text: 'text-emerald-600 dark:text-emerald-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]',
    },
  },
  'pdf-tools': {
    id: 'pdf-tools',
    name: 'PDF Tools',
    description: 'Merge, split, and convert PDF documents',
    icon: FileText,
    color: 'text-red-600',
    badge: {
      bg: 'bg-red-600/10 dark:bg-red-600/20',
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-600/20 dark:border-red-600/30',
    },
    chip: {
      borderSelected: 'border-red-600/50 dark:border-red-500/50',
      bgSelected: 'bg-red-600/10 dark:bg-red-600/20',
      bgHover: 'hover:bg-red-600/5 dark:hover:bg-red-600/10',
      textSelected: 'text-red-700 dark:text-red-400',
      textHover: 'hover:text-red-700 dark:hover:text-red-400',
      borderHover: 'hover:border-red-600/30 dark:hover:border-red-500/30',
      bgActiveHover: 'hover:bg-red-600/15 dark:hover:bg-red-600/25',
    },
    tile: {
      border: 'border-red-600/20 dark:border-red-500/20',
      bg: 'bg-red-600/5',
      hover: 'hover:border-red-600/50 hover:bg-red-600/10 dark:hover:border-red-500/50 dark:hover:bg-red-600/10',
      text: 'text-red-700 dark:text-red-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(220,38,38,0.2)]',
    },
  },
  'image-tools': {
    id: 'image-tools',
    name: 'Image Tools',
    description: 'Edit, compress, and transform images',
    icon: ImageIcon,
    color: 'text-orange-600',
    badge: {
      bg: 'bg-orange-600/10 dark:bg-orange-600/20',
      text: 'text-orange-700 dark:text-orange-400',
      border: 'border-orange-600/20 dark:border-orange-600/30',
    },
    chip: {
      borderSelected: 'border-orange-600/50 dark:border-orange-500/50',
      bgSelected: 'bg-orange-600/10 dark:bg-orange-600/20',
      bgHover: 'hover:bg-orange-600/5 dark:hover:bg-orange-600/10',
      textSelected: 'text-orange-700 dark:text-orange-400',
      textHover: 'hover:text-orange-700 dark:hover:text-orange-400',
      borderHover: 'hover:border-orange-600/30 dark:hover:border-orange-500/30',
      bgActiveHover: 'hover:bg-orange-600/15 dark:hover:bg-orange-600/25',
    },
    tile: {
      border: 'border-orange-600/20 dark:border-orange-500/20',
      bg: 'bg-orange-600/5',
      hover: 'hover:border-orange-600/50 hover:bg-orange-600/10 dark:hover:border-orange-500/50 dark:hover:bg-orange-600/10',
      text: 'text-orange-700 dark:text-orange-400',
      glow: 'group-hover:shadow-[0_0_15px_rgba(234,88,12,0.2)]',
    },
  },
};

/**
 * Every tag once, in canonical order. Filter chips, tag groups and shortcut
 * tiles all follow this order.
 */
export const TAGS_IN_ORDER: readonly Tag[] = Object.values(TAGS);

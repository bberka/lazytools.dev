import type { ComponentType } from 'react';

// Adding or renaming a tag means editing this union and `lib/tags`, nothing else
export type ToolTag =
  | 'converters'
  | 'encoders-decoders'
  | 'generators'
  | 'formatters-validators'
  | 'text-tools'
  | 'utilities'
  | 'security'
  | 'networking'
  | 'design'
  | 'calculators'
  | 'pdf-tools'
  | 'image-tools';

export interface Tool {
  id: string; // slug-style: 'base64-encoder'
  name: string; // Display name: 'Base64 Encoder/Decoder'
  description: string; // Short description
  tags: [ToolTag, ...ToolTag[]]; // At least one; the first is the primary tag
  icon?: string; // Lucide icon name
  keywords?: string[]; // For search
  featured?: boolean; // Show prominently
  hidden?: boolean; // Left out of discovery, still reachable by id (see lib/catalog)
}

// Shape of the tool registry that the tool catalog is built from
export type ToolComponentLoader = () => Promise<ComponentType>;

export type ToolRegistryEntry = Omit<Tool, 'id'> & {
  component: ToolComponentLoader;
};

export type ToolRegistry = Readonly<Record<string, ToolRegistryEntry>>;

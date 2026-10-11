import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { toolCatalog } from '@/lib/catalog';
import { TAGS } from '@/lib/tags';
import { ToolPageClient } from '@/components/ToolPageClient';

interface ToolPageProps {
  params: Promise<{ slug: string }>;
}

// Generate static paths for all tools, hidden ones included
export async function generateStaticParams() {
  return toolCatalog.all().map((tool) => ({
    slug: tool.id,
  }));
}

// Generate metadata for each tool page
export async function generateMetadata({
  params,
}: ToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = toolCatalog.get(slug)?.tool;

  if (!tool) {
    return {
      title: 'Tool Not Found',
    };
  }

  const tagNames = tool.tags.map((tagId) => TAGS[tagId].name);
  const keywords = [
    tool.name,
    ...(tool.keywords || []),
    ...tagNames,
    'free online tool',
    'browser-based utility',
    'web tool',
    'privacy-first tool',
    'developer tool',
    'online tool',
    'free tool',
    'browser tool',
  ];

  return {
    title: tool.name,
    description: tool.description,
    keywords,
    openGraph: {
      title: tool.name,
      description: tool.description,
      type: 'website',
      url: `/tools/${tool.id}`,
    },
    twitter: {
      card: 'summary',
      title: tool.name,
      description: tool.description,
    },
    alternates: {
      canonical: `/tools/${tool.id}`,
    },
  };
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const entry = toolCatalog.get(slug);

  if (!entry) {
    notFound();
  }

  const ToolComponent = await entry.load();

  return (
    <ToolPageClient tool={entry.tool}>
      <ToolComponent />
    </ToolPageClient>
  );
}

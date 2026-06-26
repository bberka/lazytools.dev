'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const loadingEl = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const MarkdownConverter = dynamic(() => import('./MarkdownConverter').then((m) => ({ default: m.MarkdownConverter })), { ssr: false, loading: () => loadingEl });
const MarkdownToDocx = dynamic(() => import('./MarkdownToDocx').then((m) => ({ default: m.MarkdownToDocx })), { ssr: false, loading: () => loadingEl });
const HtmlConverter = dynamic(() => import('./HtmlConverter').then((m) => ({ default: m.HtmlConverter })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'markdown-editor', label: 'Editor & Export', Component: MarkdownConverter },
  { slug: 'markdown-to-docx', label: 'To DOCX', Component: MarkdownToDocx },
  { slug: 'html-converter', label: 'HTML Converter', Component: HtmlConverter },
] as const;

/** Old slugs that map to the merged editor */
const SLUG_ALIASES: Record<string, string> = {
  'markdown-to-pdf': 'markdown-editor',
  'document-tools': 'markdown-editor',
};

const DEFAULT_TAB = 'markdown-editor';

export function DocumentSuite() {
  const pathname = usePathname();
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';
  const resolved = SLUG_ALIASES[slug] ?? slug;
  const activeTab = TABS.find((t) => t.slug === resolved)?.slug ?? DEFAULT_TAB;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        window.history.replaceState(null, '', `/tools/${value}/`);
      }}
    >
      <TabsList className="grid grid-cols-3 h-auto gap-1 p-1">
        {TABS.map((t) => (
          <TabsTrigger key={t.slug} value={t.slug} className="text-xs sm:text-sm">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.slug} value={t.slug}>
          <t.Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}

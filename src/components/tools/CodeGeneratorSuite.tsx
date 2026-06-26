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

const CurlConverter = dynamic(() => import('./CurlConverter').then((m) => ({ default: m.CurlConverter })), { ssr: false, loading: () => loadingEl });
const JsonToTypescript = dynamic(() => import('./JsonToTypescript').then((m) => ({ default: m.JsonToTypescript })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'curl-to-code', label: 'cURL → Code', Component: CurlConverter },
  { slug: 'json-to-code', label: 'JSON → Code', Component: JsonToTypescript },
] as const;

/** Old slugs that map to the renamed tab */
const SLUG_ALIASES: Record<string, string> = {
  'json-to-typescript': 'json-to-code',
};

const DEFAULT_TAB = 'curl-to-code';

export function CodeGeneratorSuite() {
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
      <TabsList className="grid grid-cols-2 h-auto gap-1 p-1">
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

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

const UrlEncoder = dynamic(() => import('./UrlEncoder').then((m) => ({ default: m.UrlEncoder })), { ssr: false, loading: () => loadingEl });
const UrlParserBuilder = dynamic(() => import('./UrlParserBuilder').then((m) => ({ default: m.UrlParserBuilder })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'url-encoder', label: 'Encode / Decode', Component: UrlEncoder },
  { slug: 'url-parser-builder', label: 'Parse & Build', Component: UrlParserBuilder },
] as const;

const DEFAULT_TAB = 'url-encoder';

export function UrlSuite() {
  const pathname = usePathname();
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';
  const activeTab = TABS.find((t) => t.slug === slug)?.slug ?? DEFAULT_TAB;

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

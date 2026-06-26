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

const CaseConverter = dynamic(() => import('./CaseConverter').then((m) => ({ default: m.CaseConverter })), { ssr: false, loading: () => loadingEl });
const WordCounter = dynamic(() => import('./WordCounter').then((m) => ({ default: m.WordCounter })), { ssr: false, loading: () => loadingEl });
const FindAndReplace = dynamic(() => import('./FindAndReplace').then((m) => ({ default: m.FindAndReplace })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'case-converter', label: 'Case Convert', Component: CaseConverter },
  { slug: 'word-counter', label: 'Word Count', Component: WordCounter },
  { slug: 'find-replace', label: 'Find & Replace', Component: FindAndReplace },
] as const;

const DEFAULT_TAB = 'case-converter';

export function TextUtilSuite() {
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

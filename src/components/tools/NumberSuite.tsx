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

const NumberBaseConverter = dynamic(() => import('./NumberBaseConverter').then((m) => ({ default: m.NumberBaseConverter })), { ssr: false, loading: () => loadingEl });
const RomanNumeralConverter = dynamic(() => import('./RomanNumeralConverter').then((m) => ({ default: m.RomanNumeralConverter })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'number-base-converter', label: 'Base Converter', Component: NumberBaseConverter },
  { slug: 'roman-numeral-converter', label: 'Roman Numerals', Component: RomanNumeralConverter },
] as const;

const DEFAULT_TAB = 'number-base-converter';

export function NumberSuite() {
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

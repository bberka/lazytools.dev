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

const TimestampConverter = dynamic(() => import('./TimestampConverter').then((m) => ({ default: m.TimestampConverter })), { ssr: false, loading: () => loadingEl });
const TimezoneConverter = dynamic(() => import('./TimezoneConverter').then((m) => ({ default: m.TimezoneConverter })), { ssr: false, loading: () => loadingEl });
const AgeCalculator = dynamic(() => import('./AgeCalculator').then((m) => ({ default: m.AgeCalculator })), { ssr: false, loading: () => loadingEl });
const DateDifferenceCalculator = dynamic(() => import('./DateDifferenceCalculator').then((m) => ({ default: m.DateDifferenceCalculator })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'timestamp-converter', label: 'Timestamp', Component: TimestampConverter },
  { slug: 'timezone-converter', label: 'Timezone', Component: TimezoneConverter },
  { slug: 'age-calculator', label: 'Age', Component: AgeCalculator },
  { slug: 'date-difference-calculator', label: 'Date Diff', Component: DateDifferenceCalculator },
] as const;

const DEFAULT_TAB = 'timestamp-converter';

export function DateTimeSuite() {
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
      <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
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

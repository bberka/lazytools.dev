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

const UuidGenerator = dynamic(() => import('./UuidGenerator').then((m) => ({ default: m.UuidGenerator })), { ssr: false, loading: () => loadingEl });
const SnowflakeGenerator = dynamic(() => import('./SnowflakeGenerator').then((m) => ({ default: m.SnowflakeGenerator })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'uuid-generator', label: 'UUID', Component: UuidGenerator },
  { slug: 'snowflake-id-generator', label: 'Snowflake', Component: SnowflakeGenerator },
] as const;

const DEFAULT_TAB = 'uuid-generator';

export function IdGeneratorSuite() {
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

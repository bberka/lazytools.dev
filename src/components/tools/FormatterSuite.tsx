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

const JsonFormatter = dynamic(() => import('./JsonFormatter').then((m) => ({ default: m.JsonFormatter })), { ssr: false, loading: () => loadingEl });
const YamlValidator = dynamic(() => import('./YamlValidator').then((m) => ({ default: m.YamlValidator })), { ssr: false, loading: () => loadingEl });
const XmlFormatter = dynamic(() => import('./XmlFormatter').then((m) => ({ default: m.XmlFormatter })), { ssr: false, loading: () => loadingEl });
const SqlFormatter = dynamic(() => import('./SqlFormatter').then((m) => ({ default: m.SqlFormatter })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'json-formatter', label: 'JSON', Component: JsonFormatter },
  { slug: 'yaml-validator', label: 'YAML', Component: YamlValidator },
  { slug: 'xml-formatter', label: 'XML', Component: XmlFormatter },
  { slug: 'sql-formatter', label: 'SQL', Component: SqlFormatter },
] as const;

const SLUG_ALIASES: Record<string, string> = {
  'json-validator': 'json-formatter',
  'xml-validator': 'xml-formatter',
  'data-formatter': 'json-formatter',
};

const DEFAULT_TAB = 'json-formatter';

export function FormatterSuite() {
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
      <TabsList className="grid grid-cols-4 h-auto gap-1 p-1">
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

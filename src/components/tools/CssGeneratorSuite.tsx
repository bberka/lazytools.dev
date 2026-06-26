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

const GlassmorphismGenerator = dynamic(() => import('./GlassmorphismGenerator').then((m) => ({ default: m.GlassmorphismGenerator })), { ssr: false, loading: () => loadingEl });
const BoxShadowVisualizer = dynamic(() => import('./BoxShadowVisualizer').then((m) => ({ default: m.BoxShadowVisualizer })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'glassmorphism-generator', label: 'Glassmorphism', Component: GlassmorphismGenerator },
  { slug: 'box-shadow-generator', label: 'Box Shadow', Component: BoxShadowVisualizer },
] as const;

const DEFAULT_TAB = 'glassmorphism-generator';

export function CssGeneratorSuite() {
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

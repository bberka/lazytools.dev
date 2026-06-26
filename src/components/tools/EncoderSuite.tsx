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

const Base64Converter = dynamic(() => import('./Base64Converter').then((m) => ({ default: m.Base64Converter })), { ssr: false, loading: () => loadingEl });
const HexConverter = dynamic(() => import('./HexConverter').then((m) => ({ default: m.HexConverter })), { ssr: false, loading: () => loadingEl });
const HtmlEncoder = dynamic(() => import('./HtmlEncoder').then((m) => ({ default: m.HtmlEncoder })), { ssr: false, loading: () => loadingEl });
const TextEscape = dynamic(() => import('./TextEscape').then((m) => ({ default: m.TextEscape })), { ssr: false, loading: () => loadingEl });
const PunycodeConverter = dynamic(() => import('./PunycodeConverter').then((m) => ({ default: m.PunycodeConverter })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'base64-converter', label: 'Base64', Component: Base64Converter },
  { slug: 'hex-converter', label: 'Hex', Component: HexConverter },
  { slug: 'html-encoder', label: 'HTML Entities', Component: HtmlEncoder },
  { slug: 'text-escape', label: 'Escape', Component: TextEscape },
  { slug: 'punycode-converter', label: 'Punycode', Component: PunycodeConverter },
] as const;

const DEFAULT_TAB = 'base64-converter';

export function EncoderSuite() {
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
      <TabsList className="grid grid-cols-3 sm:grid-cols-5 h-auto gap-1 p-1">
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

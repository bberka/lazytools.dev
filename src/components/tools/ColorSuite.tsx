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

const ColorPicker = dynamic(() => import('./ColorPicker').then((m) => ({ default: m.ColorPicker })), { ssr: false, loading: () => loadingEl });
const ColorContrastChecker = dynamic(() => import('./ColorContrastChecker').then((m) => ({ default: m.ColorContrastChecker })), { ssr: false, loading: () => loadingEl });
const ColorPaletteExtractor = dynamic(() => import('./ColorPaletteExtractor').then((m) => ({ default: m.ColorPaletteExtractor })), { ssr: false, loading: () => loadingEl });
const ColorBlindnessSimulator = dynamic(() => import('./ColorBlindnessSimulator').then((m) => ({ default: m.ColorBlindnessSimulator })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'color-picker', label: 'Picker', Component: ColorPicker },
  { slug: 'color-contrast-checker', label: 'Contrast', Component: ColorContrastChecker },
  { slug: 'color-palette-extractor', label: 'Palette Extractor', Component: ColorPaletteExtractor },
  { slug: 'color-blindness-simulator', label: 'Blindness Sim', Component: ColorBlindnessSimulator },
] as const;

const DEFAULT_TAB = 'color-picker';

export function ColorSuite() {
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

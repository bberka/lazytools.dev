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

const ImageConverter = dynamic(() => import('./ImageConverter').then((m) => ({ default: m.ImageConverter })), { ssr: false, loading: () => loadingEl });
const SvgToPng = dynamic(() => import('./SvgToPng').then((m) => ({ default: m.SvgToPng })), { ssr: false, loading: () => loadingEl });
const ExifViewerRemover = dynamic(() => import('./ExifViewerRemover').then((m) => ({ default: m.ExifViewerRemover })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'image-converter', label: 'Convert & Edit', Component: ImageConverter },
  { slug: 'svg-to-png', label: 'SVG to PNG', Component: SvgToPng },
  { slug: 'exif-viewer-remover', label: 'EXIF / Metadata', Component: ExifViewerRemover },
] as const;

/** Old slugs whose features are now in Convert & Edit */
const SLUG_ALIASES: Record<string, string> = {
  'image-compressor': 'image-converter',
  'image-resizer': 'image-converter',
  'image-to-icon': 'image-converter',
  'image-cropper': 'image-converter',
  'image-tools': 'image-converter',
};

const DEFAULT_TAB = 'image-converter';

export function ImageSuite() {
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

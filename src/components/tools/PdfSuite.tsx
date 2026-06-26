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

const PdfToImage = dynamic(() => import('./PdfToImage').then((m) => ({ default: m.PdfToImage })), { ssr: false, loading: () => loadingEl });
const PdfToWord = dynamic(() => import('./PdfToWord').then((m) => ({ default: m.PdfToWord })), { ssr: false, loading: () => loadingEl });
const WordToPdf = dynamic(() => import('./WordToPdf').then((m) => ({ default: m.WordToPdf })), { ssr: false, loading: () => loadingEl });
const ImageToPdf = dynamic(() => import('./ImageToPdf').then((m) => ({ default: m.ImageToPdf })), { ssr: false, loading: () => loadingEl });
const PdfEditor = dynamic(() => import('./PdfEditor').then((m) => ({ default: m.PdfEditor })), { ssr: false, loading: () => loadingEl });
const PdfMerge = dynamic(() => import('./PdfMerge').then((m) => ({ default: m.PdfMerge })), { ssr: false, loading: () => loadingEl });
const PdfSplit = dynamic(() => import('./PdfSplit').then((m) => ({ default: m.PdfSplit })), { ssr: false, loading: () => loadingEl });
const PdfCompress = dynamic(() => import('./PdfCompress').then((m) => ({ default: m.PdfCompress })), { ssr: false, loading: () => loadingEl });
const PdfWatermark = dynamic(() => import('./PdfWatermark').then((m) => ({ default: m.PdfWatermark })), { ssr: false, loading: () => loadingEl });

/** Converter tabs: format conversions */
const CONVERTER_TABS = [
  { slug: 'pdf-to-image', label: 'To Image', Component: PdfToImage },
  { slug: 'pdf-to-word', label: 'To Word', Component: PdfToWord },
  { slug: 'word-to-pdf', label: 'From Word', Component: WordToPdf },
  { slug: 'image-to-pdf', label: 'From Image', Component: ImageToPdf },
] as const;

/** Editor tabs: document operations */
const EDITOR_TABS = [
  { slug: 'pdf-editor', label: 'Edit Pages', Component: PdfEditor },
  { slug: 'pdf-merge', label: 'Merge', Component: PdfMerge },
  { slug: 'pdf-split', label: 'Split', Component: PdfSplit },
  { slug: 'pdf-compress', label: 'Compress', Component: PdfCompress },
  { slug: 'pdf-watermark', label: 'Watermark', Component: PdfWatermark },
] as const;

const ALL_CONVERTER_SLUGS = new Set<string>(CONVERTER_TABS.map((t) => t.slug));
const ALL_EDITOR_SLUGS = new Set<string>(EDITOR_TABS.map((t) => t.slug));

export function PdfSuite() {
  const pathname = usePathname();
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';

  // Determine which page we're on
  if (ALL_EDITOR_SLUGS.has(slug)) {
    // PDF Editor page
    const activeTab = EDITOR_TABS.find((t) => t.slug === slug)?.slug ?? 'pdf-editor';
    return (
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          window.history.replaceState(null, '', `/tools/${value}/`);
        }}
      >
        <TabsList className="grid grid-cols-5 h-auto gap-1 p-1">
          {EDITOR_TABS.map((t) => (
            <TabsTrigger key={t.slug} value={t.slug} className="text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {EDITOR_TABS.map((t) => (
          <TabsContent key={t.slug} value={t.slug}>
            <t.Component />
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  // PDF Converter page (default)
  const activeTab = CONVERTER_TABS.find((t) => t.slug === slug)?.slug ?? 'pdf-to-image';
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        window.history.replaceState(null, '', `/tools/${value}/`);
      }}
    >
      <TabsList className="grid grid-cols-4 h-auto gap-1 p-1">
        {CONVERTER_TABS.map((t) => (
          <TabsTrigger key={t.slug} value={t.slug} className="text-xs sm:text-sm">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {CONVERTER_TABS.map((t) => (
        <TabsContent key={t.slug} value={t.slug}>
          <t.Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}

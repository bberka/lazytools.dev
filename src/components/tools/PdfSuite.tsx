'use client';

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const loadingEl = (
  <div role="status" aria-label="Loading tool" className="flex items-center justify-center py-6 sm:py-12">
    <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
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

interface PdfSuitePage {
  /** Full class literal: the grid needs one column per tab. */
  tabsListClassName: string;
  /** The first tab is the one shown when the slug names no tab. */
  tabs: readonly { slug: string; label: string; Component: ComponentType }[];
}

/** PDF Converter page: format conversions */
const CONVERTER_PAGE: PdfSuitePage = {
  tabsListClassName: 'grid grid-cols-4 h-auto gap-1 p-1',
  tabs: [
    { slug: 'pdf-to-image', label: 'To Image', Component: PdfToImage },
    { slug: 'pdf-to-word', label: 'To Word', Component: PdfToWord },
    { slug: 'word-to-pdf', label: 'From Word', Component: WordToPdf },
    { slug: 'image-to-pdf', label: 'From Image', Component: ImageToPdf },
  ],
};

/** PDF Editor page: document operations */
const EDITOR_PAGE: PdfSuitePage = {
  tabsListClassName: 'grid grid-cols-5 h-auto gap-1 p-1',
  tabs: [
    { slug: 'pdf-editor', label: 'Edit Pages', Component: PdfEditor },
    { slug: 'pdf-merge', label: 'Merge', Component: PdfMerge },
    { slug: 'pdf-split', label: 'Split', Component: PdfSplit },
    { slug: 'pdf-compress', label: 'Compress', Component: PdfCompress },
    { slug: 'pdf-watermark', label: 'Watermark', Component: PdfWatermark },
  ],
};

export function PdfSuite() {
  const pathname = usePathname();
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';

  // An editor slug opens the PDF Editor page; every other slug opens the PDF Converter page
  const page = EDITOR_PAGE.tabs.some((t) => t.slug === slug) ? EDITOR_PAGE : CONVERTER_PAGE;
  const activeTab = page.tabs.find((t) => t.slug === slug)?.slug ?? page.tabs[0].slug;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        window.history.replaceState(null, '', `/tools/${value}/`);
      }}
    >
      <TabsList className={page.tabsListClassName}>
        {page.tabs.map((t) => (
          <TabsTrigger key={t.slug} value={t.slug} className="text-xs sm:text-sm">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {page.tabs.map((t) => (
        <TabsContent key={t.slug} value={t.slug}>
          <t.Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}

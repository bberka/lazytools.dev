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

const TextToSpeech = dynamic(() => import('./TextToSpeech').then((m) => ({ default: m.TextToSpeech })), { ssr: false, loading: () => loadingEl });
const SpeechToText = dynamic(() => import('./SpeechToText').then((m) => ({ default: m.SpeechToText })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'text-to-speech', label: 'Text → Speech', Component: TextToSpeech },
  { slug: 'speech-to-text', label: 'Speech → Text', Component: SpeechToText },
] as const;

const DEFAULT_TAB = 'text-to-speech';

export function SpeechSuite() {
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

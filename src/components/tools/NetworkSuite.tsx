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

const IpLookup = dynamic(() => import('./IpLookup').then((m) => ({ default: m.IpLookup })), { ssr: false, loading: () => loadingEl });
const DnsLookup = dynamic(() => import('./DnsLookup').then((m) => ({ default: m.DnsLookup })), { ssr: false, loading: () => loadingEl });
const SubnetCalculator = dynamic(() => import('./SubnetCalculator').then((m) => ({ default: m.SubnetCalculator })), { ssr: false, loading: () => loadingEl });
const PortChecker = dynamic(() => import('./PortChecker').then((m) => ({ default: m.PortChecker })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'ip-lookup', label: 'IP Lookup', Component: IpLookup },
  { slug: 'dns-lookup', label: 'DNS Lookup', Component: DnsLookup },
  { slug: 'subnet-calculator', label: 'Subnet Calc', Component: SubnetCalculator },
  { slug: 'port-checker', label: 'Port Scanner', Component: PortChecker },
] as const;

const DEFAULT_TAB = 'ip-lookup';

export function NetworkSuite() {
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

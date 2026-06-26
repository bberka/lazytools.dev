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

const HashGenerator = dynamic(() => import('./HashGenerator').then((m) => ({ default: m.HashGenerator })), { ssr: false, loading: () => loadingEl });
const PasswordHasher = dynamic(() => import('./PasswordHasher').then((m) => ({ default: m.PasswordHasher })), { ssr: false, loading: () => loadingEl });
const AesEncryption = dynamic(() => import('./AesEncryption').then((m) => ({ default: m.AesEncryption })), { ssr: false, loading: () => loadingEl });
const RsaKeyGenerator = dynamic(() => import('./RsaKeyGenerator').then((m) => ({ default: m.RsaKeyGenerator })), { ssr: false, loading: () => loadingEl });
const CertificateDecoder = dynamic(() => import('./CertificateDecoder').then((m) => ({ default: m.CertificateDecoder })), { ssr: false, loading: () => loadingEl });

const TABS = [
  { slug: 'hash-generator', label: 'Hash', Component: HashGenerator },
  { slug: 'password-hasher', label: 'Password Hash', Component: PasswordHasher },
  { slug: 'aes-encryption', label: 'AES Encrypt', Component: AesEncryption },
  { slug: 'rsa-key-generator', label: 'RSA Keys', Component: RsaKeyGenerator },
  { slug: 'certificate-decoder', label: 'Cert Decoder', Component: CertificateDecoder },
] as const;

const SLUG_ALIASES: Record<string, string> = {
  'bcrypt-hasher': 'password-hasher',
  'security-tools': 'hash-generator',
};

const DEFAULT_TAB = 'hash-generator';

export function SecuritySuite() {
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

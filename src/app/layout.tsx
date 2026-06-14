import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import { Providers } from './providers';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { CommandPalette } from '@/components/CommandPalette';
import { PWARegister } from '@/components/PWARegister';
import { MainLayout } from '@/components/MainLayout';
import { TauriWindowHandler } from '@/components/TauriWindowHandler';
import '@/styles/globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: {
    template: '%s | LazyTools',
    default: 'LazyTools - Developer Utilities Collection',
  },
  description:
    'A comprehensive collection of developer tools for everyday tasks including converters, formatters, generators, and more.',
  keywords: [
    'developer tools',
    'base64 encoder',
    'json formatter',
    'uuid generator',
    'hash generator',
    'regex tester',
    'color converter',
    'markdown previewer',
    'jwt decoder',
    'url encoder',
    'password generator',
  ],
  authors: [{ name: 'bberka', url: 'https://github.com/bberka' }],
  creator: 'bberka',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/app-icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'LazyTools',
    statusBarStyle: 'black-translucent',
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://lazytools.dev'
  ),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'LazyTools - Developer Utilities Collection',
    description:
      'A comprehensive collection of developer tools for everyday tasks',
    siteName: 'LazyTools',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LazyTools - Developer Utilities Collection',
    description:
      'A comprehensive collection of developer tools for everyday tasks',
    creator: '@bberka',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <head>
        {/* Prevent theme flicker - must run before page renders */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('dev-toolbox:theme') ||
                    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                  localStorage.setItem('dev-toolbox:theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>
          <TauriWindowHandler />
          <PWARegister />
          <div className="min-h-screen overflow-x-clip bg-background">
            <Header />
            <MainLayout>{children}</MainLayout>
            <Footer />
            <CommandPalette />
          </div>
        </Providers>
      </body>
    </html>
  );
}

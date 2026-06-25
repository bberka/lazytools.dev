import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import Script from 'next/script';
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
    default: 'LazyTools - Free Online Web Tools & Utilities',
  },
  description:
    'A comprehensive, privacy-first collection of free online tools and utilities for everyday tasks. Convert files, edit text, process PDFs, format data, generate values, and calculate metrics — all running 100% client-side in your browser.',
  keywords: [
    'online tools',
    'web utilities',
    'free online tools',
    'pdf tools',
    'image tools',
    'text tools',
    'data formatting',
    'productivity tools',
    'calculator tools',
    'privacy first tools',
    'offline web tools',
    'developer tools',
    'base64 encoder',
    'json formatter',
    'uuid generator',
    'regex tester',
    'markdown editor',
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
    title: 'LazyTools - Free Online Web Tools & Utilities',
    description:
      'A comprehensive, privacy-first collection of free online tools and utilities for everyday tasks. Everything runs locally in your browser.',
    siteName: 'LazyTools',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LazyTools - Free Online Web Tools & Utilities',
    description:
      'A comprehensive, privacy-first collection of free online tools and utilities for everyday tasks. Everything runs locally in your browser.',
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
      <head />
      <body>
        {/* Prevent theme flicker - must run before page renders */}
        <Script
          id="theme-preloader"
          strategy="beforeInteractive"
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

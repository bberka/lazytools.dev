'use client';

import { useSettings } from '@/lib/contexts/SettingsContext';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { fullWidth } = useSettings();

  return (
    <main
      className={cn(
        fullWidth ? 'w-full max-w-none px-4 sm:px-6 lg:px-8' : 'container',
        'py-3 sm:py-6 lg:py-8'
      )}
    >
      {children}
    </main>
  );
}

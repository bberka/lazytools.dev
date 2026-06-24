'use client';

import { useSettings } from '@/lib/contexts/SettingsContext';
import { motion } from 'framer-motion';

export function HomeIntro() {
  const { compactMode } = useSettings();

  return (
    <div className="space-y-4 text-center sm:space-y-6 py-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary backdrop-blur"
      >
        <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <span>100% Client-Side & Secure</span>
      </motion.div>

      <div className="space-y-2 sm:space-y-3">
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
        >
          <span className="bg-gradient-to-r from-primary via-purple-500 to-indigo-500 bg-clip-text text-transparent dark:from-primary dark:via-purple-400 dark:to-indigo-400">
            LazyTools
          </span>
          <span className="text-foreground"> Collection</span>
        </motion.h1>

        {!compactMode && (
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg lg:text-xl font-normal leading-relaxed"
          >
            A comprehensive collection of secure, browser-based utilities and developer tools.
            Everything runs locally in your browser, keeping your data entirely offline and safe.
          </motion.p>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Monitor, Smartphone, Download, Plus, Info, ExternalLink } from 'lucide-react';

interface InstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstallDialog({ isOpen, onClose }: InstallDialogProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px] p-6 gap-6 border-border/40 bg-background/95 backdrop-blur-md">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-bold tracking-tight text-center sm:text-left bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            Install LazyTools
          </DialogTitle>
          <DialogDescription className="text-center sm:text-left text-muted-foreground text-sm">
            Choose how you want to run LazyTools. Both options run completely offline and keep your data private in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
          {/* Native Desktop Option */}
          <div className="group relative flex flex-col justify-between p-5 rounded-xl border border-border/50 bg-card/30 hover:bg-accent/10 hover:border-primary/40 transition-all duration-300 shadow-sm hover:shadow-md">
            <div className="space-y-3">
              <div className="inline-flex p-2.5 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                <Monitor className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors duration-300">
                  Full Desktop App
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed mt-1.5">
                  Install the native app for Windows, macOS, or Linux. Ideal for standalone execution, native performance, and quick taskbar access.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-2">
              <Button
                asChild
                className="w-full gap-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-medium text-xs py-2 shadow-sm"
              >
                <a
                  href="https://github.com/bberka/lazytools.dev/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download App
                  <ExternalLink className="h-3 w-3 opacity-60 ml-0.5" />
                </a>
              </Button>
            </div>
          </div>

          {/* PWA Option */}
          <div className="group relative flex flex-col justify-between p-5 rounded-xl border border-border/50 bg-card/30 hover:bg-accent/10 hover:border-purple-500/40 transition-all duration-300 shadow-sm hover:shadow-md">
            <div className="space-y-3">
              <div className="inline-flex p-2.5 rounded-lg bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform duration-300">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base group-hover:text-purple-500 transition-colors duration-300">
                  Web App (PWA)
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed mt-1.5">
                  Install directly from your browser. Adds a home screen icon and opens in a standalone window without large downloads.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-2">
              {isInstallable ? (
                <Button
                  onClick={handleInstallPWA}
                  className="w-full gap-2 rounded-lg bg-purple-600 hover:bg-purple-600/90 text-white font-medium text-xs py-2 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Install Web App
                </Button>
              ) : (
                <div className="rounded-lg bg-muted/60 p-2.5 border border-border/30">
                  <div className="flex gap-2 items-start text-[11px] text-muted-foreground leading-snug">
                    <Info className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span>
                      To install: tap your browser's menu (or <span className="font-semibold text-foreground">Share</span> on iOS Safari) and select <span className="font-semibold text-foreground">Add to Home Screen</span>.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

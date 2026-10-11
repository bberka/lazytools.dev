'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import { downloadText } from '@/lib/files';
import {
  COMPOSE_YAML_OPTIONS,
  EXAMPLE_DOCKER_RUN,
  convertDockerRun,
} from '@/lib/tools/docker-run-to-compose';
import {
  AlertTriangle,
  Check,
  Container,
  Copy,
  Download,
  FileCode,
  Info,
  Trash2,
  Wand2,
} from 'lucide-react';

type YamlModule = typeof import('js-yaml');

const PLACEHOLDER = `docker run -d \\
  --name web \\
  -p 8080:80 \\
  -v web_data:/data \\
  nginx:latest`;

export function DockerRunToCompose() {
  const [input, setInput] = useState('');
  const [yamlModule, setYamlModule] = useState<YamlModule | null>(null);
  const [yamlLoadFailed, setYamlLoadFailed] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const hasInput = input.trim() !== '';

  // js-yaml is only needed once there is something to convert, so it loads on first input.
  useEffect(() => {
    if (!hasInput || yamlModule) return;
    let cancelled = false;
    import('js-yaml')
      .then((module) => {
        if (!cancelled) setYamlModule(module);
      })
      .catch(() => {
        if (!cancelled) setYamlLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasInput, yamlModule]);

  const result = useMemo(() => (hasInput ? convertDockerRun(input) : null), [hasInput, input]);

  const yamlText = useMemo(() => {
    if (!result || !result.ok || !yamlModule) return '';
    return yamlModule.dump(result.compose, COMPOSE_YAML_OPTIONS);
  }, [result, yamlModule]);

  const handleDownload = () => {
    if (!yamlText) return;
    try {
      downloadText(yamlText, 'docker-compose.yml', 'text/yaml;charset=utf-8');
      toast.success('docker-compose.yml downloaded');
    } catch {
      toast.error('Could not download the file');
    }
  };

  const warnings = result?.ok ? result.warnings : [];
  const notes = result?.ok ? result.notes : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Input */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Container className="h-5 w-5 text-primary" />
              docker run command
            </CardTitle>
            <CardDescription>
              Paste a command with backslash line breaks, quotes and combined flags like -dit.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              aria-label="docker run command"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={14}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="flex-1 resize-y bg-background font-mono text-xs leading-relaxed"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setInput(EXAMPLE_DOCKER_RUN)} variant="outline" size="sm">
                <Wand2 className="mr-2 h-4 w-4" />
                Load example
              </Button>
              <Button
                onClick={() => setInput('')}
                variant="outline"
                size="sm"
                disabled={!input}
                className="transition-colors duration-200 hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Output */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <FileCode className="h-5 w-5 text-primary" />
              docker-compose.yml
            </CardTitle>
            <CardDescription>
              {result?.ok
                ? `One service, "${result.serviceName}", ready to save as docker-compose.yml.`
                : 'The Compose file appears here as you type.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            {!result && (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground sm:py-12">
                Paste a docker run command, or load the example, to see the Compose file.
              </div>
            )}

            {result && !result.ok && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>Cannot convert this command.</strong> {result.error}
                </div>
              </div>
            )}

            {result?.ok && (
              <>
                {yamlLoadFailed && !yamlText ? (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>Could not load the YAML writer. Check your connection and try again.</div>
                  </div>
                ) : (
                  <Textarea
                    aria-label="Generated docker-compose.yml"
                    readOnly
                    value={yamlText}
                    placeholder="Preparing the YAML..."
                    rows={14}
                    spellCheck={false}
                    className="flex-1 resize-y cursor-text border-muted bg-muted/20 font-mono text-xs leading-relaxed focus-visible:ring-0"
                  />
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => copyToClipboard(yamlText)}
                    disabled={!yamlText}
                    size="sm"
                    variant={isCopied ? 'default' : 'outline'}
                    className="font-medium transition-all duration-200"
                  >
                    {isCopied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy YAML
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleDownload}
                    disabled={!yamlText}
                    size="sm"
                    variant="outline"
                    className="font-medium"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download docker-compose.yml
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {warnings.length > 0 && (
        <section
          aria-label="Warnings"
          className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Warnings ({warnings.length})
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-xs">
            {warnings.map((warning) => (
              <li key={warning} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section aria-label="Notes" className="rounded-lg border bg-muted/30 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
            Notes ({notes.length})
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-xs text-muted-foreground">
            {notes.map((message) => (
              <li key={message} className="break-words">
                {message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        The conversion runs entirely in your browser. Your command, including any passwords in it, is
        never sent anywhere.
      </p>
    </div>
  );
}

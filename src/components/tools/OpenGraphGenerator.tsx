'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { CircleAlert, Code2, ImageIcon, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  checkFields,
  DESCRIPTION_LIMIT,
  displayHost,
  EMPTY_OG_FIELDS,
  generateMetaTags,
  lengthHint,
  OG_TYPES,
  TITLE_LIMIT,
  TWITTER_CARDS,
  type OgType,
  type OpenGraphFields,
  type TwitterCard,
} from '@/lib/tools/open-graph-generator';
import { CopyValueButton } from './CopyValueButton';

const TWITTER_CARD_LABELS: Record<TwitterCard, string> = {
  summary: 'Summary (small image)',
  summary_large_image: 'Summary with large image',
};

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

function CountHint({ value, limit, what }: { value: string; limit: number; what: string }) {
  const hint = lengthHint(value, limit);
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        hint.state === 'over' ? 'font-medium text-destructive' : 'text-muted-foreground'
      )}
      aria-label={`${what} length`}
    >
      {hint.count} / {hint.limit}
      {hint.state === 'over' ? ` (${hint.count - hint.limit} over, may be cut off)` : ''}
    </span>
  );
}

export function OpenGraphGenerator() {
  const [fields, setFields] = useState<OpenGraphFields>(EMPTY_OG_FIELDS);
  const [loadImage, setLoadImage] = useState(false);
  // The image URL that failed to load, so a changed URL gets a fresh try.
  const [failedImage, setFailedImage] = useState('');

  const set = <K extends keyof OpenGraphFields>(key: K, value: OpenGraphFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  const tags = useMemo(() => generateMetaTags(fields), [fields]);
  const warnings = useMemo(() => checkFields(fields), [fields]);
  const isBlank = JSON.stringify(fields) === JSON.stringify(EMPTY_OG_FIELDS);

  const image = fields.image.trim();
  const showImage =
    loadImage && image !== '' && failedImage !== image && /^https?:\/\//i.test(image);
  const large = fields.twitterCard === 'summary_large_image';
  const host = displayHost(fields.url) || fields.siteName.trim();

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Page details
            </CardTitle>
            <CardDescription>The tags are written as you type.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              id="og-title"
              label="Title"
              hint={<CountHint value={fields.title} limit={TITLE_LIMIT} what="Title" />}
            >
              <Input
                id="og-title"
                value={fields.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="My page title"
              />
            </Field>
            <Field
              id="og-description"
              label="Description"
              hint={
                <CountHint
                  value={fields.description}
                  limit={DESCRIPTION_LIMIT}
                  what="Description"
                />
              }
            >
              <Textarea
                id="og-description"
                value={fields.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
                placeholder="One or two sentences about the page."
              />
            </Field>
            <Field id="og-url" label="Page URL">
              <Input
                id="og-url"
                value={fields.url}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://example.com/page"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <Field id="og-image" label="Image URL">
              <Input
                id="og-image"
                value={fields.image}
                onChange={(e) => set('image', e.target.value)}
                placeholder="https://example.com/og.png (1200 x 630 works well)"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <Field id="og-image-alt" label="Image alt text">
              <Input
                id="og-image-alt"
                value={fields.imageAlt}
                onChange={(e) => set('imageAlt', e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="og-site-name" label="Site name">
                <Input
                  id="og-site-name"
                  value={fields.siteName}
                  onChange={(e) => set('siteName', e.target.value)}
                />
              </Field>
              <Field id="og-locale" label="Locale">
                <Input
                  id="og-locale"
                  value={fields.locale}
                  onChange={(e) => set('locale', e.target.value)}
                  placeholder="en_US"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field id="og-type" label="Type">
                <Select value={fields.type} onValueChange={(value) => set('type', value as OgType)}>
                  <SelectTrigger id="og-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OG_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="og-twitter-card" label="Twitter card">
                <Select
                  value={fields.twitterCard}
                  onValueChange={(value) => set('twitterCard', value as TwitterCard)}
                >
                  <SelectTrigger id="og-twitter-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TWITTER_CARDS.map((card) => (
                      <SelectItem key={card} value={card}>
                        {TWITTER_CARD_LABELS[card]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="og-twitter-site" label="Twitter site handle">
                <Input
                  id="og-twitter-site"
                  value={fields.twitterSite}
                  onChange={(e) => set('twitterSite', e.target.value)}
                  placeholder="@yoursite"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field id="og-twitter-creator" label="Twitter creator handle">
                <Input
                  id="og-twitter-creator"
                  value={fields.twitterCreator}
                  onChange={(e) => set('twitterCreator', e.target.value)}
                  placeholder="@author"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFields(EMPTY_OG_FIELDS)}
              disabled={isBlank}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              Meta tags
            </CardTitle>
            <CardDescription>Paste these inside the &lt;head&gt; of the page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              readOnly
              value={tags}
              aria-label="Generated meta tags"
              rows={Math.min(Math.max(tags.split('\n').length, 4), 14)}
              className="font-mono text-xs sm:text-sm"
              wrap="off"
            />
            <div className="flex flex-wrap gap-2">
              <CopyValueButton text={tags} label="Copy tags" showLabel />
            </div>
            {warnings.length > 0 && (
              <ul aria-label="Warnings" className="space-y-1">
                {warnings.map((warning) => (
                  <li
                    key={warning}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground sm:text-sm"
                  >
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              A rough idea of a shared link. Each site draws it a little differently.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              data-testid="og-preview"
              className={cn(
                'overflow-hidden rounded-xl border bg-card text-card-foreground',
                !large && 'flex'
              )}
            >
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground',
                  large ? 'aspect-[1.91/1] w-full' : 'aspect-square w-24 sm:w-32'
                )}
              >
                {showImage ? (
                  <img
                    src={image}
                    alt={fields.imageAlt}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImage(image)}
                  />
                ) : (
                  <ImageIcon className="h-8 w-8" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5 p-3">
                {host && (
                  <div className="truncate text-xs uppercase text-muted-foreground">{host}</div>
                )}
                <div className="line-clamp-2 break-words text-sm font-semibold">
                  {fields.title.trim() || 'Your page title'}
                </div>
                <div className="line-clamp-2 break-words text-xs text-muted-foreground">
                  {fields.description.trim() || 'Your description appears here.'}
                </div>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <label htmlFor="og-load-image" className="text-sm font-medium">
                  Load the image in the preview
                </label>
                <p className="text-xs text-muted-foreground">
                  Off by default: turning it on makes your browser request the image URL from its
                  server.
                </p>
              </div>
              <Switch id="og-load-image" checked={loadImage} onCheckedChange={setLoadImage} />
            </div>
            {loadImage && image !== '' && failedImage === image && (
              <p className="text-xs text-destructive">
                The image could not be loaded from that URL.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

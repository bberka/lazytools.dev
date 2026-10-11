'use client';

import { useState, useMemo, useRef, useId } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Check, Trash2, Plus, RefreshCw, ExternalLink, Link2, Code, ArrowRight } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { decodeUrlComponent, encodeUrlComponent } from '@/lib/tools/url-encoder';
import { buildUrl, parseUrl } from '@/lib/tools/url-parser-builder';

interface QueryParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface FormState {
  protocol: string;
  host: string;
  path: string;
  hash: string;
  params: QueryParam[];
}

const EMPTY_FORM: FormState = { protocol: 'https:', host: '', path: '', hash: '', params: [] };

export function UrlParserBuilder() {
  const [rawInput, setRawInput] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const nextParamId = useRef(0);

  const copyResult = useCopyToClipboard();

  const protocolId = useId();
  const hostId = useId();
  const pathId = useId();
  const hashId = useId();

  const rebuiltUrl = useMemo(() => buildUrl(form), [form]);
  const canOpen = /^https?:\/\//i.test(rebuiltUrl);

  const newParamId = () => `param-${nextParamId.current++}`;

  // Typing in the source field sets the parts below it.
  const handleRawInputChange = (value: string) => {
    setRawInput(value);
    if (!value.trim()) {
      setForm(EMPTY_FORM);
      return;
    }

    const parsed = parseUrl(value);
    setForm({
      // An address without a scheme is taken to be https, as the rebuilt URL will be.
      protocol: parsed.protocol || (parsed.host ? 'https:' : ''),
      host: parsed.host,
      path: parsed.path,
      hash: parsed.hash,
      params: parsed.params.map((param) => ({
        id: newParamId(),
        key: param.key,
        value: param.value,
        enabled: true,
      })),
    });
  };

  // Editing a part rewrites the source field with the rebuilt URL.
  const updateForm = (changes: Partial<FormState>) => {
    const next = { ...form, ...changes };
    setForm(next);
    setRawInput(buildUrl(next));
  };

  const addParamRow = () => {
    updateForm({ params: [...form.params, { id: newParamId(), key: '', value: '', enabled: true }] });
  };

  const updateParamRow = (id: string, changes: Partial<Omit<QueryParam, 'id'>>) => {
    updateForm({ params: form.params.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
  };

  const deleteParamRow = (id: string) => {
    updateForm({ params: form.params.filter((p) => p.id !== id) });
  };

  const urlEncodeField = (param: QueryParam, field: 'key' | 'value') => {
    try {
      const encoded = encodeUrlComponent(param[field]);
      updateParamRow(param.id, field === 'key' ? { key: encoded } : { value: encoded });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'This text cannot be URL-encoded.');
    }
  };

  const urlDecodeParam = (param: QueryParam) => {
    try {
      updateParamRow(param.id, {
        key: decodeUrlComponent(param.key),
        value: decodeUrlComponent(param.value),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'This parameter is not valid percent-encoding.');
    }
  };

  const handleClear = () => {
    setRawInput('');
    setForm(EMPTY_FORM);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Raw Input Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Paste Source URL
          </CardTitle>
          <CardDescription>
            Input an absolute or relative URL to parse its path components and parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            aria-label="Source URL"
            value={rawInput}
            onChange={(e) => handleRawInputChange(e.target.value)}
            placeholder="e.g., https://example.com/api/search?q=query&limit=10#results"
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleClear} variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Path Components breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            URL Base Structure
          </CardTitle>
          <CardDescription className="text-xs">
            Edit the protocol, host, and path details directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label
              htmlFor={protocolId}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1"
            >
              Protocol
            </label>
            <Input
              id={protocolId}
              value={form.protocol}
              onChange={(e) => updateForm({ protocol: e.target.value })}
              placeholder="e.g., https:"
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label
              htmlFor={hostId}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1"
            >
              Host / Domain
            </label>
            <Input
              id={hostId}
              value={form.host}
              onChange={(e) => updateForm({ host: e.target.value })}
              placeholder="e.g., example.com"
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label
              htmlFor={pathId}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1"
            >
              Path
            </label>
            <Input
              id={pathId}
              value={form.path}
              onChange={(e) => updateForm({ path: e.target.value })}
              placeholder="e.g., /search"
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label
              htmlFor={hashId}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1"
            >
              Hash / Anchor
            </label>
            <Input
              id={hashId}
              value={form.hash}
              onChange={(e) => updateForm({ hash: e.target.value })}
              placeholder="e.g., #results"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Query Parameters Grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Query Parameters ({form.params.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Configure, enable, or encode specific parameters.
            </CardDescription>
          </div>
          <Button onClick={addParamRow} size="sm" className="h-8 gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            Add Param
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 border-t">
          {form.params.length === 0 ? (
            <div className="text-center py-4 sm:py-6 text-sm text-muted-foreground italic">
              No query parameters found. Click Add Param to create one.
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
              {form.params.map((param) => (
                <div key={param.id} className="flex flex-col gap-2 p-3 border rounded-md bg-muted/20 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 shrink-0">
                    <Checkbox
                      checked={param.enabled}
                      onCheckedChange={(checked) => updateParamRow(param.id, { enabled: checked })}
                      aria-label="Enable parameter"
                    />
                    <span className="text-xs text-muted-foreground sm:hidden font-medium">Active</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 flex-1 sm:grid-cols-2">
                    <div className="flex gap-1.5 items-center">
                      <Input
                        value={param.key}
                        onChange={(e) => updateParamRow(param.id, { key: e.target.value })}
                        placeholder="Key"
                        aria-label="Parameter key"
                        className="font-mono text-xs h-8 flex-1"
                        disabled={!param.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => urlEncodeField(param, 'key')}
                        className="h-7 w-7 text-muted-foreground"
                        title="URL Encode Key"
                        aria-label="URL Encode Key"
                        disabled={!param.enabled || !param.key}
                      >
                        <Code className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="flex gap-1.5 items-center">
                      <Input
                        value={param.value}
                        onChange={(e) => updateParamRow(param.id, { value: e.target.value })}
                        placeholder="Value"
                        aria-label="Parameter value"
                        className="font-mono text-xs h-8 flex-1"
                        disabled={!param.enabled}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => urlEncodeField(param, 'value')}
                        className="h-7 w-7 text-muted-foreground"
                        title="URL Encode Value"
                        aria-label="URL Encode Value"
                        disabled={!param.enabled || !param.value}
                      >
                        <Code className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 justify-end mt-1 sm:mt-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => urlDecodeParam(param)}
                      className="h-8 w-8 text-muted-foreground"
                      title="URL Decode Key/Value"
                      aria-label="URL Decode Key/Value"
                      disabled={!param.enabled}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteParamRow(param.id)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      title="Delete Parameter"
                      aria-label="Delete Parameter"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Output Rebuilt URL */}
      {rebuiltUrl && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-primary" />
              Rebuilt Output URL
            </CardTitle>
            <CardDescription>
              Dynamic, real-time URL reconstructed from base components and active parameters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-md bg-background border font-mono text-sm break-all select-all">
              {rebuiltUrl}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => copyResult.copyToClipboard(rebuiltUrl)}
                variant={copyResult.isCopied ? 'default' : 'outline'}
                size="sm"
                className="min-h-11 sm:min-h-9"
              >
                {copyResult.isCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied URL!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy URL
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={() => window.open(rebuiltUrl, '_blank', 'noopener,noreferrer')}
                disabled={!canOpen}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Link
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

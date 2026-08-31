'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileSearch,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/hooks';
import {
  analyzeResumeText,
  RESUME_LANGUAGE_OPTIONS,
  type LanguageSelection,
  type ResumeAnalysis,
  type ResumeLanguage,
} from '@/lib/utils/resume-ats-analyzer';

type PdfTextExtractor = {
  getDocument: (source: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (page: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>;
        }>;
      }>;
    }>;
  };
  GlobalWorkerOptions: { workerSrc: string };
};

async function extractPdfText(file: File) {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfTextExtractor;

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    let currentLine = '';
    let lastY: number | null = null;
    const lines: string[] = [];

    textContent.items.forEach((item) => {
      const value = item.str?.trim();
      if (!value) return;

      const y = Math.round(item.transform?.[5] ?? 0);

      if (lastY !== null && Math.abs(y - lastY) > 2 && currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
      }

      currentLine += `${value} `;

      if (item.hasEOL) {
        lines.push(currentLine.trim());
        currentLine = '';
      }

      lastY = y;
    });

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    pages.push(lines.join('\n'));
  }

  return {
    pageCount: document.numPages,
    text: pages.join('\n\n'),
  };
}

function getScoreTone(score: number) {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function formatMinutes(minutes: number) {
  const seconds = Math.max(1, Math.round(minutes * 60));
  if (seconds < 60) return `${seconds} sec`;
  const mins = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${mins} min ${remainder} sec` : `${mins} min`;
}

function getLanguageLabel(language: ResumeLanguage) {
  return RESUME_LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? language;
}

export function ResumeAtsAnalyzer() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [resumeLanguage, setResumeLanguage] = useState<LanguageSelection>('auto');
  const [jobDescriptionLanguage, setJobDescriptionLanguage] = useState<LanguageSelection>('auto');
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [error, setError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    setResumeFile(file);
    setAnalysis(null);
    setExtractedText('');
    setError('');
  };

  const handleAnalyze = async () => {
    if (!resumeFile) {
      setError('Upload a PDF resume first.');
      return;
    }

    setIsAnalyzing(true);
    setError('');

    try {
      const { pageCount, text } = await extractPdfText(resumeFile);

      if (!text.trim()) {
        throw new Error('No selectable text was found in this PDF. Try a PDF with a text layer.');
      }

      setExtractedText(text);
      setAnalysis(
        analyzeResumeText(text, pageCount, jobDescription, {
          resumeLanguage,
          jobDescriptionLanguage,
        })
      );
    } catch (analysisError) {
      setAnalysis(null);
      setExtractedText('');
      setError(
        analysisError instanceof Error ? analysisError.message : 'The PDF could not be analyzed.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setResumeFile(null);
    setJobDescription('');
    setResumeLanguage('auto');
    setJobDescriptionLanguage('auto');
    setAnalysis(null);
    setExtractedText('');
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopyText = async () => {
    await copyToClipboard(extractedText);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Resume Upload
          </CardTitle>
          <CardDescription>
            Upload a PDF resume for browser-side ATS analysis. Your file stays on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="resume-language" className="block text-sm font-medium">
                Resume language
              </label>
              <Select
                value={resumeLanguage}
                onValueChange={(value) => setResumeLanguage(value as LanguageSelection)}
              >
                <SelectTrigger id="resume-language" className="bg-background font-medium">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {RESUME_LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="job-description-language" className="block text-sm font-medium">
                Job description language
              </label>
              <Select
                value={jobDescriptionLanguage}
                onValueChange={(value) => setJobDescriptionLanguage(value as LanguageSelection)}
              >
                <SelectTrigger id="job-description-language" className="bg-background font-medium">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {RESUME_LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <label htmlFor="job-description" className="mb-2 block text-sm font-medium">
              Optional Job Description
            </label>
            <Textarea
              id="job-description"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.currentTarget.value)}
              placeholder="Paste the target job description to score keyword alignment..."
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleAnalyze}
              disabled={!resumeFile || isAnalyzing}
              className="min-h-11 sm:min-h-9"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing PDF...
                </>
              ) : (
                <>
                  <FileSearch className="mr-2 h-4 w-4" />
                  Analyze Resume
                </>
              )}
            </Button>
            <Button onClick={handleClear} variant="outline" className="min-h-11 sm:min-h-9">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>

          {resumeFile && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <span className="font-medium">{resumeFile.name}</span>
              <span className="text-muted-foreground">
                {' '}
                · {(resumeFile.size / 1024).toFixed(0)} KB
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}

      {analysis && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  ATS Score
                </CardTitle>
                <CardDescription>
                  Weighted from contact details, structure, readability, ATS heuristics, and keyword
                  match.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={`text-5xl font-semibold tracking-tight ${getScoreTone(analysis.scores.overall)}`}
                >
                  {analysis.scores.overall}/100
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Resume language:{' '}
                    <strong className="font-medium text-foreground">
                      {getLanguageLabel(analysis.language)}
                    </strong>
                  </span>
                  <span>
                    {analysis.languageSource === 'auto'
                      ? `${Math.round(analysis.languageConfidence * 100)}% auto-detected`
                      : 'manually selected'}
                  </span>
                  {analysis.jobDescriptionLanguage && (
                    <span>
                      Job description: {getLanguageLabel(analysis.jobDescriptionLanguage)}
                    </span>
                  )}
                </div>
                {analysis.languageSource === 'auto' && analysis.languageConfidence < 0.6 && (
                  <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Language detection is uncertain. Select the résumé language manually for more
                      reliable scoring.
                    </span>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <MetricCard label="Pages" value={analysis.pageCount} />
                  <MetricCard label="Words" value={analysis.wordCount.toLocaleString()} />
                  <MetricCard label="Bullets" value={analysis.bulletCount.toLocaleString()} />
                  <MetricCard label="Sentences" value={analysis.sentenceCount.toLocaleString()} />
                  <MetricCard
                    label="Read Time"
                    value={formatMinutes(analysis.estimatedReadingMinutes)}
                  />
                  <MetricCard
                    label="Action Verbs"
                    value={analysis.actionVerbCount.toLocaleString()}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown</CardTitle>
                <CardDescription>Each area contributes up to 20 points.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <BreakdownRow label="Contact Details" value={analysis.scores.contact} />
                <BreakdownRow label="Sections" value={analysis.scores.sections} />
                <BreakdownRow label="Readability" value={analysis.scores.readability} />
                <BreakdownRow label="ATS Heuristics" value={analysis.scores.ats} />
                <BreakdownRow label="Keyword Match" value={analysis.scores.keywordMatch} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Section Coverage</CardTitle>
                <CardDescription>
                  Standard ATS-friendly resume sections detected in the extracted text.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <StatusPill label="Email" ok={analysis.contactChecks.email} />
                  <StatusPill label="Phone" ok={analysis.contactChecks.phone} />
                  <StatusPill label="LinkedIn" ok={analysis.contactChecks.linkedin} />
                  <StatusPill label="Website / GitHub" ok={analysis.contactChecks.website} />
                  <StatusPill label="Location" ok={analysis.contactChecks.location} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Found sections</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.localizedSectionsFound.length > 0 ? (
                      analysis.localizedSectionsFound.map((section) => (
                        <span
                          key={section}
                          className="rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium"
                        >
                          {section}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No standard sections detected.
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Missing opportunities</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.localizedMissingSections.map((section) => (
                      <span
                        key={section}
                        className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground"
                      >
                        {section}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Readability Signals</CardTitle>
                <CardDescription>
                  Plain-language scoring based on the extracted text layer, not visual layout.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label={analysis.readability.formula}
                  value={analysis.readability.score}
                />
                <MetricCard
                  label="Avg Sentence"
                  value={`${analysis.readability.averageSentenceLength} words`}
                />
                <MetricCard
                  label="Avg Word"
                  value={`${analysis.readability.averageWordLength} chars`}
                />
                <MetricCard
                  label="Avg Syllables"
                  value={analysis.readability.averageSyllablesPerWord}
                />
                <MetricCard
                  label="Top Keywords"
                  value={analysis.topResumeKeywords.slice(0, 3).join(', ') || '—'}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Keyword Alignment</CardTitle>
                <CardDescription>
                  If you pasted a job description, this shows which high-signal terms matched.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <KeywordGroup
                  title="Matched"
                  tone="success"
                  items={analysis.matchedKeywords}
                  emptyLabel="Add a job description to evaluate keyword alignment."
                />
                <KeywordGroup
                  title="Missing / Underrepresented"
                  tone="muted"
                  items={analysis.missingJobKeywords.slice(0, 12)}
                  emptyLabel="No missing job keywords detected in the sampled keyword set."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Suggestions</CardTitle>
                <CardDescription>
                  Priority improvements based on the extracted content.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.suggestions.map((suggestion) => (
                  <div
                    key={suggestion}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <p className="text-sm">{suggestion}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Extracted Text Preview</CardTitle>
                <CardDescription>
                  Review the parsed text because ATS scoring depends on what the browser can
                  actually extract.
                </CardDescription>
              </div>
              <Button
                onClick={handleCopyText}
                variant={isCopied ? 'default' : 'outline'}
                size="sm"
                className="min-h-11 sm:min-h-9"
              >
                <Copy className="mr-2 h-4 w-4" />
                {isCopied ? 'Copied' : 'Copy Text'}
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea value={extractedText} readOnly rows={16} className="font-mono text-sm" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-lg">{value}</p>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm font-medium">{value}/20</span>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      )}
      <span>{label}</span>
    </div>
  );
}

function KeywordGroup({
  title,
  items,
  tone,
  emptyLabel,
}: {
  title: string;
  items: string[];
  tone: 'success' | 'muted';
  emptyLabel: string;
}) {
  const className =
    tone === 'success'
      ? 'border-green-200 bg-green-500/10 text-green-700 dark:border-green-900 dark:text-green-300'
      : 'border-border/70 bg-muted/20 text-muted-foreground';

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <span
              key={item}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${className}`}
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

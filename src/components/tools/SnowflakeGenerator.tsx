'use client';

import { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { TooltipSimple } from '../ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import {
  Copy,
  Check,
  Cpu,
  Search,
  Sliders,
  Sparkles,
  FileJson,
  FileSpreadsheet,
  ArrowRight,
  Info,
  Calendar,
  Layers,
  Trash2
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadText } from '@/lib/files';
import {
  SNOWFLAKE_PRESETS,
  clampFieldValue,
  decodeSnowflake,
  formatEpochLabel,
  generateSnowflakeIds,
  layoutProblem,
  maxFieldValue,
  relativeTimeLabel,
  snowflakeIdsToCsv,
  type SnowflakeField,
  type SnowflakeId,
  type SnowflakeLayout,
  type SnowflakePresetId,
} from '@/lib/tools/snowflake-generator';

type PresetType = SnowflakePresetId;

type WidthKey = 'timestampBits' | 'datacenterBits' | 'workerBits' | 'processBits' | 'sequenceBits';

/** A batch of IDs with the preset and layout it was made with, which may differ from the form by now. */
interface GeneratedBatch {
  ids: SnowflakeId[];
  preset: PresetType;
  layout: SnowflakeLayout;
}

// Colours of the bit fields. They are the content of the visualizer, not theme colours.
const BIT_BLOCK_CLASS: Record<SnowflakeField, string> = {
  sign: 'bg-muted-foreground/30 hover:bg-muted-foreground/50 border-muted-foreground/40 text-muted-foreground',
  timestamp: 'bg-blue-500 hover:bg-blue-600 border-blue-400 text-white',
  datacenter: 'bg-purple-500 hover:bg-purple-600 border-purple-400 text-white',
  worker: 'bg-pink-500 hover:bg-pink-600 border-pink-400 text-white',
  process: 'bg-teal-500 hover:bg-teal-600 border-teal-400 text-white',
  sequence: 'bg-amber-500 hover:bg-amber-600 border-amber-400 text-white',
};

const BIT_TEXT_CLASS: Record<SnowflakeField, string> = {
  sign: 'text-muted-foreground border-b-2 border-muted-foreground/20',
  timestamp: 'text-blue-500 border-b-2 border-blue-500/20',
  datacenter: 'text-purple-500 border-b-2 border-purple-500/20',
  worker: 'text-pink-500 border-b-2 border-pink-500/20',
  process: 'text-teal-500 border-b-2 border-teal-500/20',
  sequence: 'text-amber-500 border-b-2 border-amber-500/20',
};

/** Unix milliseconds as the local-time value a `datetime-local` input takes. */
function toDateTimeLocalValue(ms: number): string {
  const tzoffset = new Date(ms).getTimezoneOffset() * 60000;
  return new Date(ms - tzoffset).toISOString().slice(0, -1);
}

/** A node field's name in a row: its label without the trailing "ID", so "Node ID A" and "Node ID B" stay apart. */
function rowLabel(label: string | undefined, fallback: string): string {
  return label?.replace(/ ID$/, '') || fallback;
}

interface NodeValueInputProps {
  value: number;
  max: number;
  label: string;
  onValueChange: (value: number) => void;
}

/** A whole-number field that can be emptied and typed into again without a stray 0 left in front. */
function NodeValueInput({ value, max, label, onValueChange }: NodeValueInputProps) {
  const [emptied, setEmptied] = useState(false);

  return (
    <Input
      type="number"
      min={0}
      max={max}
      step={1}
      value={emptied ? '' : value}
      onChange={(e) => {
        setEmptied(e.target.value === '');
        onValueChange(Number(e.target.value));
      }}
      onBlur={() => setEmptied(false)}
      aria-label={label}
      className="h-8 text-xs font-mono"
    />
  );
}

interface GeneratedIdRowProps {
  item: SnowflakeId;
  index: number;
  batch: GeneratedBatch;
  copied: boolean;
  onInspect: (id: string, batch: GeneratedBatch) => void;
  onCopy: (id: string, index: number) => void;
}

/** One generated ID with its decoded fields, labelled the way its own preset names them. */
function GeneratedIdRow({ item, index, batch, copied, onInspect, onCopy }: GeneratedIdRowProps) {
  const labels = SNOWFLAKE_PRESETS[batch.preset].labels;

  return (
    <div className="p-4 hover:bg-muted/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group">
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold select-all tracking-tight break-all text-primary">
            {item.id}
          </span>
          <Badge variant="outline" className="text-[10px] py-0 font-mono tracking-wider shrink-0 uppercase">
            {batch.preset}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(item.timestamp).toLocaleString()}
          </span>
          {batch.layout.datacenterBits > 0 && (
            <span>
              {rowLabel(labels.datacenter, 'Node A')}: <strong className="font-mono text-foreground">{item.datacenterId}</strong>
            </span>
          )}
          {batch.layout.workerBits > 0 && (
            <span>
              {rowLabel(labels.worker, 'Node B')}: <strong className="font-mono text-foreground">{item.workerId}</strong>
            </span>
          )}
          {batch.layout.processBits > 0 && (
            <span>
              {rowLabel(labels.process, 'Node C')}: <strong className="font-mono text-foreground">{item.processId}</strong>
            </span>
          )}
          <span>
            Seq: <strong className="font-mono text-foreground">{item.sequence}</strong>
          </span>
        </div>
      </div>

      {/* Hidden until hover only where a pointer can hover; touch screens and keyboard focus always show it. */}
      <div className="flex items-center gap-2 shrink-0 md:[@media(hover:hover)]:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
        <Button
          variant="secondary"
          size="sm"
          className="text-xs h-8 px-2.5"
          onClick={() => onInspect(item.id, batch)}
        >
          Decode
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCopy(item.id, index)}
          aria-label={copied ? `Copied ${item.id}` : `Copy ${item.id}`}
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function SnowflakeGenerator() {
  // Tabs: 'generate' | 'decode'
  const [activeTab, setActiveTab] = useState<'generate' | 'decode'>('generate');

  // Generator Config State
  const [preset, setPreset] = useState<PresetType>('twitter');
  const [layout, setLayout] = useState<SnowflakeLayout>(SNOWFLAKE_PRESETS.twitter.layout);
  const [epochDateStr, setEpochDateStr] = useState<string>('');

  // Field Values
  const [datacenterId, setDatacenterId] = useState<number>(0);
  const [workerId, setWorkerId] = useState<number>(0);
  const [processId, setProcessId] = useState<number>(0);
  const [sequenceVal, setSequenceVal] = useState<number>(0);

  // Generator Timing State
  const [useCurrentTime, setUseCurrentTime] = useState<boolean>(true);
  const [customTimeStr, setCustomTimeStr] = useState<string>('');
  const [count, setCount] = useState<number>(5);

  // Generated Outputs
  const [generated, setGenerated] = useState<GeneratedBatch | null>(null);
  const [generateError, setGenerateError] = useState<string>('');

  // Decoder State. The layout follows the decoder preset unless it is customized.
  const [decodeIdInput, setDecodeIdInput] = useState<string>('');
  const [decoderPreset, setDecoderPreset] = useState<PresetType>('twitter');
  const [decoderLayout, setDecoderLayout] = useState<SnowflakeLayout>(SNOWFLAKE_PRESETS.twitter.layout);
  // When the ID on show was entered; the relative time is measured from here.
  const [decodedAt, setDecodedAt] = useState<number>(0);

  // Interactive Bit State
  const [hoveredBitIndex, setHoveredBitIndex] = useState<number | null>(null);

  // Copy helpers. The target is a row index or the whole list.
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [copyTarget, setCopyTarget] = useState<number | 'all' | null>(null);
  const copiedAll = isCopied && copyTarget === 'all';

  const { timestampBits, datacenterBits, workerBits, processBits, sequenceBits } = layout;
  const presetLabels = SNOWFLAKE_PRESETS[preset].labels;
  const decoderLabels = SNOWFLAKE_PRESETS[decoderPreset].labels;

  // Load a preset's layout and reset the field values to safe ranges
  const handlePresetChange = (next: PresetType) => {
    const nextLayout = SNOWFLAKE_PRESETS[next].layout;
    setPreset(next);
    setLayout(nextLayout);
    setDatacenterId(0);
    setWorkerId(0);
    setProcessId(0);
    setSequenceVal(0);
    setEpochDateStr(toDateTimeLocalValue(nextLayout.epoch));
    setGenerateError('');
  };

  const handleDecoderPresetChange = (next: PresetType) => {
    setDecoderPreset(next);
    setDecoderLayout(SNOWFLAKE_PRESETS[next].layout);
    setDecodedAt(Date.now());
  };

  // Handle custom epoch date change
  const handleEpochDateChange = (val: string) => {
    setEpochDateStr(val);
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) {
      setLayout({ ...layout, epoch: parsed });
    }
  };

  // A narrower field may no longer hold the value typed for it
  const handleWidthChange = (key: WidthKey, bits: number) => {
    setLayout({ ...layout, [key]: bits });
    if (key === 'datacenterBits') setDatacenterId(clampFieldValue(datacenterId, bits));
    if (key === 'workerBits') setWorkerId(clampFieldValue(workerId, bits));
    if (key === 'processBits') setProcessId(clampFieldValue(processId, bits));
    if (key === 'sequenceBits') setSequenceVal(clampFieldValue(sequenceVal, bits));
  };

  const handleDecoderLayoutChange = (key: keyof SnowflakeLayout, value: string) => {
    setDecoderLayout({ ...decoderLayout, [key]: Number(value) });
  };

  const bitConfigError = useMemo(() => layoutProblem(layout), [layout]);

  // Max values for sliders/inputs
  const maxDatacenterVal = maxFieldValue(datacenterBits);
  const maxWorkerVal = maxFieldValue(workerBits);
  const maxProcessVal = maxFieldValue(processBits);
  const maxSequenceVal = maxFieldValue(sequenceBits);

  // Generator Function
  const handleGenerate = () => {
    const time = useCurrentTime || !customTimeStr ? Date.now() : Date.parse(customTimeStr);
    const result = generateSnowflakeIds(layout, {
      time,
      count,
      datacenterId,
      workerId,
      processId,
      startSequence: sequenceVal,
    });

    // The check mark of an earlier copy must not carry over to the new list.
    setCopyTarget(null);
    if (!result.ok) {
      setGenerated(null);
      setGenerateError(result.error);
      return;
    }
    setGenerateError('');
    setGenerated({ ids: result.value, preset, layout });
  };

  const handleClearGenerated = () => {
    setGenerated(null);
    setGenerateError('');
    setCopyTarget(null);
  };

  // Decode Logic
  const decodedData = useMemo(
    () => decodeSnowflake(decodeIdInput, decoderLayout),
    [decodeIdInput, decoderLayout]
  );

  const successData = decodedData && decodedData.ok ? decodedData.value : null;
  const decodedDate = useMemo(() => (successData ? new Date(successData.timestamp) : null), [successData]);

  // Visual Bit Segments for Interactive Binary Visualizer
  const bitSlices = useMemo(() => {
    if (!successData || !decodedDate) return [];

    const describe: Record<SnowflakeField, { group: string; desc: string }> = {
      sign: {
        group: 'Sign',
        desc: 'Unused sign bit. Always 0 for positive numbers.',
      },
      timestamp: {
        group: 'Timestamp',
        desc: `Timestamp offset in ms since epoch. Extracted: ${decodedDate.toUTCString()}`,
      },
      datacenter: {
        group: decoderLabels.datacenter || 'Datacenter',
        desc: `Machine/Datacenter/Shard Node ID. Extracted: ${successData.datacenterId}`,
      },
      worker: {
        group: decoderLabels.worker || 'Worker',
        desc: `Machine/Worker identifier. Extracted: ${successData.workerId}`,
      },
      process: {
        group: decoderLabels.process || 'Process',
        desc: `Process thread/worker ID. Extracted: ${successData.processId}`,
      },
      sequence: {
        group: 'Sequence',
        desc: `Incrementing sequence for IDs in the same millisecond. Extracted: ${successData.sequence}`,
      },
    };

    return successData.segments.flatMap((segment) =>
      Array.from(segment.bits, (val) => ({
        val,
        color: BIT_BLOCK_CLASS[segment.field],
        ...describe[segment.field],
      }))
    );
  }, [successData, decodedDate, decoderLabels]);

  const hoveredBit = hoveredBitIndex !== null ? bitSlices[hoveredBitIndex] : undefined;
  const hasSignBit = successData?.segments.some((segment) => segment.field === 'sign') ?? false;

  const handleDecodeInputChange = (value: string) => {
    setDecodeIdInput(value);
    setDecodedAt(Date.now());
  };

  // Quick inspect launcher from generator table. Decodes with the layout the ID was made with.
  const handleInspectId = (id: string, batch: GeneratedBatch) => {
    setDecodeIdInput(id);
    setDecoderPreset(batch.preset);
    setDecoderLayout(batch.layout);
    setDecodedAt(Date.now());
    setActiveTab('decode');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopyIndividual = (id: string, index: number) => {
    setCopyTarget(index);
    void copyToClipboard(id);
  };

  const handleCopyAll = () => {
    if (!generated) return;
    setCopyTarget('all');
    void copyToClipboard(generated.ids.map((item) => item.id).join('\n'));
  };

  // Export as JSON
  const handleExportJson = () => {
    if (!generated) return;
    downloadText(JSON.stringify(generated.ids, null, 2), `snowflake-ids-${Date.now()}.json`, 'application/json');
  };

  // Export as CSV
  const handleExportCsv = () => {
    if (!generated) return;
    downloadText(snowflakeIdsToCsv(generated.ids), `snowflake-ids-${Date.now()}.csv`, 'text/csv');
  };

  return (
    <div className="space-y-6">
      {/* Custom Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'generate' | 'decode')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generate IDs
          </TabsTrigger>
          <TabsTrigger value="decode" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Decode ID
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'generate' && (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
          {/* Generator settings */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="shadow-lg border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-primary" />
                  <CardTitle>Configuration</CardTitle>
                </div>
                <CardDescription>Configure bit allocation and metadata values.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preset selection */}
                <div className="space-y-2">
                  <label htmlFor="snowflake-preset" className="text-sm font-medium">Preset Format</label>
                  <Select value={preset} onValueChange={(val) => handlePresetChange(val as PresetType)}>
                    <SelectTrigger id="snowflake-preset" className="w-full">
                      <SelectValue placeholder="Select preset layout" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twitter">Twitter Snowflake</SelectItem>
                      <SelectItem value="discord">Discord Snowflake</SelectItem>
                      <SelectItem value="instagram">Instagram Shard ID</SelectItem>
                      <SelectItem value="custom">Custom Configuration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Preset specs info badge */}
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Layout Bit Scheme:</p>
                  <div className="grid grid-cols-2 gap-y-1">
                    <div>Timestamp Epoch:</div>
                    <TooltipSimple content={formatEpochLabel(layout.epoch)}>
                      <div className="font-mono text-[11px] text-right truncate">
                        {formatEpochLabel(layout.epoch)}
                      </div>
                    </TooltipSimple>
                    <div>Timestamp Bits:</div>
                    <div className="font-mono text-right">{timestampBits} bits</div>
                    {datacenterBits > 0 && (
                      <>
                        <div>{presetLabels.datacenter || 'Datacenter Bits'}:</div>
                        <div className="font-mono text-right">{datacenterBits} bits</div>
                      </>
                    )}
                    {workerBits > 0 && (
                      <>
                        <div>{presetLabels.worker || 'Worker Bits'}:</div>
                        <div className="font-mono text-right">{workerBits} bits</div>
                      </>
                    )}
                    {processBits > 0 && (
                      <>
                        <div>{presetLabels.process || 'Process Bits'}:</div>
                        <div className="font-mono text-right">{processBits} bits</div>
                      </>
                    )}
                    <div>Sequence Bits:</div>
                    <div className="font-mono text-right">{sequenceBits} bits</div>
                  </div>
                </div>

                {/* Custom Configuration Settings */}
                {preset === 'custom' && (
                  <div className="space-y-4 rounded-xl border border-border/85 bg-muted/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Custom Bit Allocations</p>

                    <div className="space-y-3">
                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Timestamp Width:</span>
                          <span className="font-mono text-primary font-bold">{timestampBits} bits</span>
                        </label>
                        <Slider aria-label="Timestamp Width" value={timestampBits} min={20} max={50} step={1} onChange={(bits) => handleWidthChange('timestampBits', bits)} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Node A Width (e.g. Datacenter):</span>
                          <span className="font-mono text-primary font-bold">{datacenterBits} bits</span>
                        </label>
                        <Slider aria-label="Node A Width" value={datacenterBits} min={0} max={20} step={1} onChange={(bits) => handleWidthChange('datacenterBits', bits)} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Node B Width (e.g. Worker):</span>
                          <span className="font-mono text-primary font-bold">{workerBits} bits</span>
                        </label>
                        <Slider aria-label="Node B Width" value={workerBits} min={0} max={20} step={1} onChange={(bits) => handleWidthChange('workerBits', bits)} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Node C Width (e.g. Process):</span>
                          <span className="font-mono text-primary font-bold">{processBits} bits</span>
                        </label>
                        <Slider aria-label="Node C Width" value={processBits} min={0} max={20} step={1} onChange={(bits) => handleWidthChange('processBits', bits)} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Sequence Width:</span>
                          <span className="font-mono text-primary font-bold">{sequenceBits} bits</span>
                        </label>
                        <Slider aria-label="Sequence Width" value={sequenceBits} min={6} max={20} step={1} onChange={(bits) => handleWidthChange('sequenceBits', bits)} />
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <label htmlFor="snowflake-custom-epoch" className="text-xs font-semibold flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Custom Epoch
                      </label>
                      <Input
                        id="snowflake-custom-epoch"
                        type="datetime-local"
                        step="0.001"
                        value={epochDateStr}
                        onChange={(e) => handleEpochDateChange(e.target.value)}
                        className="text-xs"
                      />
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                        <span>Unix epoch (ms):</span>
                        <span>{layout.epoch}</span>
                      </div>
                    </div>

                    {bitConfigError && (
                      <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium">
                        {bitConfigError}
                      </div>
                    )}
                  </div>
                )}

                {/* Values Inputs (Ranges based on active bits configuration) */}
                <div className="space-y-4 pt-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parameter Values</p>

                  {datacenterBits > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span>{presetLabels.datacenter || 'Datacenter ID'}:</span>
                        <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{datacenterId}</span>
                      </div>
                      <NodeValueInput
                        value={datacenterId}
                        max={maxDatacenterVal}
                        label={presetLabels.datacenter || 'Datacenter ID'}
                        onValueChange={(next) => setDatacenterId(clampFieldValue(next, datacenterBits))}
                      />
                      <span className="text-[10px] text-muted-foreground">Range: 0 - {maxDatacenterVal} ({datacenterBits} bits)</span>
                    </div>
                  )}

                  {workerBits > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span>{presetLabels.worker || 'Worker ID'}:</span>
                        <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{workerId}</span>
                      </div>
                      <NodeValueInput
                        value={workerId}
                        max={maxWorkerVal}
                        label={presetLabels.worker || 'Worker ID'}
                        onValueChange={(next) => setWorkerId(clampFieldValue(next, workerBits))}
                      />
                      <span className="text-[10px] text-muted-foreground">Range: 0 - {maxWorkerVal} ({workerBits} bits)</span>
                    </div>
                  )}

                  {processBits > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span>{presetLabels.process || 'Process ID'}:</span>
                        <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{processId}</span>
                      </div>
                      <NodeValueInput
                        value={processId}
                        max={maxProcessVal}
                        label={presetLabels.process || 'Process ID'}
                        onValueChange={(next) => setProcessId(clampFieldValue(next, processBits))}
                      />
                      <span className="text-[10px] text-muted-foreground">Range: 0 - {maxProcessVal} ({processBits} bits)</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span>Start Sequence:</span>
                      <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{sequenceVal}</span>
                    </div>
                    <NodeValueInput
                      value={sequenceVal}
                      max={maxSequenceVal}
                      label="Start Sequence"
                      onValueChange={(next) => setSequenceVal(clampFieldValue(next, sequenceBits))}
                    />
                    <span className="text-[10px] text-muted-foreground">Range: 0 - {maxSequenceVal} ({sequenceBits} bits)</span>
                  </div>
                </div>

                {/* Timing controls */}
                <div className="space-y-4 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Use Current Time</p>
                      <p className="text-xs text-muted-foreground">Set Snowflake timestamp to Date.now()</p>
                    </div>
                    <Switch checked={useCurrentTime} onCheckedChange={setUseCurrentTime} aria-label="Use Current Time" />
                  </div>

                  {!useCurrentTime && (
                    <div className="space-y-1.5">
                      <label htmlFor="snowflake-custom-time" className="text-xs font-medium">Custom Timestamp Date</label>
                      <Input
                        id="snowflake-custom-time"
                        type="datetime-local"
                        step="0.001"
                        value={customTimeStr}
                        onChange={(e) => setCustomTimeStr(e.target.value)}
                        className="text-xs font-mono h-9"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Count to Generate: {count}</label>
                    <Slider aria-label="Count to Generate" value={count} min={1} max={100} step={1} onChange={setCount} />
                  </div>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={!!bitConfigError}
                  className="w-full mt-4 flex items-center justify-center gap-2 shadow bg-primary"
                >
                  <Cpu className="h-4 w-4" />
                  Generate IDs
                </Button>

                {generateError && (
                  <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium">
                    {generateError}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results section */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="shadow-lg border-border/60 h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b pb-4 shrink-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Generated IDs
                  </CardTitle>
                  <CardDescription>Generated Snowflake strings.</CardDescription>
                </div>
                {generated && (
                  <div className="flex items-center gap-2 shrink-0">
                    <TooltipSimple content="Copy all IDs">
                      <Button variant="ghost" size="sm" onClick={handleCopyAll} aria-label="Copy all IDs">
                        {copiedAll ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                        <span className="ml-1.5 hidden sm:inline">Copy All</span>
                      </Button>
                    </TooltipSimple>
                    <TooltipSimple content="Export CSV">
                      <Button variant="ghost" size="icon" onClick={handleExportCsv} aria-label="Export CSV" className="h-8 w-8">
                        <FileSpreadsheet className="h-4 w-4" />
                      </Button>
                    </TooltipSimple>
                    <TooltipSimple content="Export JSON">
                      <Button variant="ghost" size="icon" onClick={handleExportJson} aria-label="Export JSON" className="h-8 w-8">
                        <FileJson className="h-4 w-4" />
                      </Button>
                    </TooltipSimple>
                    <TooltipSimple content="Clear IDs">
                      <Button variant="ghost" size="icon" onClick={handleClearGenerated} aria-label="Clear IDs" className="h-8 w-8">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipSimple>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-[300px] flex flex-col overflow-hidden">
                {!generated ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 sm:p-8 text-center space-y-2 flex-1">
                    <Info className="h-8 w-8 stroke-[1.5]" />
                    <p className="text-sm font-medium">No Snowflake IDs generated yet.</p>
                    <p className="text-xs">Adjust configuration on the left and click Generate.</p>
                  </div>
                ) : (
                  // The viewport carries the height limit too: a limit on the root alone clips the list instead of scrolling it.
                  <ScrollArea className="max-h-[600px] flex-1 [&>[data-radix-scroll-area-viewport]]:max-h-[600px]">
                    <div className="divide-y divide-border/60 pr-3">
                      {generated.ids.map((item, index) => (
                        <GeneratedIdRow
                          key={item.id}
                          item={item}
                          index={index}
                          batch={generated}
                          copied={isCopied && copyTarget === index}
                          onInspect={handleInspectId}
                          onCopy={handleCopyIndividual}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'decode' && (
        <div className="space-y-6">
          {/* Decoder Input */}
          <Card className="shadow-lg border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Decode Snowflake ID
              </CardTitle>
              <CardDescription>
                Extract timestamp, node identities, and sequence from an existing ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Enter 64-bit Snowflake ID (e.g. 1541815603606036480)"
                    value={decodeIdInput}
                    onChange={(e) => handleDecodeInputChange(e.target.value)}
                    aria-label="Snowflake ID to decode"
                    className="font-mono text-sm h-11"
                  />
                </div>
                <div className="w-full sm:w-64">
                  <Select value={decoderPreset} onValueChange={(val) => handleDecoderPresetChange(val as PresetType)}>
                    <SelectTrigger aria-label="Decoder preset" className="h-11">
                      <SelectValue placeholder="Decoder Presets" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twitter">Decode as Twitter Preset</SelectItem>
                      <SelectItem value="discord">Decode as Discord Preset</SelectItem>
                      <SelectItem value="instagram">Decode as Instagram Preset</SelectItem>
                      <SelectItem value="custom">Decode as Custom Configuration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom decoder parameters if custom is selected */}
              {decoderPreset === 'custom' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 p-4 rounded-xl border border-border/80 bg-muted/10">
                  <div className="space-y-1">
                    <label htmlFor="snowflake-dec-timestamp-bits" className="text-xs font-semibold">Timestamp Bits</label>
                    <Input
                      id="snowflake-dec-timestamp-bits"
                      type="number"
                      min={1}
                      max={64}
                      step={1}
                      value={decoderLayout.timestampBits}
                      onChange={(e) => handleDecoderLayoutChange('timestampBits', e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="snowflake-dec-datacenter-bits" className="text-xs font-semibold">Node A Bits</label>
                    <Input
                      id="snowflake-dec-datacenter-bits"
                      type="number"
                      min={0}
                      max={63}
                      step={1}
                      value={decoderLayout.datacenterBits}
                      onChange={(e) => handleDecoderLayoutChange('datacenterBits', e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="snowflake-dec-worker-bits" className="text-xs font-semibold">Node B Bits</label>
                    <Input
                      id="snowflake-dec-worker-bits"
                      type="number"
                      min={0}
                      max={63}
                      step={1}
                      value={decoderLayout.workerBits}
                      onChange={(e) => handleDecoderLayoutChange('workerBits', e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="snowflake-dec-process-bits" className="text-xs font-semibold">Node C Bits</label>
                    <Input
                      id="snowflake-dec-process-bits"
                      type="number"
                      min={0}
                      max={63}
                      step={1}
                      value={decoderLayout.processBits}
                      onChange={(e) => handleDecoderLayoutChange('processBits', e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="snowflake-dec-sequence-bits" className="text-xs font-semibold">Sequence Bits</label>
                    <Input
                      id="snowflake-dec-sequence-bits"
                      type="number"
                      min={0}
                      max={63}
                      step={1}
                      value={decoderLayout.sequenceBits}
                      onChange={(e) => handleDecoderLayoutChange('sequenceBits', e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-5 space-y-1 mt-1">
                    <label htmlFor="snowflake-dec-epoch" className="text-xs font-semibold">Custom Decoder Epoch (ms)</label>
                    <Input
                      id="snowflake-dec-epoch"
                      type="number"
                      step={1}
                      value={decoderLayout.epoch}
                      onChange={(e) => handleDecoderLayoutChange('epoch', e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Decoded Results Card */}
          {decodedData && (
            <div className="space-y-6">
              {successData && decodedDate ? (
                <>
                  {/* Binary Breakdown visualizer */}
                  <Card className="shadow-lg border-border/60">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-primary" />
                        Binary Bit Breakdown (64-bit)
                      </CardTitle>
                      <CardDescription>
                        Visual color-coded bit distribution. Hover over bits to view specific bit values.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Grid representation */}
                      <div className="flex flex-wrap gap-[3px] sm:gap-[5px] justify-center p-4 bg-muted/30 rounded-xl border">
                        {bitSlices.map((bit, idx) => (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredBitIndex(idx)}
                            onMouseLeave={() => setHoveredBitIndex(null)}
                            className={`w-[13px] h-7 sm:w-5 sm:h-9 rounded-[2px] border flex items-center justify-center text-[9px] sm:text-xs font-bold cursor-crosshair select-none transition-all ${
                              bit.color
                            } ${hoveredBitIndex === idx ? 'ring-2 ring-primary scale-110' : ''}`}
                          >
                            {bit.val}
                          </div>
                        ))}
                      </div>

                      {/* Interactive block hover detail */}
                      <div className="rounded-xl border border-border bg-muted/20 p-4 min-h-[96px] flex flex-col justify-center">
                        {hoveredBitIndex !== null && hoveredBit ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Bit Position:
                              </span>
                              <span className="font-mono font-bold bg-muted px-2 py-0.5 rounded text-sm text-foreground">
                                #{63 - hoveredBitIndex} (Array Index: {hoveredBitIndex})
                              </span>
                              <Badge className="font-semibold uppercase tracking-wider text-[9px]">
                                {hoveredBit.group}
                              </Badge>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Value:</span>
                              <span className="font-mono font-black text-lg text-primary">
                                {hoveredBit.val}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground font-medium pt-0.5">
                              {hoveredBit.desc}
                            </p>
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground text-xs flex items-center justify-center gap-1.5">
                            <Info className="h-4 w-4 stroke-[1.5]" />
                            Hover over any bit block in the layout above to inspect details.
                          </div>
                        )}
                      </div>

                      {/* Legends */}
                      <div className="flex flex-wrap gap-4 justify-center text-xs">
                        {hasSignBit && (
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-muted-foreground/30 border"></span>
                            <span>Sign (1 bit)</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded bg-blue-500"></span>
                          <span>Timestamp ({decoderLayout.timestampBits} bits)</span>
                        </div>
                        {decoderLayout.datacenterBits > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-purple-500"></span>
                            <span>{decoderLabels.datacenter || 'Datacenter'} ({decoderLayout.datacenterBits} bits)</span>
                          </div>
                        )}
                        {decoderLayout.workerBits > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-pink-500"></span>
                            <span>{decoderLabels.worker || 'Worker'} ({decoderLayout.workerBits} bits)</span>
                          </div>
                        )}
                        {decoderLayout.processBits > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-teal-500"></span>
                            <span>{decoderLabels.process || 'Process'} ({decoderLayout.processBits} bits)</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded bg-amber-500"></span>
                          <span>Sequence ({decoderLayout.sequenceBits} bits)</span>
                        </div>
                      </div>

                      {/* Formatted binary splits */}
                      <div className="space-y-1.5 pt-2 border-t">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Binary Bit String:</span>
                        <div className="font-mono text-xs sm:text-sm bg-muted rounded-lg p-3 break-all flex flex-wrap gap-x-2 gap-y-1 font-semibold leading-relaxed">
                          {successData.segments.map((segment) => (
                            <span key={segment.field} className={BIT_TEXT_CLASS[segment.field]}>
                              {segment.bits}
                            </span>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Decoded Details values table */}
                  <Card className="shadow-lg border-border/60">
                    <CardHeader>
                      <CardTitle>Decoded Values</CardTitle>
                      <CardDescription>Extracted fields from decoded identifier.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 border-t">
                      <div className="divide-y divide-border/60 text-sm">
                        <div className="flex py-3.5 px-4 sm:px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">UTC Timestamp Date</div>
                          <div className="w-2/3 font-mono font-bold text-foreground select-all">{decodedDate.toUTCString()}</div>
                        </div>

                        <div className="flex py-3.5 px-4 sm:px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Local Time</div>
                          <div className="w-2/3 font-mono font-bold text-foreground select-all">{decodedDate.toLocaleString()}</div>
                        </div>

                        <div className="flex py-3.5 px-4 sm:px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Relative Time</div>
                          <div className="w-2/3 text-foreground font-medium">{relativeTimeLabel(successData.timestamp, decodedAt)}</div>
                        </div>

                        <div className="flex py-3.5 px-4 sm:px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Unix Milliseconds Offset</div>
                          <div className="w-2/3 font-mono text-foreground">
                            {successData.offset} <span className="text-xs text-muted-foreground">(from Epoch base)</span>
                          </div>
                        </div>

                        <div className="flex py-3.5 px-4 sm:px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Raw Timestamp (ms)</div>
                          <div className="w-2/3 font-mono text-foreground">{successData.timestamp}</div>
                        </div>

                        {decoderLayout.datacenterBits > 0 && (
                          <div className="flex py-3.5 px-4 sm:px-6 items-center">
                            <div className="w-1/3 text-muted-foreground font-medium">{decoderLabels.datacenter || 'Datacenter ID'}</div>
                            <div className="w-2/3 font-mono text-foreground font-bold">{successData.datacenterId}</div>
                          </div>
                        )}

                        {decoderLayout.workerBits > 0 && (
                          <div className="flex py-3.5 px-4 sm:px-6 items-center">
                            <div className="w-1/3 text-muted-foreground font-medium">{decoderLabels.worker || 'Worker ID'}</div>
                            <div className="w-2/3 font-mono text-foreground font-bold">{successData.workerId}</div>
                          </div>
                        )}

                        {decoderLayout.processBits > 0 && (
                          <div className="flex py-3.5 px-4 sm:px-6 items-center">
                            <div className="w-1/3 text-muted-foreground font-medium">{decoderLabels.process || 'Process ID'}</div>
                            <div className="w-2/3 font-mono text-foreground font-bold">{successData.processId}</div>
                          </div>
                        )}

                        <div className="flex py-3.5 px-4 sm:px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Sequence ID</div>
                          <div className="w-2/3 font-mono text-foreground font-bold">{successData.sequence}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div role="alert" className="rounded-xl bg-destructive/10 p-4 border border-destructive/20 text-destructive text-sm font-medium">
                  {decodedData.ok ? '' : decodedData.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

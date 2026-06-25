'use client';

import { useState, useEffect, useMemo } from 'react';
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
  SelectGroup,
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
  RefreshCw,
  Sliders,
  Sparkles,
  FileJson,
  FileSpreadsheet,
  ArrowRight,
  Info,
  Calendar,
  Layers
} from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { ScrollArea } from '@/components/ui/scroll-area';

type PresetType = 'twitter' | 'discord' | 'instagram' | 'custom';

interface PresetConfig {
  name: string;
  epoch: number; // in ms
  epochLabel: string;
  timestampBits: number;
  datacenterBits: number;
  workerBits: number;
  processBits: number;
  sequenceBits: number;
  labels: {
    datacenter?: string;
    worker?: string;
    process?: string;
  };
}

const PRESETS: Record<PresetType, PresetConfig> = {
  twitter: {
    name: 'Twitter Snowflake',
    epoch: 1288834974657,
    epochLabel: '2010-11-04 01:42:54.657 UTC',
    timestampBits: 41,
    datacenterBits: 5,
    workerBits: 5,
    processBits: 0,
    sequenceBits: 12,
    labels: {
      datacenter: 'Datacenter ID',
      worker: 'Worker ID',
    },
  },
  discord: {
    name: 'Discord Snowflake',
    epoch: 1420070400000,
    epochLabel: '2015-01-01 00:00:00.000 UTC',
    timestampBits: 41,
    datacenterBits: 0,
    workerBits: 5,
    processBits: 5,
    sequenceBits: 12,
    labels: {
      worker: 'Worker ID',
      process: 'Process ID',
    },
  },
  instagram: {
    name: 'Instagram Shard ID',
    epoch: 1314220800000,
    epochLabel: '2011-08-25 00:00:00.000 UTC',
    timestampBits: 41,
    datacenterBits: 13, // Instagram Shard ID mapped to datacenter for convenience
    workerBits: 0,
    processBits: 0,
    sequenceBits: 10,
    labels: {
      datacenter: 'Shard ID',
    },
  },
  custom: {
    name: 'Custom Configuration',
    epoch: 1704067200000, // 2024-01-01
    epochLabel: '2024-01-01 00:00:00.000 UTC',
    timestampBits: 41,
    datacenterBits: 5,
    workerBits: 5,
    processBits: 0,
    sequenceBits: 12,
    labels: {
      datacenter: 'Node ID A',
      worker: 'Node ID B',
      process: 'Node ID C',
    },
  },
};

interface GeneratedIdInfo {
  id: string;
  timestamp: number;
  utcDate: string;
  datacenterId: number;
  workerId: number;
  processId: number;
  sequence: number;
}

export function SnowflakeGenerator() {
  // Tabs: 'generate' | 'decode'
  const [activeTab, setActiveTab] = useState<'generate' | 'decode'>('generate');

  // Generator Config State
  const [preset, setPreset] = useState<PresetType>('twitter');
  const [epoch, setEpoch] = useState<number>(PRESETS.twitter.epoch);
  const [epochDateStr, setEpochDateStr] = useState<string>('2010-11-04T01:42:54.657');
  const [timestampBits, setTimestampBits] = useState<number>(41);
  const [datacenterBits, setDatacenterBits] = useState<number>(5);
  const [workerBits, setWorkerBits] = useState<number>(5);
  const [processBits, setProcessBits] = useState<number>(0);
  const [sequenceBits, setSequenceBits] = useState<number>(12);

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
  const [generatedIds, setGeneratedIds] = useState<GeneratedIdInfo[]>([]);

  // Decoder State
  const [decodeIdInput, setDecodeIdInput] = useState<string>('');
  const [decoderPreset, setDecoderPreset] = useState<PresetType>('twitter');
  
  // Custom Decoder override state (inherits from generator preset unless customized)
  const [decoderEpoch, setDecoderEpoch] = useState<number>(PRESETS.twitter.epoch);
  const [decTimestampBits, setDecTimestampBits] = useState<number>(41);
  const [decDatacenterBits, setDecDatacenterBits] = useState<number>(5);
  const [decWorkerBits, setDecWorkerBits] = useState<number>(5);
  const [decProcessBits, setDecProcessBits] = useState<number>(0);
  const [decSequenceBits, setDecSequenceBits] = useState<number>(12);

  // Interactive Bit State
  const [hoveredBitIndex, setHoveredBitIndex] = useState<number | null>(null);

  // Copy helpers
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdIndex, setCopiedIdIndex] = useState<number | null>(null);

  // Synchronize dynamic parameters when preset changes
  useEffect(() => {
    const config = PRESETS[preset];
    setEpoch(config.epoch);
    setTimestampBits(config.timestampBits);
    setDatacenterBits(config.datacenterBits);
    setWorkerBits(config.workerBits);
    setProcessBits(config.processBits);
    setSequenceBits(config.sequenceBits);

    // Reset fields to safe ranges
    setDatacenterId(0);
    setWorkerId(0);
    setProcessId(0);
    setSequenceVal(0);

    // Format epoch date for custom inputs
    const d = new Date(config.epoch);
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzoffset).toISOString().slice(0, -1);
    setEpochDateStr(localISOTime);
  }, [preset]);

  // Synchronize decoder parameters when decoder preset changes
  useEffect(() => {
    const config = PRESETS[decoderPreset];
    setDecoderEpoch(config.epoch);
    setDecTimestampBits(config.timestampBits);
    setDecDatacenterBits(config.datacenterBits);
    setDecWorkerBits(config.workerBits);
    setDecProcessBits(config.processBits);
    setDecSequenceBits(config.sequenceBits);
  }, [decoderPreset]);

  // Handle custom epoch date change
  const handleEpochDateChange = (val: string) => {
    setEpochDateStr(val);
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) {
      setEpoch(parsed);
    }
  };

  // Safe Bit configuration sum validation
  const totalConfiguredBits = useMemo(() => {
    return timestampBits + datacenterBits + workerBits + processBits + sequenceBits;
  }, [timestampBits, datacenterBits, workerBits, processBits, sequenceBits]);

  const bitConfigError = useMemo(() => {
    if (totalConfiguredBits !== 63) {
      return `Bit widths must sum to exactly 63 bits (excluding 1-bit sign). Current sum: ${totalConfiguredBits} bits.`;
    }
    return null;
  }, [totalConfiguredBits]);

  // Max values for sliders/inputs
  const maxDatacenterVal = useMemo(() => (1 << datacenterBits) - 1, [datacenterBits]);
  const maxWorkerVal = useMemo(() => (1 << workerBits) - 1, [workerBits]);
  const maxProcessVal = useMemo(() => (1 << processBits) - 1, [processBits]);
  const maxSequenceVal = useMemo(() => (1 << sequenceBits) - 1, [sequenceBits]);

  // Generator Function
  const handleGenerate = () => {
    if (bitConfigError) return;

    const baseTime = useCurrentTime ? Date.now() : Date.parse(customTimeStr || new Date().toISOString());
    const finalEpoch = BigInt(epoch);
    
    // Shifts
    const seqShift = 0n;
    const procShift = BigInt(sequenceBits);
    const wrkShift = procShift + BigInt(processBits);
    const dcShift = wrkShift + BigInt(workerBits);
    const tsShift = dcShift + BigInt(datacenterBits);

    // Masks
    const dcMask = (1n << BigInt(datacenterBits)) - 1n;
    const wrkMask = (1n << BigInt(workerBits)) - 1n;
    const procMask = (1n << BigInt(processBits)) - 1n;
    const seqMask = (1n << BigInt(sequenceBits)) - 1n;

    const ids: GeneratedIdInfo[] = [];

    for (let i = 0; i < count; i++) {
      const timeMs = baseTime + Math.floor(i / (1 << sequenceBits)); // Advance ms if sequence overflows
      const offset = BigInt(timeMs) - finalEpoch;

      const currentSeq = BigInt((sequenceVal + i) % (1 << sequenceBits));

      const finalDc = BigInt(datacenterId) & dcMask;
      const finalWrk = BigInt(workerId) & wrkMask;
      const finalProc = BigInt(processId) & procMask;
      const finalSeq = currentSeq & seqMask;

      const id = (offset << tsShift) |
                 (finalDc << dcShift) |
                 (finalWrk << wrkShift) |
                 (finalProc << procShift) |
                 finalSeq;

      ids.push({
        id: id.toString(),
        timestamp: timeMs,
        utcDate: new Date(timeMs).toUTCString(),
        datacenterId: Number(finalDc),
        workerId: Number(finalWrk),
        processId: Number(finalProc),
        sequence: Number(finalSeq),
      });
    }

    setGeneratedIds(ids);
  };

interface DecodeSuccess {
  success: true;
  timestamp: number;
  date: Date;
  datacenterId: number;
  workerId: number;
  processId: number;
  sequence: number;
  binaryStr: string;
  error?: undefined;
}

interface DecodeError {
  success: false;
  error: string;
  timestamp?: undefined;
  date?: undefined;
  datacenterId?: undefined;
  workerId?: undefined;
  processId?: undefined;
  sequence?: undefined;
  binaryStr?: undefined;
}

type DecodeResult = DecodeSuccess | DecodeError;

  // Decode Logic
  const decodedData = useMemo<DecodeResult | null>(() => {
    if (!decodeIdInput.trim()) return null;

    try {
      const id = BigInt(decodeIdInput.trim());
      
      const seqShift = 0n;
      const procShift = BigInt(decSequenceBits);
      const wrkShift = procShift + BigInt(decProcessBits);
      const dcShift = wrkShift + BigInt(decWorkerBits);
      const tsShift = dcShift + BigInt(decDatacenterBits);

      const tsMask = (1n << BigInt(decTimestampBits)) - 1n;
      const dcMask = (1n << BigInt(decDatacenterBits)) - 1n;
      const wrkMask = (1n << BigInt(decWorkerBits)) - 1n;
      const procMask = (1n << BigInt(decProcessBits)) - 1n;
      const seqMask = (1n << BigInt(decSequenceBits)) - 1n;

      const timeOffset = (id >> tsShift) & tsMask;
      const dcVal = (id >> dcShift) & dcMask;
      const wrkVal = (id >> wrkShift) & wrkMask;
      const procVal = (id >> procShift) & procMask;
      const seqVal = (id >> seqShift) & seqMask;

      const realTimestamp = Number(timeOffset + BigInt(decoderEpoch));
      const date = new Date(realTimestamp);

      // Binary string padded to 64 chars
      const binaryStr = id.toString(2).padStart(64, '0');

      return {
        success: true,
        timestamp: realTimestamp,
        date,
        datacenterId: Number(dcVal),
        workerId: Number(wrkVal),
        processId: Number(procVal),
        sequence: Number(seqVal),
        binaryStr,
      };
    } catch {
      return {
        success: false,
        error: 'Invalid Snowflake ID format. Ensure it is a valid 64-bit unsigned integer.'
      };
    }
  }, [decodeIdInput, decoderEpoch, decTimestampBits, decDatacenterBits, decWorkerBits, decProcessBits, decSequenceBits]);

  const successData = useMemo(() => {
    if (decodedData && decodedData.success) {
      return decodedData;
    }
    return null;
  }, [decodedData]);

  // Visual Bit Segments for Interactive Binary Visualizer
  const bitSlices = useMemo(() => {
    if (!successData) return [];

    const raw = successData.binaryStr;
    const slices = [];

    // MSB Sign Bit
    slices.push({
      bitIndex: 0,
      val: raw[0],
      group: 'Sign',
      color: 'bg-muted-foreground/30 hover:bg-muted-foreground/50 border-muted-foreground/40 text-muted-foreground',
      desc: 'Unused sign bit. Always 0 for positive numbers.'
    });

    let currentIdx = 1;

    // Timestamp
    for (let i = 0; i < decTimestampBits; i++) {
      slices.push({
        bitIndex: currentIdx,
        val: raw[currentIdx],
        group: 'Timestamp',
        color: 'bg-blue-500 hover:bg-blue-600 border-blue-400 text-white',
        desc: `Timestamp offset in ms since epoch. Extracted: ${successData.date.toUTCString()}`
      });
      currentIdx++;
    }

    // Datacenter
    for (let i = 0; i < decDatacenterBits; i++) {
      slices.push({
        bitIndex: currentIdx,
        val: raw[currentIdx],
        group: PRESETS[decoderPreset]?.labels.datacenter || 'Datacenter',
        color: 'bg-purple-500 hover:bg-purple-600 border-purple-400 text-white',
        desc: `Machine/Datacenter/Shard Node ID. Extracted: ${successData.datacenterId}`
      });
      currentIdx++;
    }

    // Worker
    for (let i = 0; i < decWorkerBits; i++) {
      slices.push({
        bitIndex: currentIdx,
        val: raw[currentIdx],
        group: PRESETS[decoderPreset]?.labels.worker || 'Worker',
        color: 'bg-pink-500 hover:bg-pink-600 border-pink-400 text-white',
        desc: `Machine/Worker identifier. Extracted: ${successData.workerId}`
      });
      currentIdx++;
    }

    // Process
    for (let i = 0; i < decProcessBits; i++) {
      slices.push({
        bitIndex: currentIdx,
        val: raw[currentIdx],
        group: PRESETS[decoderPreset]?.labels.process || 'Process',
        color: 'bg-teal-500 hover:bg-teal-600 border-teal-400 text-white',
        desc: `Process thread/worker ID. Extracted: ${successData.processId}`
      });
      currentIdx++;
    }

    // Sequence
    for (let i = 0; i < decSequenceBits; i++) {
      slices.push({
        bitIndex: currentIdx,
        val: raw[currentIdx],
        group: 'Sequence',
        color: 'bg-amber-500 hover:bg-amber-600 border-amber-400 text-white',
        desc: `Incrementing sequence for IDs in the same millisecond. Extracted: ${successData.sequence}`
      });
      currentIdx++;
    }

    return slices;
  }, [successData, decTimestampBits, decDatacenterBits, decWorkerBits, decProcessBits, decSequenceBits, decoderPreset]);

  // Quick inspect launcher from generator table
  const handleInspectId = (id: string) => {
    setDecodeIdInput(id);
    setDecoderPreset(preset);
    setActiveTab('decode');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopyIndividual = async (id: string, index: number) => {
    await copyToClipboard(id);
    setCopiedIdIndex(index);
    setTimeout(() => setCopiedIdIndex(null), 2000);
  };

  const handleCopyAll = async () => {
    const idsText = generatedIds.map((item) => item.id).join('\n');
    await copyToClipboard(idsText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Export as JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(generatedIds, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `snowflake-ids-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export as CSV
  const handleExportCsv = () => {
    const headers = ['ID', 'Timestamp_MS', 'UTC_Date', 'Node_A_ID', 'Node_B_ID', 'Node_C_ID', 'Sequence'];
    const rows = generatedIds.map((item) => [
      item.id,
      item.timestamp,
      item.utcDate,
      item.datacenterId,
      item.workerId,
      item.processId,
      item.sequence,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `snowflake-ids-${Date.now()}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Relative Time Decoder helper
  const getRelativeTime = (time: number) => {
    const now = Date.now();
    const diff = now - time;
    const absDiff = Math.abs(diff);

    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);

    const suffix = diff > 0 ? 'ago' : 'in the future';

    if (seconds < 60) return `just now / ${seconds}s ${suffix}`;
    if (minutes < 60) return `${minutes}m ${suffix}`;
    if (hours < 24) return `${hours}h ${suffix}`;
    if (days < 365) return `${days}d ${suffix}`;
    return `${years}y ${suffix}`;
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
                  <label className="text-sm font-medium">Preset Format</label>
                  <Select value={preset} onValueChange={(val) => setPreset(val as PresetType)}>
                    <SelectTrigger className="w-full">
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
                    <TooltipSimple content={PRESETS[preset].epochLabel}>
                      <div className="font-mono text-[11px] text-right truncate">
                        {PRESETS[preset].epochLabel}
                      </div>
                    </TooltipSimple>
                    <div>Timestamp Bits:</div>
                    <div className="font-mono text-right">{timestampBits} bits</div>
                    {datacenterBits > 0 && (
                      <>
                        <div>{PRESETS[preset].labels.datacenter || 'Datacenter Bits'}:</div>
                        <div className="font-mono text-right">{datacenterBits} bits</div>
                      </>
                    )}
                    {workerBits > 0 && (
                      <>
                        <div>{PRESETS[preset].labels.worker || 'Worker Bits'}:</div>
                        <div className="font-mono text-right">{workerBits} bits</div>
                      </>
                    )}
                    {processBits > 0 && (
                      <>
                        <div>{PRESETS[preset].labels.process || 'Process Bits'}:</div>
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
                        <Slider value={timestampBits} min={20} max={50} step={1} onChange={setTimestampBits} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Node A Width (e.g. Datacenter):</span>
                          <span className="font-mono text-primary font-bold">{datacenterBits} bits</span>
                        </label>
                        <Slider value={datacenterBits} min={0} max={20} step={1} onChange={setDatacenterBits} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Node B Width (e.g. Worker):</span>
                          <span className="font-mono text-primary font-bold">{workerBits} bits</span>
                        </label>
                        <Slider value={workerBits} min={0} max={20} step={1} onChange={setWorkerBits} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Node C Width (e.g. Process):</span>
                          <span className="font-mono text-primary font-bold">{processBits} bits</span>
                        </label>
                        <Slider value={processBits} min={0} max={20} step={1} onChange={setProcessBits} />
                      </div>

                      <div>
                        <label className="flex justify-between text-xs mb-1 font-medium">
                          <span>Sequence Width:</span>
                          <span className="font-mono text-primary font-bold">{sequenceBits} bits</span>
                        </label>
                        <Slider value={sequenceBits} min={6} max={20} step={1} onChange={setSequenceBits} />
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <label className="text-xs font-semibold flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Custom Epoch
                      </label>
                      <Input
                        type="datetime-local"
                        step="0.001"
                        value={epochDateStr}
                        onChange={(e) => handleEpochDateChange(e.target.value)}
                        className="text-xs"
                      />
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                        <span>Unix epoch (ms):</span>
                        <span>{epoch}</span>
                      </div>
                    </div>

                    {bitConfigError && (
                      <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium">
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
                        <span>{PRESETS[preset].labels.datacenter || 'Datacenter ID'}:</span>
                        <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{datacenterId}</span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={maxDatacenterVal}
                        value={datacenterId}
                        onChange={(e) => setDatacenterId(Math.min(maxDatacenterVal, Math.max(0, Number(e.target.value))))}
                        className="h-8 text-xs font-mono"
                      />
                      <span className="text-[10px] text-muted-foreground">Range: 0 - {maxDatacenterVal} ({datacenterBits} bits)</span>
                    </div>
                  )}

                  {workerBits > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span>{PRESETS[preset].labels.worker || 'Worker ID'}:</span>
                        <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{workerId}</span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={maxWorkerVal}
                        value={workerId}
                        onChange={(e) => setWorkerId(Math.min(maxWorkerVal, Math.max(0, Number(e.target.value))))}
                        className="h-8 text-xs font-mono"
                      />
                      <span className="text-[10px] text-muted-foreground">Range: 0 - {maxWorkerVal} ({workerBits} bits)</span>
                    </div>
                  )}

                  {processBits > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span>{PRESETS[preset].labels.process || 'Process ID'}:</span>
                        <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{processId}</span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={maxProcessVal}
                        value={processId}
                        onChange={(e) => setProcessId(Math.min(maxProcessVal, Math.max(0, Number(e.target.value))))}
                        className="h-8 text-xs font-mono"
                      />
                      <span className="text-[10px] text-muted-foreground">Range: 0 - {maxProcessVal} ({processBits} bits)</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span>Start Sequence:</span>
                      <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{sequenceVal}</span>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={maxSequenceVal}
                      value={sequenceVal}
                      onChange={(e) => setSequenceVal(Math.min(maxSequenceVal, Math.max(0, Number(e.target.value))))}
                      className="h-8 text-xs font-mono"
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
                    <Switch checked={useCurrentTime} onCheckedChange={setUseCurrentTime} />
                  </div>

                  {!useCurrentTime && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Custom Timestamp Date</label>
                      <Input
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
                    <Slider value={count} min={1} max={100} step={1} onChange={setCount} />
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
              </CardContent>
            </Card>
          </div>

          {/* Results section */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="shadow-lg border-border/60 h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between border-b pb-4 shrink-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    Generated IDs
                  </CardTitle>
                  <CardDescription>Generated Snowflake strings.</CardDescription>
                </div>
                {generatedIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <TooltipSimple content="Copy all IDs">
                      <Button variant="ghost" size="sm" onClick={handleCopyAll} aria-label="Copy all IDs">
                        {copiedAll ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
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
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-[300px] flex flex-col overflow-hidden">
                {generatedIds.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 sm:p-8 text-center space-y-2 flex-1">
                    <Info className="h-8 w-8 stroke-[1.5]" />
                    <p className="text-sm font-medium">No Snowflake IDs generated yet.</p>
                    <p className="text-xs">Adjust configuration on the left and click Generate.</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[600px] flex-1">
                    <div className="divide-y divide-border/60 pr-3">
                      {generatedIds.map((item, index) => (
                        <div key={item.id} className="p-4 hover:bg-muted/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-base font-bold select-all tracking-tight break-all text-primary">
                                {item.id}
                              </span>
                              <Badge variant="outline" className="text-[10px] py-0 font-mono tracking-wider shrink-0 uppercase">
                                {preset}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(item.timestamp).toLocaleString()}
                              </span>
                              {datacenterBits > 0 && (
                                <span>
                                  {PRESETS[preset].labels.datacenter?.split(' ')[0] || 'Node A'}: <strong className="font-mono text-foreground">{item.datacenterId}</strong>
                                </span>
                              )}
                              {workerBits > 0 && (
                                <span>
                                  {PRESETS[preset].labels.worker?.split(' ')[0] || 'Node B'}: <strong className="font-mono text-foreground">{item.workerId}</strong>
                                </span>
                              )}
                              {processBits > 0 && (
                                <span>
                                  {PRESETS[preset].labels.process?.split(' ')[0] || 'Node C'}: <strong className="font-mono text-foreground">{item.processId}</strong>
                                </span>
                              )}
                              <span>
                                Seq: <strong className="font-mono text-foreground">{item.sequence}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-xs h-8 px-2.5"
                              onClick={() => handleInspectId(item.id)}
                            >
                              Decode
                              <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopyIndividual(item.id, index)}
                            >
                              {copiedIdIndex === index ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
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
                    onChange={(e) => setDecodeIdInput(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
                <div className="w-full sm:w-64">
                  <Select value={decoderPreset} onValueChange={(val) => setDecoderPreset(val as PresetType)}>
                    <SelectTrigger className="h-11">
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
                    <label className="text-xs font-semibold">Timestamp Bits</label>
                    <Input
                      type="number"
                      value={decTimestampBits}
                      onChange={(e) => setDecTimestampBits(Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Node A Bits</label>
                    <Input
                      type="number"
                      value={decDatacenterBits}
                      onChange={(e) => setDecDatacenterBits(Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Node B Bits</label>
                    <Input
                      type="number"
                      value={decWorkerBits}
                      onChange={(e) => setDecWorkerBits(Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Node C Bits</label>
                    <Input
                      type="number"
                      value={decProcessBits}
                      onChange={(e) => setDecProcessBits(Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Sequence Bits</label>
                    <Input
                      type="number"
                      value={decSequenceBits}
                      onChange={(e) => setDecSequenceBits(Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-5 space-y-1 mt-1">
                    <label className="text-xs font-semibold">Custom Decoder Epoch (ms)</label>
                    <Input
                      type="number"
                      value={decoderEpoch}
                      onChange={(e) => setDecoderEpoch(Number(e.target.value))}
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
              {successData ? (
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
                        {hoveredBitIndex !== null ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Bit Position:
                              </span>
                              <span className="font-mono font-bold bg-muted px-2 py-0.5 rounded text-sm text-foreground">
                                #{63 - hoveredBitIndex} (Array Index: {hoveredBitIndex})
                              </span>
                              <Badge className="font-semibold uppercase tracking-wider text-[9px]">
                                {bitSlices[hoveredBitIndex].group}
                              </Badge>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Value:</span>
                              <span className="font-mono font-black text-lg text-primary">
                                {bitSlices[hoveredBitIndex].val}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground font-medium pt-0.5">
                              {bitSlices[hoveredBitIndex].desc}
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
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded bg-muted-foreground/30 border"></span>
                          <span>Sign (1 bit)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded bg-blue-500"></span>
                          <span>Timestamp ({decTimestampBits} bits)</span>
                        </div>
                        {decDatacenterBits > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-purple-500"></span>
                            <span>{PRESETS[decoderPreset]?.labels.datacenter || 'Datacenter'} ({decDatacenterBits} bits)</span>
                          </div>
                        )}
                        {decWorkerBits > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-pink-500"></span>
                            <span>{PRESETS[decoderPreset]?.labels.worker || 'Worker'} ({decWorkerBits} bits)</span>
                          </div>
                        )}
                        {decProcessBits > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-teal-500"></span>
                            <span>{PRESETS[decoderPreset]?.labels.process || 'Process'} ({decProcessBits} bits)</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded bg-amber-500"></span>
                          <span>Sequence ({decSequenceBits} bits)</span>
                        </div>
                      </div>

                      {/* Formatted binary splits */}
                      <div className="space-y-1.5 pt-2 border-t">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Binary Bit String:</span>
                        <div className="font-mono text-xs sm:text-sm bg-muted rounded-lg p-3 break-all flex flex-wrap gap-x-2 gap-y-1 font-semibold leading-relaxed">
                          <span className="text-muted-foreground border-b-2 border-muted-foreground/20">{successData!.binaryStr.slice(0, 1)}</span>
                          <span className="text-blue-500 border-b-2 border-blue-500/20">{successData!.binaryStr.slice(1, 1 + decTimestampBits)}</span>
                          {decDatacenterBits > 0 && (
                            <span className="text-purple-500 border-b-2 border-purple-500/20">
                              {successData!.binaryStr.slice(1 + decTimestampBits, 1 + decTimestampBits + decDatacenterBits)}
                            </span>
                          )}
                          {decWorkerBits > 0 && (
                            <span className="text-pink-500 border-b-2 border-pink-500/20">
                              {successData!.binaryStr.slice(
                                1 + decTimestampBits + decDatacenterBits,
                                1 + decTimestampBits + decDatacenterBits + decWorkerBits
                              )}
                            </span>
                          )}
                          {decProcessBits > 0 && (
                            <span className="text-teal-500 border-b-2 border-teal-500/20">
                              {successData!.binaryStr.slice(
                                1 + decTimestampBits + decDatacenterBits + decWorkerBits,
                                1 + decTimestampBits + decDatacenterBits + decWorkerBits + decProcessBits
                              )}
                            </span>
                          )}
                          <span className="text-amber-500 border-b-2 border-amber-500/20">
                            {successData!.binaryStr.slice(1 + decTimestampBits + decDatacenterBits + decWorkerBits + decProcessBits)}
                          </span>
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
                        <div className="flex py-3.5 px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">UTC Timestamp Date</div>
                          <div className="w-2/3 font-mono font-bold text-foreground select-all">{successData!.date.toUTCString()}</div>
                        </div>

                        <div className="flex py-3.5 px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Local Time</div>
                          <div className="w-2/3 font-mono font-bold text-foreground select-all">{successData!.date.toLocaleString()}</div>
                        </div>

                        <div className="flex py-3.5 px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Relative Time</div>
                          <div className="w-2/3 text-foreground font-medium">{getRelativeTime(successData!.timestamp)}</div>
                        </div>

                        <div className="flex py-3.5 px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Unix Milliseconds Offset</div>
                          <div className="w-2/3 font-mono text-foreground">
                            {successData!.timestamp - decoderEpoch} <span className="text-xs text-muted-foreground">(from Epoch base)</span>
                          </div>
                        </div>

                        <div className="flex py-3.5 px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Raw Timestamp (ms)</div>
                          <div className="w-2/3 font-mono text-foreground">{successData!.timestamp}</div>
                        </div>

                        {decDatacenterBits > 0 && (
                          <div className="flex py-3.5 px-6 items-center">
                            <div className="w-1/3 text-muted-foreground font-medium">{PRESETS[decoderPreset]?.labels.datacenter || 'Datacenter ID'}</div>
                            <div className="w-2/3 font-mono text-foreground font-bold">{successData!.datacenterId}</div>
                          </div>
                        )}

                        {decWorkerBits > 0 && (
                          <div className="flex py-3.5 px-6 items-center">
                            <div className="w-1/3 text-muted-foreground font-medium">{PRESETS[decoderPreset]?.labels.worker || 'Worker ID'}</div>
                            <div className="w-2/3 font-mono text-foreground font-bold">{successData!.workerId}</div>
                          </div>
                        )}

                        {decProcessBits > 0 && (
                          <div className="flex py-3.5 px-6 items-center">
                            <div className="w-1/3 text-muted-foreground font-medium">{PRESETS[decoderPreset]?.labels.process || 'Process ID'}</div>
                            <div className="w-2/3 font-mono text-foreground font-bold">{successData!.processId}</div>
                          </div>
                        )}

                        <div className="flex py-3.5 px-6 items-center">
                          <div className="w-1/3 text-muted-foreground font-medium">Sequence ID</div>
                          <div className="w-2/3 font-mono text-foreground font-bold">{successData!.sequence}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="rounded-xl bg-destructive/10 p-4 border border-destructive/20 text-destructive text-sm font-medium">
                  {decodedData.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Snowflake IDs: 64-bit integers that pack a millisecond timestamp, up to
 * three node fields and a per-millisecond sequence, most significant first:
 *
 *   [unused sign bit] timestamp | datacenter | worker | process | sequence
 *
 * A layout says how many bits each field gets and which epoch the timestamp
 * counts from. The fields fill either 63 bits (the sign bit stays unused, as
 * in Twitter's and Discord's IDs) or all 64 (as in Instagram's).
 *
 * IDs are handled as BigInt and returned as decimal strings, because a
 * JavaScript number cannot hold 64 bits. The clock is an argument, and
 * everything that can fail on user input returns a result object with a
 * readable message instead of throwing.
 */

export type SnowflakePresetId = 'twitter' | 'discord' | 'instagram' | 'custom';

export interface SnowflakeLayout {
  /** Unix milliseconds that the timestamp field counts from. */
  epoch: number;
  timestampBits: number;
  datacenterBits: number;
  workerBits: number;
  processBits: number;
  sequenceBits: number;
}

export interface SnowflakePreset {
  layout: SnowflakeLayout;
  /** What this format calls its node fields. A missing label means the field is unused. */
  labels: {
    datacenter?: string;
    worker?: string;
    process?: string;
  };
}

export const SNOWFLAKE_PRESETS: Record<SnowflakePresetId, SnowflakePreset> = {
  twitter: {
    layout: {
      epoch: 1288834974657, // 2010-11-04 01:42:54.657 UTC
      timestampBits: 41,
      datacenterBits: 5,
      workerBits: 5,
      processBits: 0,
      sequenceBits: 12,
    },
    labels: { datacenter: 'Datacenter ID', worker: 'Worker ID' },
  },
  discord: {
    layout: {
      epoch: 1420070400000, // 2015-01-01 UTC
      timestampBits: 41,
      datacenterBits: 0,
      workerBits: 5,
      processBits: 5,
      sequenceBits: 12,
    },
    labels: { worker: 'Worker ID', process: 'Process ID' },
  },
  instagram: {
    layout: {
      // `our_epoch` in Instagram's published ID function: 2011-08-24 21:07:01.721 UTC
      epoch: 1314220021721,
      timestampBits: 41,
      datacenterBits: 13, // the shard ID, kept in the datacenter field
      workerBits: 0,
      processBits: 0,
      sequenceBits: 10,
    },
    labels: { datacenter: 'Shard ID' },
  },
  custom: {
    layout: {
      epoch: 1704067200000, // 2024-01-01 UTC
      timestampBits: 41,
      datacenterBits: 5,
      workerBits: 5,
      processBits: 0,
      sequenceBits: 12,
    },
    labels: { datacenter: 'Node ID A', worker: 'Node ID B', process: 'Node ID C' },
  },
};

export type SnowflakeResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SnowflakeRequest {
  /** Timestamp of the first ID, in Unix milliseconds. */
  time: number;
  /** How many IDs to make, at least 1. */
  count: number;
  datacenterId?: number;
  workerId?: number;
  processId?: number;
  /** Sequence number of the first ID. Default 0. */
  startSequence?: number;
}

export interface SnowflakeId {
  id: string;
  /** Unix milliseconds stored in the ID. */
  timestamp: number;
  utcDate: string;
  datacenterId: number;
  workerId: number;
  processId: number;
  sequence: number;
}

export type SnowflakeField = 'sign' | 'timestamp' | 'datacenter' | 'worker' | 'process' | 'sequence';

export interface SnowflakeBitSegment {
  field: SnowflakeField;
  /** This field's bits, most significant first. */
  bits: string;
}

export interface DecodedSnowflake {
  /** Unix milliseconds: the stored offset plus the layout's epoch. */
  timestamp: number;
  /** Milliseconds since the layout's epoch, exactly as stored. */
  offset: number;
  datacenterId: number;
  workerId: number;
  processId: number;
  sequence: number;
  /** All 64 bits, most significant first. */
  binary: string;
  /** `binary` cut into its fields in order. Fields with no bits are left out. */
  segments: SnowflakeBitSegment[];
}

const ID_BITS = 64;
const MAX_ID = (1n << 64n) - 1n;

const WIDTHS: ReadonlyArray<readonly [Exclude<SnowflakeField, 'sign'>, keyof SnowflakeLayout, string]> = [
  ['timestamp', 'timestampBits', 'Timestamp'],
  ['datacenter', 'datacenterBits', 'Node A'],
  ['worker', 'workerBits', 'Node B'],
  ['process', 'processBits', 'Node C'],
  ['sequence', 'sequenceBits', 'Sequence'],
];

function ok<T>(value: T): SnowflakeResult<T> {
  return { ok: true, value };
}

function fail<T = never>(error: string): SnowflakeResult<T> {
  return { ok: false, error };
}

// ── Layout ────────────────────────────────────────────────────────────────────

/** Bits the fields take together, not counting an unused sign bit. */
export function totalBits(layout: SnowflakeLayout): number {
  return WIDTHS.reduce((sum, [, key]) => sum + layout[key], 0);
}

/**
 * Says what is wrong with a layout, or returns null when IDs can be made and
 * decoded with it.
 */
export function layoutProblem(layout: SnowflakeLayout): string | null {
  for (const [, key, label] of WIDTHS) {
    const bits = layout[key];
    if (!Number.isInteger(bits) || bits < 0 || bits > ID_BITS) {
      return `${label} bits must be a whole number from 0 to ${ID_BITS}.`;
    }
  }
  if (layout.timestampBits < 1) return 'The timestamp needs at least 1 bit.';

  const total = totalBits(layout);
  if (total !== ID_BITS - 1 && total !== ID_BITS) {
    return `Bit widths must sum to 63 bits (leaving the sign bit unused) or 64 bits. Current sum: ${total} bits.`;
  }
  if (!Number.isSafeInteger(layout.epoch)) {
    return 'The epoch must be a whole number of milliseconds.';
  }
  return null;
}

/** Largest value a field of `bits` bits holds: 31 for 5 bits, 0 for none. */
export function maxFieldValue(bits: number): number {
  if (!Number.isInteger(bits) || bits <= 0) return 0;
  return Math.min(2 ** bits - 1, Number.MAX_SAFE_INTEGER);
}

/** Brings a typed field value into its range as a whole number. */
export function clampFieldValue(value: number, bits: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(maxFieldValue(bits), Math.max(0, Math.trunc(value)));
}

/** An epoch as `2010-11-04 01:42:54.657 UTC`. */
export function formatEpochLabel(epoch: number): string {
  const date = new Date(epoch);
  if (Number.isNaN(date.getTime())) return 'Invalid epoch';
  return `${date.toISOString().replace('T', ' ').slice(0, -1)} UTC`;
}

/** Where each field starts, counted from the least significant bit. */
function shifts(layout: SnowflakeLayout) {
  const process = BigInt(layout.sequenceBits);
  const worker = process + BigInt(layout.processBits);
  const datacenter = worker + BigInt(layout.workerBits);
  const timestamp = datacenter + BigInt(layout.datacenterBits);
  return { process, worker, datacenter, timestamp };
}

function mask(bits: number): bigint {
  return (1n << BigInt(bits)) - 1n;
}

// ── Generating ────────────────────────────────────────────────────────────────

/**
 * Makes `count` IDs starting at `time`. The sequence counts up from
 * `startSequence`; when it runs past its field the timestamp moves on by one
 * millisecond, as a real generator waits for the next tick, so a batch is
 * always strictly increasing and never repeats an ID.
 *
 * Node and sequence values are brought into their fields' ranges first. The
 * call fails when the layout is unusable or the timestamps cannot be stored:
 * before the epoch, or too far after it for the timestamp width.
 */
export function generateSnowflakeIds(
  layout: SnowflakeLayout,
  request: SnowflakeRequest
): SnowflakeResult<SnowflakeId[]> {
  const problem = layoutProblem(layout);
  if (problem) return fail(problem);

  const { count } = request;
  if (!Number.isInteger(count) || count < 1) {
    return fail('The count must be a whole number of at least 1.');
  }
  if (!Number.isFinite(request.time)) return fail('Enter a valid timestamp.');
  const time = Math.floor(request.time);

  const datacenterId = clampFieldValue(request.datacenterId ?? 0, layout.datacenterBits);
  const workerId = clampFieldValue(request.workerId ?? 0, layout.workerBits);
  const processId = clampFieldValue(request.processId ?? 0, layout.processBits);
  const startSequence = clampFieldValue(request.startSequence ?? 0, layout.sequenceBits);
  const sequenceSize = 2 ** layout.sequenceBits;

  if (time < layout.epoch) {
    return fail(
      `The timestamp is before the epoch (${formatEpochLabel(layout.epoch)}), so it cannot be stored in an ID.`
    );
  }
  const lastTime = time + Math.floor((startSequence + count - 1) / sequenceSize);
  if (BigInt(lastTime) - BigInt(layout.epoch) > mask(layout.timestampBits)) {
    return fail(
      `The timestamp does not fit in ${layout.timestampBits} bits after this epoch. ` +
        'Use a later epoch or a wider timestamp.'
    );
  }

  const shift = shifts(layout);
  const epoch = BigInt(layout.epoch);
  const nodeBits =
    (BigInt(datacenterId) << shift.datacenter) |
    (BigInt(workerId) << shift.worker) |
    (BigInt(processId) << shift.process);

  const ids: SnowflakeId[] = [];
  for (let i = 0; i < count; i++) {
    const step = startSequence + i;
    const timestamp = time + Math.floor(step / sequenceSize);
    const sequence = step % sequenceSize;
    const id = ((BigInt(timestamp) - epoch) << shift.timestamp) | nodeBits | BigInt(sequence);

    ids.push({
      id: id.toString(),
      timestamp,
      utcDate: new Date(timestamp).toUTCString(),
      datacenterId,
      workerId,
      processId,
      sequence,
    });
  }
  return ok(ids);
}

// ── Decoding ──────────────────────────────────────────────────────────────────

function parseId(text: string): bigint | null {
  try {
    const id = BigInt(text);
    return id >= 0n && id <= MAX_ID ? id : null;
  } catch {
    return null;
  }
}

/**
 * Splits an ID into its fields. Returns null for blank input, so a caller
 * can tell "nothing to decode yet" from a real error.
 */
export function decodeSnowflake(
  input: string,
  layout: SnowflakeLayout
): SnowflakeResult<DecodedSnowflake> | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const problem = layoutProblem(layout);
  if (problem) return fail(problem);

  const id = parseId(trimmed);
  if (id === null) {
    return fail('Invalid Snowflake ID format. Ensure it is a valid 64-bit unsigned integer.');
  }

  const shift = shifts(layout);
  const offset = (id >> shift.timestamp) & mask(layout.timestampBits);
  const binary = id.toString(2).padStart(ID_BITS, '0');

  const segments: SnowflakeBitSegment[] = [];
  let position = ID_BITS - totalBits(layout);
  if (position > 0) segments.push({ field: 'sign', bits: binary.slice(0, position) });
  for (const [field, key] of WIDTHS) {
    const bits = layout[key];
    if (bits > 0) segments.push({ field, bits: binary.slice(position, position + bits) });
    position += bits;
  }

  return ok({
    timestamp: Number(offset + BigInt(layout.epoch)),
    offset: Number(offset),
    datacenterId: Number((id >> shift.datacenter) & mask(layout.datacenterBits)),
    workerId: Number((id >> shift.worker) & mask(layout.workerBits)),
    processId: Number((id >> shift.process) & mask(layout.processBits)),
    sequence: Number(id & mask(layout.sequenceBits)),
    binary,
    segments,
  });
}

/** How far `time` is from `now`, in the largest whole unit: `5m ago`, `2y in the future`. */
export function relativeTimeLabel(time: number, now: number): string {
  const diff = now - time;
  const seconds = Math.floor(Math.abs(diff) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const suffix = diff > 0 ? 'ago' : 'in the future';

  if (seconds < 60) return `just now / ${seconds}s ${suffix}`;
  if (minutes < 60) return `${minutes}m ${suffix}`;
  if (hours < 24) return `${hours}h ${suffix}`;
  if (days < 365) return `${days}d ${suffix}`;
  return `${Math.floor(days / 365)}y ${suffix}`;
}

// ── Export ────────────────────────────────────────────────────────────────────

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Generated IDs as CSV with a header row. Fields that contain a comma are quoted. */
export function snowflakeIdsToCsv(ids: SnowflakeId[]): string {
  const header = ['ID', 'Timestamp_MS', 'UTC_Date', 'Node_A_ID', 'Node_B_ID', 'Node_C_ID', 'Sequence'];
  const rows = ids.map((item) => [
    item.id,
    item.timestamp,
    item.utcDate,
    item.datacenterId,
    item.workerId,
    item.processId,
    item.sequence,
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
}

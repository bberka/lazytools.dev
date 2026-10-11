import {
  ANDROID_VENDOR_RULES,
  BOT_RULES,
  BROWSER_RULES,
  CONSOLE_RULES,
  CPU_RULES,
  DESKTOP_OPERATING_SYSTEMS,
  GENERIC_BOT_PATTERN,
  HTTP_CLIENT_RULES,
  IOS_WEBVIEW_PATTERN,
  NOT_A_BOT,
  OS_RULES,
  SAFARI_WITHOUT_VERSION,
  TV_RULES,
  WINDOWS_PHONE_VENDORS,
  type NamedRule,
} from './user-agent-parser-data';

// Logic for the User-Agent Parser: split a User-Agent string into browser,
// engine, operating system, device and CPU. Every field the string does not
// state is null, never a guess. No React and no DOM, so it runs in Node as
// well as in the browser.

export { USER_AGENT_SAMPLES, type UserAgentSample } from './user-agent-parser-data';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'tv' | 'console' | 'unknown';

/** What sent the request: a browser, a crawler, or a command-line tool or HTTP library. */
export type ClientKind = 'browser' | 'bot' | 'http-client' | 'unknown';

export interface NameVersion {
  name: string | null;
  version: string | null;
}

export interface DeviceInfo {
  type: DeviceType;
  vendor: string | null;
  model: string | null;
}

export interface ParsedUserAgent {
  /** The string that was parsed, whitespace tidied and any "User-Agent:" prefix removed. */
  userAgent: string;
  kind: ClientKind;
  /** For a bot or a command-line client this is the bot or tool, not a browser. */
  browser: NameVersion;
  engine: NameVersion;
  os: NameVersion;
  /** Bots and command-line clients are typed `bot`: an automated, non-browser client. */
  device: DeviceInfo;
  cpu: { architecture: string | null };
  /** Caveats about fields the string cannot answer reliably. */
  notes: string[];
}

export type ParseErrorCode = 'empty' | 'too-long';

export type ParseOutcome =
  | { ok: true; result: ParsedUserAgent }
  | { ok: false; code: ParseErrorCode; error: string };

/** Header size limits sit near 8 KB; anything longer is not a User-Agent. */
export const MAX_USER_AGENT_LENGTH = 8192;

export const DEVICE_TYPE_LABELS: Readonly<Record<DeviceType, string>> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet',
  bot: 'Bot or automated client',
  tv: 'TV',
  console: 'Game console',
  unknown: 'unknown',
};

export const CLIENT_KIND_LABELS: Readonly<Record<ClientKind, string>> = {
  browser: 'Browser',
  bot: 'Bot or crawler',
  'http-client': 'Command-line or HTTP client',
  unknown: 'unknown',
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** A version with underscores turned into dots, or null when it holds no digit. */
function cleanVersion(raw: string | undefined): string | null {
  if (!raw) return null;
  const version = raw.replace(/_/g, '.').replace(/^[.-]+|[.-]+$/g, '');
  return /\d/.test(version) ? version : null;
}

/** Tidy the pasted text: one line, no "User-Agent:" prefix, no wrapping quotes. */
function normalise(input: string): string {
  let ua = input.replace(/\s+/g, ' ').trim();
  ua = ua.replace(/^user-agent\s*:\s*/i, '');
  const first = ua.charAt(0);
  if ((first === '"' || first === "'") && ua.length > 1 && ua.endsWith(first)) {
    ua = ua.slice(1, -1).trim();
  }
  return ua;
}

function firstRuleMatch(rules: readonly NamedRule[], ua: string): { name: string; version: string | null } | null {
  for (const rule of rules) {
    const match = rule.pattern.exec(ua);
    if (match) return { name: rule.name, version: cleanVersion(match[1]) };
  }
  return null;
}

function detectClient(ua: string): { kind: ClientKind } & NameVersion {
  const tool = firstRuleMatch(HTTP_CLIENT_RULES, ua);
  if (tool) return { kind: 'http-client', ...tool };

  // Bots go before browsers: Googlebot's smartphone string carries Chrome/ and Safari/ tokens too.
  const bot = firstRuleMatch(BOT_RULES, ua);
  if (bot) return { kind: 'bot', ...bot };

  const generic = GENERIC_BOT_PATTERN.exec(ua);
  if (generic && !NOT_A_BOT.has(generic[1].toLowerCase())) {
    return { kind: 'bot', name: generic[1], version: cleanVersion(generic[2]) };
  }

  const browser = firstRuleMatch(BROWSER_RULES, ua);
  if (browser) return { kind: 'browser', ...browser };

  if (SAFARI_WITHOUT_VERSION.test(ua)) return { kind: 'browser', name: 'Safari', version: null };
  if (IOS_WEBVIEW_PATTERN.test(ua)) return { kind: 'browser', name: 'iOS WebView', version: null };
  return { kind: 'unknown', name: null, version: null };
}

function detectOs(ua: string): NameVersion {
  for (const rule of OS_RULES) {
    const match = rule.pattern.exec(ua);
    if (match) {
      return { name: rule.name, version: rule.version ? rule.version(match) : cleanVersion(match[1]) };
    }
  }
  return { name: null, version: null };
}

function detectEngine(ua: string, os: NameVersion): NameVersion {
  // Legacy Edge carries a Chrome/ token as well, so EdgeHTML is read first.
  const edgeHtml = /\bEdge\/([\d.]+)/.exec(ua);
  if (edgeHtml) return { name: 'EdgeHTML', version: cleanVersion(edgeHtml[1]) };

  const trident = /\bTrident\/([\d.]+)/.exec(ua);
  if (trident) return { name: 'Trident', version: cleanVersion(trident[1]) };

  const presto = /\bPresto\/([\d.]+)/.exec(ua);
  if (presto) return { name: 'Presto', version: cleanVersion(presto[1]) };

  const webkit = /\bAppleWebKit\/([\d.]+)/i.exec(ua);
  // Every browser on iOS is WebKit, whatever name it goes by.
  if (os.name === 'iOS') return { name: 'WebKit', version: cleanVersion(webkit?.[1]) };

  // Chrome 28 and later render with Blink. Googlebot writes Chrome/W.X.Y.Z, a
  // placeholder: still Blink, but with no version to report.
  const chromium = /\b(?:Chrome|Chromium|HeadlessChrome)\/([\w.]+)/i.exec(ua);
  if (chromium) {
    const major = parseInt(chromium[1], 10);
    if (Number.isNaN(major)) return { name: 'Blink', version: null };
    if (major >= 28) return { name: 'Blink', version: cleanVersion(chromium[1]) };
  }

  // "like Gecko" is a compatibility claim, not the engine.
  if (/\bGecko\/\d/.test(ua.replace(/\blike Gecko\b/gi, ''))) {
    return { name: 'Gecko', version: cleanVersion(/\brv:([\d.]+)/.exec(ua)?.[1]) };
  }

  if (webkit) return { name: 'WebKit', version: cleanVersion(webkit[1]) };
  return { name: null, version: null };
}

/**
 * The device model from the Android part of the UA ("Android 14; Pixel 8"),
 * or null. `reduced` is set for Chrome's reduced string ("Android 10; K"),
 * which hides the real version and model on purpose.
 */
function parseAndroidModel(ua: string): { model: string | null; reduced: boolean } {
  const match = /\bAndroid(?:\s[\d.]+)?;\s*(?:[a-z]{2}(?:[-_][a-z]{2,4})?;\s*)?([^;)]+)/i.exec(ua);
  if (!match) return { model: null, reduced: false };

  const model = match[1].replace(/\s+Build\/.*$/i, '').trim();
  if (model === 'K') return { model: null, reduced: true };
  // What follows "Android x;" is often a token of its own, not a model.
  if (!model || model.includes('/') || /^(?:U|Mobile|Tablet|wv|Linux|Android|rv:.*|generic.*|unknown)$/i.test(model)) {
    return { model: null, reduced: false };
  }
  return { model, reduced: false };
}

function androidVendor(model: string): { vendor: string; model: string } | null {
  for (const rule of ANDROID_VENDOR_RULES) {
    if (rule.pattern.test(model)) {
      return { vendor: rule.vendor, model: rule.strip ? model.replace(rule.strip, '') || model : model };
    }
  }
  return null;
}

function detectDevice(ua: string, os: NameVersion, androidModel: string | null): DeviceInfo {
  for (const rule of CONSOLE_RULES) {
    const match = rule.pattern.exec(ua);
    if (match) return { type: 'console', vendor: rule.vendor, model: rule.model(match) };
  }

  const android = androidModel ? androidVendor(androidModel) : null;

  for (const rule of TV_RULES) {
    const match = rule.pattern.exec(ua);
    if (match) {
      return {
        type: 'tv',
        vendor: rule.vendor ?? android?.vendor ?? null,
        model: rule.model(match) ?? android?.model ?? androidModel,
      };
    }
  }

  // Windows Phone 8.1 and 10 also mention iPhone or Android, so it is read before either.
  if (os.name === 'Windows Phone') {
    const parts = (/\(([^)]*)\)/.exec(ua)?.[1] ?? '').split(';').map((part) => part.trim());
    const index = parts.findIndex((part) => part.toLowerCase() in WINDOWS_PHONE_VENDORS);
    return index >= 0 && parts[index + 1]
      ? { type: 'mobile', vendor: WINDOWS_PHONE_VENDORS[parts[index].toLowerCase()], model: parts[index + 1] }
      : { type: 'mobile', vendor: null, model: null };
  }

  // iPod before iPhone: an iPod touch UA says "CPU iPhone OS".
  if (/\biPad\b/.test(ua)) return { type: 'tablet', vendor: 'Apple', model: 'iPad' };
  if (/\biPod\b/.test(ua)) return { type: 'mobile', vendor: 'Apple', model: 'iPod touch' };
  if (/\biPhone\b/.test(ua)) return { type: 'mobile', vendor: 'Apple', model: 'iPhone' };
  if (/\bMacintosh\b/.test(ua)) return { type: 'desktop', vendor: 'Apple', model: 'Macintosh' };

  const isPhone = /\bMobi|Opera Mini/i.test(ua);
  if (os.name === 'Android') {
    // Chrome and Firefox both leave "Mobile" out of a tablet's string. Firefox also says "Tablet".
    const type: DeviceType = /\bTablet\b/i.test(ua) || !isPhone ? 'tablet' : 'mobile';
    return { type, vendor: android?.vendor ?? null, model: android?.model ?? androidModel };
  }

  if (isPhone || os.name === 'KaiOS') return { type: 'mobile', vendor: null, model: null };
  if (os.name && DESKTOP_OPERATING_SYSTEMS.has(os.name)) return { type: 'desktop', vendor: null, model: null };
  return { type: 'unknown', vendor: null, model: null };
}

function detectCpu(ua: string): string | null {
  for (const rule of CPU_RULES) {
    if (rule.pattern.test(ua)) return rule.architecture;
  }
  return null;
}

function buildNotes(
  ua: string,
  kind: ClientKind,
  os: NameVersion,
  device: DeviceInfo,
  reducedAndroid: boolean,
): string[] {
  const notes: string[] = [];
  if (os.name === 'Windows' && os.version === '10 or 11' && device.type === 'desktop') {
    notes.push('Windows 11 also reports Windows NT 10.0, so Windows 10 and 11 cannot be told apart from this string.');
  }
  if (os.name === 'macOS' && os.version?.startsWith('10.15')) {
    notes.push('Browsers freeze the macOS version at 10.15.7, so the real version may be newer.');
  }
  if (/\bIntel Mac OS X\b/.test(ua)) {
    notes.push('Apple silicon Macs also report Intel, so the CPU architecture is left unknown.');
  }
  if (reducedAndroid) {
    notes.push(
      "Chrome's reduced User-Agent freezes the Android version and replaces the device model with K, so both are left unknown.",
    );
  }
  if (kind === 'bot') {
    notes.push('A bot names itself, and anyone can copy the name. Verify crawlers by reverse DNS before trusting them.');
  }
  return notes;
}

/** Parse a User-Agent string. Returns an error result for empty or oversized input, never throws. */
export function parseUserAgent(input: string): ParseOutcome {
  if (typeof input !== 'string') {
    return { ok: false, code: 'empty', error: 'Enter a User-Agent string to parse.' };
  }
  if (input.length > MAX_USER_AGENT_LENGTH * 4) {
    return { ok: false, code: 'too-long', error: `A User-Agent is at most ${MAX_USER_AGENT_LENGTH} characters long.` };
  }

  const userAgent = normalise(input);
  if (!userAgent) {
    return { ok: false, code: 'empty', error: 'Enter a User-Agent string to parse.' };
  }
  if (userAgent.length > MAX_USER_AGENT_LENGTH) {
    return { ok: false, code: 'too-long', error: `A User-Agent is at most ${MAX_USER_AGENT_LENGTH} characters long.` };
  }

  const client = detectClient(userAgent);
  const android = parseAndroidModel(userAgent);

  let os = detectOs(userAgent);
  if (android.reduced && os.name === 'Android') os = { name: 'Android', version: null };

  const engine = detectEngine(userAgent, os);
  const device = detectDevice(userAgent, os, android.model);
  if (client.kind === 'bot' || client.kind === 'http-client') device.type = 'bot';

  const result: ParsedUserAgent = {
    userAgent,
    kind: client.kind,
    browser: { name: client.name, version: client.version },
    engine,
    os,
    device,
    cpu: { architecture: detectCpu(userAgent) },
    notes: buildNotes(userAgent, client.kind, os, device, android.reduced),
  };
  return { ok: true, result };
}

/** True when at least one field was recognised, so the UI can tell "parsed" from "gibberish". */
export function isRecognised(result: ParsedUserAgent): boolean {
  return (
    result.browser.name !== null ||
    result.engine.name !== null ||
    result.os.name !== null ||
    result.device.type !== 'unknown' ||
    result.cpu.architecture !== null
  );
}

/** The result as pretty-printed JSON. Unknown fields stay `null`. */
export function resultToJson(result: ParsedUserAgent): string {
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// Client hints (navigator.userAgentData)
// ---------------------------------------------------------------------------

export interface ClientHintBrand {
  brand: string;
  version: string;
  /** Browsers add a made-up brand such as "Not A;Brand" to stop sites matching on the list. */
  placeholder: boolean;
}

export interface ClientHints {
  brands: ClientHintBrand[];
  mobile: boolean | null;
  platform: string | null;
}

const PLACEHOLDER_BRAND = /^[^a-z0-9]*Not[^a-z0-9]*A[^a-z0-9]*Brand[^a-z0-9]*$/i;

/**
 * Read the low-entropy client hints from `navigator.userAgentData`. The
 * caller passes the value in, so this stays free of the DOM. Returns null
 * when the browser does not have the API.
 */
export function readClientHints(data: unknown): ClientHints | null {
  if (typeof data !== 'object' || data === null) return null;
  const source = data as { brands?: unknown; mobile?: unknown; platform?: unknown };

  const brands: ClientHintBrand[] = [];
  if (Array.isArray(source.brands)) {
    for (const entry of source.brands as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { brand, version } = entry as { brand?: unknown; version?: unknown };
      if (typeof brand !== 'string' || typeof version !== 'string') continue;
      brands.push({ brand, version, placeholder: PLACEHOLDER_BRAND.test(brand) });
    }
  }

  return {
    brands,
    mobile: typeof source.mobile === 'boolean' ? source.mobile : null,
    platform: typeof source.platform === 'string' && source.platform ? source.platform : null,
  };
}

// Rule tables for the User-Agent parser. The order of every list matters: the
// first rule that matches wins, so a more specific token (Edg/, OPR/, CriOS/)
// must sit above the generic one it also contains (Chrome/, Safari/).

/** A product that is recognised by a token. Group 1 of the pattern is its version. */
export interface NamedRule {
  name: string;
  pattern: RegExp;
}

export interface OsRule {
  name: string;
  pattern: RegExp;
  /** Overrides the default of reading group 1. Return null for "no version". */
  version?: (match: RegExpExecArray) => string | null;
}

export interface DeviceRule {
  pattern: RegExp;
  vendor: string | null;
  model: (match: RegExpExecArray) => string | null;
}

export interface VendorRule {
  vendor: string;
  /** Tested against the model string taken from the Android part of the UA. */
  pattern: RegExp;
  /** Removed from the front of the model, for example "SAMSUNG " in "SAMSUNG SM-G900F". */
  strip?: RegExp;
}

export interface CpuRule {
  architecture: string;
  pattern: RegExp;
}

export interface UserAgentSample {
  id: string;
  label: string;
  userAgent: string;
}

// ---------------------------------------------------------------------------
// Command-line tools and HTTP libraries. Anchored to the start of the string:
// these send nothing but their own product token, and the anchor keeps a
// browser that merely mentions one of them from matching.
// ---------------------------------------------------------------------------

export const HTTP_CLIENT_RULES: readonly NamedRule[] = [
  { name: 'curl', pattern: /^curl\/([\d.]+)/i },
  { name: 'Wget', pattern: /^Wget(?:\/([\d.]+))?/i },
  { name: 'HTTPie', pattern: /^HTTPie\/([\d.]+)/i },
  { name: 'Postman', pattern: /^PostmanRuntime\/([\d.]+)/i },
  { name: 'Insomnia', pattern: /^insomnia\/([\d.]+)/i },
  { name: 'python-requests', pattern: /^python-requests\/([\d.]+)/i },
  { name: 'python-httpx', pattern: /^python-httpx\/([\d.]+)/i },
  { name: 'urllib (Python)', pattern: /^Python-urllib\/([\d.]+)/i },
  { name: 'aiohttp', pattern: /^Python\/[\d.]+ aiohttp\/([\d.]+)/i },
  { name: 'Go http client', pattern: /^Go-http-client\/([\d.]+)/i },
  { name: 'Java', pattern: /^Java\/([\d.]+)/i },
  { name: 'Apache HttpClient', pattern: /^Apache-HttpClient\/([\d.]+)/i },
  { name: 'libwww-perl', pattern: /^libwww-perl\/([\d.]+)/i },
  { name: 'node-fetch', pattern: /^node-fetch\/([\d.]+)/i },
  { name: 'axios', pattern: /^axios\/([\d.]+)/i },
];

// ---------------------------------------------------------------------------
// Named crawlers and fetchers. More specific variants come before the family
// name they share (Googlebot-Image before Googlebot).
// ---------------------------------------------------------------------------

export const BOT_RULES: readonly NamedRule[] = [
  { name: 'Googlebot-Image', pattern: /\bGooglebot-Image\/([\d.]+)/i },
  { name: 'Googlebot-Video', pattern: /\bGooglebot-Video\/([\d.]+)/i },
  { name: 'Googlebot-News', pattern: /\bGooglebot-News\b(?:\/([\d.]+))?/i },
  { name: 'Googlebot', pattern: /\bGooglebot\b(?:\/([\d.]+))?/i },
  { name: 'AdsBot-Google', pattern: /\bAdsBot-Google(?:-Mobile)?\b(?:\/([\d.]+))?/i },
  { name: 'Mediapartners-Google', pattern: /\bMediapartners-Google\b(?:\/([\d.]+))?/i },
  { name: 'Google-InspectionTool', pattern: /\bGoogle-InspectionTool\b(?:\/([\d.]+))?/i },
  { name: 'GoogleOther', pattern: /\bGoogleOther\b(?:\/([\d.]+))?/i },
  { name: 'Storebot-Google', pattern: /\bStorebot-Google\b(?:\/([\d.]+))?/i },
  { name: 'APIs-Google', pattern: /\bAPIs-Google\b(?:\/([\d.]+))?/i },
  { name: 'FeedFetcher-Google', pattern: /\bFeedFetcher-Google\b(?:\/([\d.]+))?/i },
  { name: 'Bingbot', pattern: /\bbingbot\b(?:\/([\d.]+))?/i },
  { name: 'BingPreview', pattern: /\bBingPreview\b(?:\/([\d.]+))?/i },
  { name: 'msnbot', pattern: /\bmsnbot(?:-media)?\b(?:\/([\d.]+))?/i },
  { name: 'YandexBot', pattern: /\bYandexBot\b(?:\/([\d.]+))?/i },
  { name: 'Baiduspider', pattern: /\bBaiduspider(?:-[a-z]+)?\b(?:\/([\d.]+))?/i },
  { name: 'DuckDuckBot', pattern: /\bDuckDuckBot\b(?:\/([\d.]+))?/i },
  { name: 'Yahoo! Slurp', pattern: /\bYahoo! Slurp\b/i },
  { name: 'Sogou Spider', pattern: /\bSogou (?:web |inst |Pic |News )?spider\b(?:\/([\d.]+))?/i },
  { name: 'Applebot', pattern: /\bApplebot\b(?:\/([\d.]+))?/i },
  { name: 'facebookexternalhit', pattern: /\bfacebookexternalhit\b(?:\/([\d.]+))?/i },
  { name: 'Facebot', pattern: /\bFacebot\b(?:\/([\d.]+))?/i },
  { name: 'Twitterbot', pattern: /\bTwitterbot\b(?:\/([\d.]+))?/i },
  { name: 'LinkedInBot', pattern: /\bLinkedInBot\b(?:\/([\d.]+))?/i },
  { name: 'Slackbot', pattern: /\bSlack(?:bot|-ImgProxy)(?:-LinkExpanding)?\b(?:[\s/]([\d.]+))?/i },
  { name: 'Discordbot', pattern: /\bDiscordbot\b(?:\/([\d.]+))?/i },
  { name: 'TelegramBot', pattern: /\bTelegramBot\b/i },
  { name: 'Pinterestbot', pattern: /\bPinterestbot\/([\d.]+)/i },
  { name: 'Pinterest', pattern: /^Pinterest\/([\d.]+)/i },
  { name: 'WhatsApp', pattern: /^WhatsApp\/([\d.]+)/i },
  { name: 'GPTBot', pattern: /\bGPTBot\b(?:\/([\d.]+))?/i },
  { name: 'ChatGPT-User', pattern: /\bChatGPT-User\b(?:\/([\d.]+))?/i },
  { name: 'ClaudeBot', pattern: /\bClaudeBot\b(?:\/([\d.]+))?/i },
  { name: 'PerplexityBot', pattern: /\bPerplexityBot\b(?:\/([\d.]+))?/i },
  { name: 'CCBot', pattern: /\bCCBot\b(?:\/([\d.]+))?/i },
  { name: 'Bytespider', pattern: /\bBytespider\b(?:\/([\d.]+))?/i },
  { name: 'PetalBot', pattern: /\bPetalBot\b(?:\/([\d.]+))?/i },
  { name: 'AhrefsBot', pattern: /\bAhrefsBot\b(?:\/([\d.]+))?/i },
  { name: 'SemrushBot', pattern: /\bSemrushBot(?:-[A-Z]+)?\b(?:\/([\d.]+))?/i },
  { name: 'MJ12bot', pattern: /\bMJ12bot\b(?:\/v?([\d.]+))?/i },
  { name: 'DotBot', pattern: /\bDotBot\b(?:\/([\d.]+))?/i },
  { name: 'UptimeRobot', pattern: /\bUptimeRobot\b(?:\/([\d.]+))?/i },
  { name: 'Pingdom', pattern: /\bPingdom\.com_bot_version_([\d.]+)/i },
  { name: 'ia_archiver', pattern: /\bia_archiver\b/i },
  { name: 'Lighthouse', pattern: /\bChrome-Lighthouse\b/i },
];

/**
 * Catch-all for crawlers that are not in the list: a token that ends in
 * bot, crawler or spider, with an optional version. Group 1 is the whole
 * token, group 2 the version.
 */
export const GENERIC_BOT_PATTERN = /(?:^|[\s;(,/])([A-Za-z0-9._+-]*(?:bot|crawler|spider))\b(?:[/\s_-]v?(\d[\d.]*))?/i;

/** Tokens that end in "bot" but belong to a phone maker, not a crawler. */
export const NOT_A_BOT = new Set(['cubot']);

// ---------------------------------------------------------------------------
// Browsers. Read top to bottom: forks and wrappers first, then the engines
// they are built on. Anything that carries a Chrome/ or Safari/ token as well
// as its own has to sit above those two.
// ---------------------------------------------------------------------------

export const BROWSER_RULES: readonly NamedRule[] = [
  { name: 'Samsung Internet', pattern: /\bSamsungBrowser\/([\d.]+)/i },
  // Edg/ is Chromium Edge, EdgA/ and EdgiOS/ its mobile builds, Edge/ the old EdgeHTML one.
  { name: 'Edge', pattern: /\bEdg(?:e|A|iOS)?\/([\d.]+)/i },
  { name: 'Opera Mini', pattern: /\bOpera Mini\/([\d.]+)/i },
  { name: 'Opera', pattern: /\bOPR\/([\d.]+)/ },
  { name: 'Opera', pattern: /\bOPT\/([\d.]+)/ },
  { name: 'Opera', pattern: /\bOPiOS\/([\d.]+)/ },
  // Presto-era Opera: "Opera/9.80 (...) Presto/2.12 Version/12.16" carries its real version last.
  { name: 'Opera', pattern: /^Opera\/[\d.]+ .*\bVersion\/([\d.]+)/ },
  { name: 'Opera', pattern: /\bOpera[/ ]([\d.]+)/ },
  { name: 'Vivaldi', pattern: /\bVivaldi\/([\d.]+)/i },
  { name: 'Yandex Browser', pattern: /\bYaBrowser\/([\d.]+)/i },
  { name: 'UC Browser', pattern: /\bUCBrowser\/([\d.]+)/i },
  { name: 'Silk', pattern: /\bSilk\/([\d.]+)/i },
  { name: 'DuckDuckGo', pattern: /\bDuckDuckGo\/([\d.]+)/i },
  { name: 'MIUI Browser', pattern: /\bMiuiBrowser\/([\d.]+)/i },
  { name: 'Huawei Browser', pattern: /\bHuaweiBrowser\/([\d.]+)/i },
  { name: 'Nintendo Browser', pattern: /\bNintendoBrowser\/([\d.]+)/i },
  { name: 'Electron', pattern: /\bElectron\/([\d.]+)/i },
  { name: 'Facebook app', pattern: /\bFBAV\/([\d.]+)/ },
  { name: 'Instagram app', pattern: /\bInstagram ([\d.]+)/ },
  { name: 'SeaMonkey', pattern: /\bSeaMonkey\/([\d.]+)/i },
  { name: 'Waterfox', pattern: /\bWaterfox\/([\d.]+)/i },
  { name: 'Pale Moon', pattern: /\bPaleMoon\/([\d.]+)/i },
  // The iOS builds of Firefox and Chrome are WebKit wrappers: their UA has
  // FxiOS/ or CriOS/ plus a Safari/ token, and no Firefox/ or Chrome/ at all.
  { name: 'Firefox for iOS', pattern: /\bFxiOS\/([\d.]+)/i },
  { name: 'Chrome for iOS', pattern: /\bCriOS\/([\d.]+)/i },
  { name: 'Firefox', pattern: /\bFirefox\/([\d.]+)/i },
  { name: 'IE Mobile', pattern: /\bIEMobile[/ ]([\d.]+)/i },
  { name: 'Internet Explorer', pattern: /\bMSIE ([\d.]+)/i },
  // IE 11 dropped "MSIE" and says "Trident/7.0 ... rv:11.0" instead.
  { name: 'Internet Explorer', pattern: /\bTrident\/[\d.]+.*\brv:([\d.]+)/i },
  { name: 'Chrome Headless', pattern: /\bHeadlessChrome\/([\d.]+)/i },
  { name: 'Chromium', pattern: /\bChromium\/([\d.]+)/i },
  { name: 'Chrome WebView', pattern: /;\s*wv\).*\bChrome\/([\d.]+)/i },
  { name: 'Chrome', pattern: /\bChrome\/([\d.]+)/i },
  // The stock Android browser (before Chrome) says "Version/4.0 Mobile Safari/534.30",
  // which would read as Safari, so it has to come first.
  { name: 'Android Browser', pattern: /\bAndroid\b.*\bVersion\/([\d.]+)/i },
  // Safari puts its real version in Version/, not in Safari/ (which is the WebKit build).
  { name: 'Safari', pattern: /\bVersion\/([\d.]+).*\bSafari\//i },
];

/** A WebKit UA that names Safari but gives no Version/ token. The version is left unknown. */
export const SAFARI_WITHOUT_VERSION = /\bAppleWebKit\/[\d.]+.*\bSafari\//i;

/** An iOS app's embedded web view: WebKit and Mobile/, but no Safari/ token. */
export const IOS_WEBVIEW_PATTERN = /\bAppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Mobile\/\w+/i;

// ---------------------------------------------------------------------------
// Operating systems
// ---------------------------------------------------------------------------

/** "Windows NT x.y" to the name people use. Windows 11 still says 10.0. */
export const WINDOWS_NT_VERSIONS: Readonly<Record<string, string>> = {
  '4.0': 'NT 4.0',
  '5.0': '2000',
  '5.1': 'XP',
  '5.2': 'XP x64 or Server 2003',
  '6.0': 'Vista',
  '6.1': '7',
  '6.2': '8',
  '6.3': '8.1',
  '10.0': '10 or 11',
};

export const OS_RULES: readonly OsRule[] = [
  // Windows Phone 10 also says "Android 6.0.1", so it has to be read before Android.
  { name: 'Windows Phone', pattern: /\bWindows Phone(?: OS)? ([\d.]+)/i },
  {
    name: 'Windows',
    pattern: /\bWindows NT ([\d.]+)/i,
    version: (match) => WINDOWS_NT_VERSIONS[match[1]] ?? `NT ${match[1]}`,
  },
  { name: 'Windows', pattern: /\bWin(?:dows)?[ _]?(95|98|ME)\b/i, version: (match) => match[1].toUpperCase() },
  // iOS says "like Mac OS X", so it has to be read before macOS.
  { name: 'iOS', pattern: /\bOS ([\d_]+) like Mac OS X/i },
  { name: 'iOS', pattern: /\biOS[ /]([\d_.]+)/ },
  { name: 'iOS', pattern: /\b(?:iPhone|iPad|iPod)\b/, version: () => null },
  { name: 'Android', pattern: /\bAndroid(?:[ /-]([\d.]+))?/i },
  { name: 'Chrome OS', pattern: /\bCrOS\s+\S+\s+([\d.]+)/ },
  { name: 'KaiOS', pattern: /\bKaiOS\/([\d.]+)/i },
  { name: 'Tizen', pattern: /\bTizen(?:[ /]([\d.]+))?/i },
  { name: 'webOS', pattern: /\bWeb0S\b|\bwebOS\b/i, version: () => null },
  { name: 'PlayStation', pattern: /\bPlayStation(?: (?:\d|Vita|Portable))?[ /]([\d.]+)/i },
  { name: 'macOS', pattern: /\bMac OS X(?:[ _]([\d_.]+))?/i },
  { name: 'macOS', pattern: /\bMacintosh\b/, version: () => null },
  { name: 'Ubuntu', pattern: /\bUbuntu(?:[ /]([\d.]+))?/i },
  { name: 'Debian', pattern: /\bDebian\b/i },
  { name: 'Fedora', pattern: /\bFedora\b/i },
  { name: 'CentOS', pattern: /\bCentOS\b/i },
  { name: 'Red Hat', pattern: /\bRed ?Hat\b/i },
  { name: 'SUSE', pattern: /\bSUSE\b/i },
  { name: 'Gentoo', pattern: /\bGentoo\b/i },
  { name: 'Linux Mint', pattern: /\bLinux Mint\b/i },
  { name: 'Slackware', pattern: /\bSlackware\b/i },
  { name: 'FreeBSD', pattern: /\bFreeBSD\b/i },
  { name: 'OpenBSD', pattern: /\bOpenBSD\b/i },
  { name: 'NetBSD', pattern: /\bNetBSD\b/i },
  { name: 'SunOS', pattern: /\bSunOS\b/i },
  { name: 'Linux', pattern: /\bLinux\b/i, version: () => null },
];

/** Operating systems that mean a desktop or laptop when nothing says otherwise. */
export const DESKTOP_OPERATING_SYSTEMS: ReadonlySet<string> = new Set([
  'Windows',
  'macOS',
  'Chrome OS',
  'Linux',
  'Ubuntu',
  'Debian',
  'Fedora',
  'CentOS',
  'Red Hat',
  'SUSE',
  'Gentoo',
  'Linux Mint',
  'Slackware',
  'FreeBSD',
  'OpenBSD',
  'NetBSD',
  'SunOS',
]);

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export const CONSOLE_RULES: readonly DeviceRule[] = [
  { pattern: /\bPlayStation[ ](\d|Vita|Portable)\b/i, vendor: 'Sony', model: (match) => `PlayStation ${match[1]}` },
  { pattern: /\bPlayStation\b/i, vendor: 'Sony', model: () => 'PlayStation' },
  {
    pattern: /\bXbox[ ](One(?: [SX])?|Series [SX]|360)\b/i,
    vendor: 'Microsoft',
    model: (match) => `Xbox ${match[1]}`,
  },
  { pattern: /\bXbox\b/i, vendor: 'Microsoft', model: () => 'Xbox' },
  {
    pattern: /\bNintendo ?(Switch|Wii ?U|Wii|3DS|DSi|DS)\b/i,
    vendor: 'Nintendo',
    model: (match) => (/^wii ?u$/i.test(match[1]) ? 'Wii U' : match[1]),
  },
];

/** Smart TVs and TV sticks. A null model falls back to the model in the Android part of the UA. */
export const TV_RULES: readonly DeviceRule[] = [
  { pattern: /\bCrKey\b/, vendor: 'Google', model: () => 'Chromecast' },
  { pattern: /\bApple ?TV\b/i, vendor: 'Apple', model: () => 'Apple TV' },
  { pattern: /\bRoku\b/i, vendor: 'Roku', model: () => 'Roku' },
  { pattern: /\bAFT[A-Z0-9]{1,6}\b/, vendor: 'Amazon', model: (match) => `Fire TV (${match[0]})` },
  { pattern: /\bBRAVIA\b/i, vendor: 'Sony', model: () => null },
  // Generic smart-TV markers. The vendor is not named, so it stays unknown.
  { pattern: /\b(?:SMART-?TV|HbbTV|NetCast|GoogleTV|Android ?TV|Web0S)\b|\bTV Safari\//i, vendor: null, model: () => null },
];

/** Vendors that name themselves in a Windows Phone UA: "...; Touch; NOKIA; Lumia 920)". */
export const WINDOWS_PHONE_VENDORS: Readonly<Record<string, string>> = {
  nokia: 'Nokia',
  microsoft: 'Microsoft',
  htc: 'HTC',
  samsung: 'Samsung',
  huawei: 'Huawei',
  lg: 'LG',
  alcatel: 'Alcatel',
  acer: 'Acer',
  dell: 'Dell',
  lenovo: 'Lenovo',
  zte: 'ZTE',
};

/**
 * Maker of an Android phone or tablet, judged from the model string in the UA.
 * Only patterns that are specific to one maker are listed. A model that
 * matches none of them is shown with its vendor as unknown.
 */
export const ANDROID_VENDOR_RULES: readonly VendorRule[] = [
  { vendor: 'Google', pattern: /^(?:Pixel|Nexus)\b/i },
  {
    vendor: 'Samsung',
    pattern: /^(?:SAMSUNG[-_ ]?)?(?:SM|GT|SCH|SGH|SHV|SHW|SPH|SCV|SCG|SC)-[A-Z0-9]+|^SAMSUNG\b|^Galaxy\b/i,
    strip: /^SAMSUNG[-_ ]?/i,
  },
  {
    vendor: 'Xiaomi',
    pattern: /^(?:Redmi|POCO|Xiaomi|MIX\b|Mi ?(?:\d|Pad|Note|Max|Mix|A\d)|M\d{4}[A-Z]\d+[A-Z]*$|2\d{6,7}[A-Z]{1,2}\w*$)/i,
  },
  { vendor: 'Honor', pattern: /^HONOR\b/i },
  {
    vendor: 'Huawei',
    pattern: /^HUAWEI\b|^[A-Z]{3}-(?:L|AL|TL|LX|AN)\d+\w*$|^(?:MediaPad|MatePad)\b/i,
    strip: /^HUAWEI[-_ ]?/i,
  },
  { vendor: 'OnePlus', pattern: /^(?:ONEPLUS\b|(?:GM|IN|LE|KB|HD|NE|DN|BE)\d{4}$)/i },
  { vendor: 'OPPO', pattern: /^(?:OPPO\b|CPH\d{4}$|P[A-Z]{2,3}[MT]\d{2}$)/i },
  { vendor: 'realme', pattern: /^(?:realme\b|RMX\d{4}$)/i },
  { vendor: 'vivo', pattern: /^(?:vivo\b|V\d{4}[A-Z]{0,2}$)/i },
  { vendor: 'Motorola', pattern: /^(?:moto\b|motorola\b|XT\d{4})/i },
  { vendor: 'Sony', pattern: /^(?:Xperia|Sony|SO-\d+[A-Z]|SOG\d+|SOV\d+|XQ-[A-Z0-9]+|BRAVIA)/i },
  { vendor: 'LG', pattern: /^(?:LG[-_ ]?[A-Z0-9]|LM-|LGM-|LGE\b)/i },
  { vendor: 'Nokia', pattern: /^Nokia\b/i },
  { vendor: 'HTC', pattern: /^HTC/i },
  { vendor: 'ASUS', pattern: /^(?:ASUS|Zenfone|ROG Phone)/i },
  { vendor: 'Lenovo', pattern: /^(?:Lenovo|TB[-\d]|YT-)/i },
  { vendor: 'Amazon', pattern: /^(?:KF[A-Z]{2,6}|AFT[A-Z0-9]{1,6})$|^Amazon\b/ },
  { vendor: 'Microsoft', pattern: /^Surface\b/i },
  { vendor: 'ZTE', pattern: /^ZTE\b/i },
  { vendor: 'TCL', pattern: /^TCL\b/i },
  { vendor: 'Tecno', pattern: /^TECNO\b/i },
  { vendor: 'Infinix', pattern: /^Infinix\b/i },
];

// ---------------------------------------------------------------------------
// CPU architecture. A UA states it only sometimes, so "no match" means unknown.
// ---------------------------------------------------------------------------

export const CPU_RULES: readonly CpuRule[] = [
  { architecture: 'arm64', pattern: /\b(?:aarch64|arm64|arm_64|armv8[ab]?)\b/i },
  // WOW64 is a 32-bit process on 64-bit Windows: the machine is x86_64.
  { architecture: 'x86_64', pattern: /\b(?:x86[_-]64|x64|amd64|wow64)\b/i },
  { architecture: 'arm', pattern: /\barm(?:v\d\w*|hf|eabi)?(?=[;)\s,/]|$)/i },
  { architecture: 'x86', pattern: /\b(?:i[3-6]86|x86|ia32)\b/i },
  { architecture: 'ppc', pattern: /\b(?:ppc|powerpc)(?:64)?\b/i },
];

// ---------------------------------------------------------------------------
// Sample strings offered in the Select. All are real-world shapes.
// ---------------------------------------------------------------------------

export const USER_AGENT_SAMPLES: readonly UserAgentSample[] = [
  {
    id: 'chrome-windows',
    label: 'Chrome on Windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  {
    id: 'edge-windows',
    label: 'Edge on Windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
  },
  {
    id: 'firefox-linux',
    label: 'Firefox on Linux',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  },
  {
    id: 'safari-macos',
    label: 'Safari on macOS',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  },
  {
    id: 'opera-windows',
    label: 'Opera on Windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
  },
  {
    id: 'ie11-windows',
    label: 'Internet Explorer 11 on Windows 7',
    userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko',
  },
  {
    id: 'safari-iphone',
    label: 'Safari on iPhone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'safari-ipad',
    label: 'Safari on iPad',
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'chrome-ios',
    label: 'Chrome on iPhone (CriOS)',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'firefox-ios',
    label: 'Firefox on iPhone (FxiOS)',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  },
  {
    id: 'chrome-android',
    label: 'Chrome on Android phone',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
  },
  {
    id: 'samsung-internet',
    label: 'Samsung Internet on Galaxy phone',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  },
  {
    id: 'android-tablet',
    label: 'Chrome on Android tablet',
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  {
    id: 'googlebot',
    label: 'Googlebot',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
  {
    id: 'bingbot',
    label: 'bingbot',
    userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  },
  { id: 'curl', label: 'curl', userAgent: 'curl/8.4.0' },
  { id: 'wget', label: 'Wget', userAgent: 'Wget/1.21.4' },
  {
    id: 'playstation-5',
    label: 'PlayStation 5',
    userAgent:
      'Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15',
  },
  {
    id: 'samsung-tv',
    label: 'Samsung smart TV (Tizen)',
    userAgent:
      'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36',
  },
];

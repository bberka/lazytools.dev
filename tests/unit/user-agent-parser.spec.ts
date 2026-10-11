import { test, expect } from '@playwright/test';
import {
  CLIENT_KIND_LABELS,
  DEVICE_TYPE_LABELS,
  MAX_USER_AGENT_LENGTH,
  USER_AGENT_SAMPLES,
  isRecognised,
  parseUserAgent,
  readClientHints,
  resultToJson,
  type ClientKind,
  type DeviceType,
  type ParsedUserAgent,
} from '@/lib/tools/user-agent-parser';

function parse(userAgent: string): ParsedUserAgent {
  const outcome = parseUserAgent(userAgent);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}

type Pair = [string | null, string | null];

interface Expected {
  title: string;
  ua: string;
  kind: ClientKind;
  browser: Pair;
  engine: Pair;
  os: Pair;
  /** [type, vendor, model] */
  device: [DeviceType, string | null, string | null];
  cpu: string | null;
}

/** Every field in one flat shape, so a case can state all of them and unknowns are asserted as null. */
function summarise(result: ParsedUserAgent) {
  return {
    kind: result.kind,
    browser: [result.browser.name, result.browser.version],
    engine: [result.engine.name, result.engine.version],
    os: [result.os.name, result.os.version],
    device: [result.device.type, result.device.vendor, result.device.model],
    cpu: result.cpu.architecture,
  };
}

const CASES: Expected[] = [
  // --- Desktop browsers -----------------------------------------------------
  {
    title: 'Chrome on Windows 10',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    kind: 'browser',
    browser: ['Chrome', '126.0.0.0'],
    engine: ['Blink', '126.0.0.0'],
    os: ['Windows', '10 or 11'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Edge (Chromium) on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
    kind: 'browser',
    browser: ['Edge', '126.0.2592.87'],
    engine: ['Blink', '126.0.0.0'],
    os: ['Windows', '10 or 11'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Edge (legacy EdgeHTML) on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19582',
    kind: 'browser',
    browser: ['Edge', '18.19582'],
    engine: ['EdgeHTML', '18.19582'],
    os: ['Windows', '10 or 11'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Firefox on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    kind: 'browser',
    browser: ['Firefox', '128.0'],
    engine: ['Gecko', '128.0'],
    os: ['Windows', '10 or 11'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Firefox on Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    kind: 'browser',
    browser: ['Firefox', '128.0'],
    engine: ['Gecko', '128.0'],
    os: ['Linux', null],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Firefox on Ubuntu',
    ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
    kind: 'browser',
    browser: ['Firefox', '115.0'],
    engine: ['Gecko', '109.0'],
    os: ['Ubuntu', null],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Safari on macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    kind: 'browser',
    browser: ['Safari', '17.5'],
    engine: ['WebKit', '605.1.15'],
    os: ['macOS', '10.15.7'],
    device: ['desktop', 'Apple', 'Macintosh'],
    cpu: null,
  },
  {
    title: 'Chrome on macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    kind: 'browser',
    browser: ['Chrome', '126.0.0.0'],
    engine: ['Blink', '126.0.0.0'],
    os: ['macOS', '10.15.7'],
    device: ['desktop', 'Apple', 'Macintosh'],
    cpu: null,
  },
  {
    title: 'Opera (Chromium) on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
    kind: 'browser',
    browser: ['Opera', '111.0.0.0'],
    engine: ['Blink', '125.0.0.0'],
    os: ['Windows', '10 or 11'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Opera 12 (Presto) on Windows 7',
    ua: 'Opera/9.80 (Windows NT 6.1; U; en) Presto/2.10.289 Version/12.02',
    kind: 'browser',
    browser: ['Opera', '12.02'],
    engine: ['Presto', '2.10.289'],
    os: ['Windows', '7'],
    device: ['desktop', null, null],
    cpu: null,
  },
  {
    title: 'Vivaldi on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Vivaldi/5.6.2867.62',
    kind: 'browser',
    browser: ['Vivaldi', '5.6.2867.62'],
    engine: ['Blink', '108.0.0.0'],
    os: ['Windows', '10 or 11'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Chrome on ChromeOS',
    ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    kind: 'browser',
    browser: ['Chrome', '114.0.0.0'],
    engine: ['Blink', '114.0.0.0'],
    os: ['Chrome OS', '14541.0.0'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  // --- Internet Explorer ----------------------------------------------------
  {
    title: 'Internet Explorer 11 on Windows 7 (32-bit IE on 64-bit Windows)',
    ua: 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko',
    kind: 'browser',
    browser: ['Internet Explorer', '11.0'],
    engine: ['Trident', '7.0'],
    os: ['Windows', '7'],
    device: ['desktop', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Internet Explorer 10 on Windows 8',
    ua: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)',
    kind: 'browser',
    browser: ['Internet Explorer', '10.0'],
    engine: ['Trident', '6.0'],
    os: ['Windows', '8'],
    device: ['desktop', null, null],
    cpu: null,
  },
  // --- iPhone and iPad ------------------------------------------------------
  {
    title: 'Safari on iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    kind: 'browser',
    browser: ['Safari', '17.5'],
    engine: ['WebKit', '605.1.15'],
    os: ['iOS', '17.5.1'],
    device: ['mobile', 'Apple', 'iPhone'],
    cpu: null,
  },
  {
    title: 'Safari on iPad',
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    kind: 'browser',
    browser: ['Safari', '17.5'],
    engine: ['WebKit', '605.1.15'],
    os: ['iOS', '17.5.1'],
    device: ['tablet', 'Apple', 'iPad'],
    cpu: null,
  },
  {
    title: 'Chrome on iPhone (CriOS)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
    kind: 'browser',
    browser: ['Chrome for iOS', '126.0.6478.153'],
    engine: ['WebKit', '605.1.15'],
    os: ['iOS', '17.5'],
    device: ['mobile', 'Apple', 'iPhone'],
    cpu: null,
  },
  {
    title: 'Firefox on iPhone (FxiOS)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
    kind: 'browser',
    browser: ['Firefox for iOS', '127.0'],
    engine: ['WebKit', '605.1.15'],
    os: ['iOS', '17.5'],
    device: ['mobile', 'Apple', 'iPhone'],
    cpu: null,
  },
  {
    title: 'Edge on iPhone (EdgiOS)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.88 Mobile/15E148 Safari/605.1.15',
    kind: 'browser',
    browser: ['Edge', '126.2592.88'],
    engine: ['WebKit', '605.1.15'],
    os: ['iOS', '17.5'],
    device: ['mobile', 'Apple', 'iPhone'],
    cpu: null,
  },
  {
    title: 'iOS app web view (no Safari token)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    kind: 'browser',
    browser: ['iOS WebView', null],
    engine: ['WebKit', '605.1.15'],
    os: ['iOS', '17.5'],
    device: ['mobile', 'Apple', 'iPhone'],
    cpu: null,
  },
  // --- Android --------------------------------------------------------------
  {
    title: 'Chrome on a Pixel phone',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
    kind: 'browser',
    browser: ['Chrome', '126.0.6478.122'],
    engine: ['Blink', '126.0.6478.122'],
    os: ['Android', '14'],
    device: ['mobile', 'Google', 'Pixel 8'],
    cpu: null,
  },
  {
    title: 'Samsung Internet on a Galaxy phone',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
    kind: 'browser',
    browser: ['Samsung Internet', '25.0'],
    engine: ['Blink', '121.0.0.0'],
    os: ['Android', '14'],
    device: ['mobile', 'Samsung', 'SM-S918B'],
    cpu: null,
  },
  {
    title: 'Chrome on a Galaxy Tab (no Mobile token means tablet)',
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    kind: 'browser',
    browser: ['Chrome', '126.0.0.0'],
    engine: ['Blink', '126.0.0.0'],
    os: ['Android', '13'],
    device: ['tablet', 'Samsung', 'SM-X710'],
    cpu: null,
  },
  {
    title: 'Edge on a OnePlus phone (EdgA)',
    ua: 'Mozilla/5.0 (Linux; Android 10; HD1913) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.2592.80',
    kind: 'browser',
    browser: ['Edge', '126.0.2592.80'],
    engine: ['Blink', '126.0.0.0'],
    os: ['Android', '10'],
    device: ['mobile', 'OnePlus', 'HD1913'],
    cpu: null,
  },
  {
    title: 'Firefox on an Android phone',
    ua: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
    kind: 'browser',
    browser: ['Firefox', '128.0'],
    engine: ['Gecko', '128.0'],
    os: ['Android', '14'],
    device: ['mobile', null, null],
    cpu: null,
  },
  {
    title: 'Firefox on an Android tablet',
    ua: 'Mozilla/5.0 (Android 14; Tablet; rv:128.0) Gecko/128.0 Firefox/128.0',
    kind: 'browser',
    browser: ['Firefox', '128.0'],
    engine: ['Gecko', '128.0'],
    os: ['Android', '14'],
    device: ['tablet', null, null],
    cpu: null,
  },
  {
    title: 'Android WebView',
    ua: 'Mozilla/5.0 (Linux; Android 11; SM-A515F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36',
    kind: 'browser',
    browser: ['Chrome WebView', '119.0.6045.163'],
    engine: ['Blink', '119.0.6045.163'],
    os: ['Android', '11'],
    device: ['mobile', 'Samsung', 'SM-A515F'],
    cpu: null,
  },
  {
    title: 'Android 4 stock browser',
    ua: 'Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebkit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
    kind: 'browser',
    browser: ['Android Browser', '4.0'],
    engine: ['WebKit', '534.30'],
    os: ['Android', '4.0.3'],
    device: ['mobile', 'LG', 'LG-L160L'],
    cpu: null,
  },
  {
    title: 'Silk on a Fire tablet',
    ua: 'Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/116.5.12 like Chrome/116.0.0.0 Safari/537.36',
    kind: 'browser',
    browser: ['Silk', '116.5.12'],
    engine: ['Blink', '116.0.0.0'],
    os: ['Android', '9'],
    device: ['tablet', 'Amazon', 'KFMAWI'],
    cpu: null,
  },
  {
    title: "Chrome's reduced Android string hides the version and model",
    ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    kind: 'browser',
    browser: ['Chrome', '126.0.0.0'],
    engine: ['Blink', '126.0.0.0'],
    os: ['Android', null],
    device: ['mobile', null, null],
    cpu: null,
  },
  {
    title: 'Opera Mini (Presto)',
    ua: 'Opera/9.80 (Android; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16',
    kind: 'browser',
    browser: ['Opera Mini', '36.2.2254'],
    engine: ['Presto', '2.12.423'],
    os: ['Android', null],
    device: ['mobile', null, null],
    cpu: null,
  },
  // --- Windows Phone --------------------------------------------------------
  {
    title: 'IE Mobile on Windows Phone 8',
    ua: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0; Trident/6.0; IEMobile/10.0; ARM; Touch; NOKIA; Lumia 920)',
    kind: 'browser',
    browser: ['IE Mobile', '10.0'],
    engine: ['Trident', '6.0'],
    os: ['Windows Phone', '8.0'],
    device: ['mobile', 'Nokia', 'Lumia 920'],
    cpu: 'arm',
  },
  {
    title: 'Edge on Windows 10 Mobile (also says Android)',
    ua: 'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.15254',
    kind: 'browser',
    browser: ['Edge', '15.15254'],
    engine: ['EdgeHTML', '15.15254'],
    os: ['Windows Phone', '10.0'],
    device: ['mobile', 'Microsoft', 'Lumia 950'],
    cpu: null,
  },
  // --- TVs and consoles -----------------------------------------------------
  {
    title: 'Samsung smart TV (Tizen)',
    ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/63.0.3239.84 TV Safari/537.36',
    kind: 'browser',
    browser: ['Samsung Internet', '2.2'],
    engine: ['Blink', '63.0.3239.84'],
    os: ['Tizen', '5.0'],
    device: ['tv', null, null],
    cpu: null,
  },
  {
    title: 'Chromecast',
    ua: 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36 CrKey/1.56.500000',
    kind: 'browser',
    browser: ['Chrome', '70.0.3538.110'],
    engine: ['Blink', '70.0.3538.110'],
    os: ['Linux', null],
    device: ['tv', 'Google', 'Chromecast'],
    cpu: 'arm',
  },
  {
    title: 'PlayStation 5',
    ua: 'Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15',
    kind: 'browser',
    browser: ['Safari', '13.0'],
    engine: ['WebKit', '605.1.15'],
    os: ['PlayStation', '2.26'],
    device: ['console', 'Sony', 'PlayStation 5'],
    cpu: null,
  },
  {
    title: 'Xbox One',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19041',
    kind: 'browser',
    browser: ['Edge', '18.19041'],
    engine: ['EdgeHTML', '18.19041'],
    os: ['Windows', '10 or 11'],
    device: ['console', 'Microsoft', 'Xbox One'],
    cpu: 'x86_64',
  },
  {
    title: 'Nintendo Switch',
    ua: 'Mozilla/5.0 (Nintendo Switch; WifiWebAuthApplet) AppleWebKit/601.6 (KHTML, like Gecko) NF/4.0.0.5.10 NintendoBrowser/5.1.0.13343',
    kind: 'browser',
    browser: ['Nintendo Browser', '5.1.0.13343'],
    engine: ['WebKit', '601.6'],
    os: [null, null],
    device: ['console', 'Nintendo', 'Switch'],
    cpu: null,
  },
  // --- Bots and command-line clients ---------------------------------------
  {
    title: 'Googlebot (desktop)',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    kind: 'bot',
    browser: ['Googlebot', '2.1'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'Googlebot (smartphone) carries Chrome and Android tokens',
    ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    kind: 'bot',
    browser: ['Googlebot', '2.1'],
    engine: ['Blink', '126.0.6478.126'],
    os: ['Android', '6.0.1'],
    device: ['bot', 'Google', 'Nexus 5X'],
    cpu: null,
  },
  {
    title: 'Googlebot with the Chrome/W.X.Y.Z placeholder',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/W.X.Y.Z Safari/537.36',
    kind: 'bot',
    browser: ['Googlebot', '2.1'],
    engine: ['Blink', null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'Googlebot-Image is not plain Googlebot',
    ua: 'Googlebot-Image/1.0',
    kind: 'bot',
    browser: ['Googlebot-Image', '1.0'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'bingbot',
    ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    kind: 'bot',
    browser: ['Bingbot', '2.0'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'facebookexternalhit',
    ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    kind: 'bot',
    browser: ['facebookexternalhit', '1.1'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'Yahoo! Slurp (no version)',
    ua: 'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
    kind: 'bot',
    browser: ['Yahoo! Slurp', null],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'a crawler that is not in the list, found by its name',
    ua: 'Mozilla/5.0 (compatible; ExampleCrawler/3.2; +https://example.com/bot)',
    kind: 'bot',
    browser: ['ExampleCrawler', '3.2'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'curl',
    ua: 'curl/8.4.0',
    kind: 'http-client',
    browser: ['curl', '8.4.0'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'curl that names its platform',
    ua: 'curl/7.68.0 (x86_64-pc-linux-gnu) libcurl/7.68.0 OpenSSL/1.1.1f zlib/1.2.11',
    kind: 'http-client',
    browser: ['curl', '7.68.0'],
    engine: [null, null],
    os: ['Linux', null],
    device: ['bot', null, null],
    cpu: 'x86_64',
  },
  {
    title: 'Wget',
    ua: 'Wget/1.21.4',
    kind: 'http-client',
    browser: ['Wget', '1.21.4'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
  {
    title: 'python-requests',
    ua: 'python-requests/2.31.0',
    kind: 'http-client',
    browser: ['python-requests', '2.31.0'],
    engine: [null, null],
    os: [null, null],
    device: ['bot', null, null],
    cpu: null,
  },
];

test.describe('real-world user agents', () => {
  test('there are well over fifteen of them', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CASES.map((c) => c.ua)).size).toBe(CASES.length);
  });

  for (const c of CASES) {
    test(c.title, () => {
      expect(summarise(parse(c.ua))).toEqual({
        kind: c.kind,
        browser: c.browser,
        engine: c.engine,
        os: c.os,
        device: c.device,
        cpu: c.cpu,
      });
    });
  }

  test('between them the cases cover every device type the parser reports except unknown', () => {
    const types = new Set(CASES.map((c) => c.device[0]));
    for (const type of ['desktop', 'mobile', 'tablet', 'bot', 'tv', 'console']) {
      expect(types.has(type as DeviceType)).toBe(true);
    }
  });
});

test.describe('detection order', () => {
  const sniffedAsChromeOrSafari = [
    CASES.find((c) => c.title.startsWith('Edge (Chromium)')),
    CASES.find((c) => c.title.startsWith('Edge (legacy')),
    CASES.find((c) => c.title.startsWith('Edge on iPhone')),
    CASES.find((c) => c.title.startsWith('Edge on a OnePlus')),
    CASES.find((c) => c.title.startsWith('Opera (Chromium)')),
    CASES.find((c) => c.title.startsWith('Samsung Internet')),
    CASES.find((c) => c.title.startsWith('Chrome on iPhone (CriOS)')),
    CASES.find((c) => c.title.startsWith('Firefox on iPhone (FxiOS)')),
    CASES.find((c) => c.title.startsWith('Vivaldi')),
    CASES.find((c) => c.title.startsWith('Silk')),
  ];

  test('every one of these strings carries a Chrome/ or Safari/ token that must not win', () => {
    for (const c of sniffedAsChromeOrSafari) {
      expect(c, 'case present').toBeDefined();
      expect(c!.ua).toMatch(/Chrome\/|Safari\//);
      const name = parse(c!.ua).browser.name;
      expect(name).not.toBe('Chrome');
      expect(name).not.toBe('Safari');
    }
  });

  test('CriOS and FxiOS are named for what they are', () => {
    expect(parse(CASES.find((c) => c.title.includes('CriOS'))!.ua).browser.name).toBe('Chrome for iOS');
    expect(parse(CASES.find((c) => c.title.includes('FxiOS'))!.ua).browser.name).toBe('Firefox for iOS');
  });

  test('Safari without a Chrome token is still Safari, and plain Chrome is still Chrome', () => {
    expect(parse(CASES.find((c) => c.title === 'Safari on macOS')!.ua).browser.name).toBe('Safari');
    expect(parse(CASES.find((c) => c.title === 'Chrome on Windows 10')!.ua).browser.name).toBe('Chrome');
  });

  test('an old Opera that pretends to be MSIE is Opera', () => {
    const r = parse('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.0) Opera 7.0 [en]');
    expect(r.browser.name).toBe('Opera');
    expect(r.browser.version).toBe('7.0');
    expect(r.os.version).toBe('2000');
  });

  test('a bot that carries browser tokens is reported as a bot, not as Chrome', () => {
    const r = parse(CASES.find((c) => c.title.includes('smartphone'))!.ua);
    expect(r.kind).toBe('bot');
    expect(r.browser.name).toBe('Googlebot');
  });

  test('Windows Phone 8.1 mentioning iPhone and Android is still a Windows Phone', () => {
    const r = parse(
      'Mozilla/5.0 (Mobile; Windows Phone 8.1; Android 4.0; ARM; Trident/7.0; Touch; rv:11.0; IEMobile/11.0; NOKIA; Lumia 635) like iPhone OS 7_0_3 Mac OS X AppleWebKit/537 (KHTML, like Gecko) Mobile Safari/537',
    );
    expect(r.os.name).toBe('Windows Phone');
    expect(r.device).toEqual({ type: 'mobile', vendor: 'Nokia', model: 'Lumia 635' });
    expect(r.browser.name).toBe('IE Mobile');
  });

  test('a phone maker whose name ends in "bot" is not a crawler', () => {
    const r = parse(
      'Mozilla/5.0 (Linux; Android 9; Cubot P30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36',
    );
    expect(r.kind).toBe('browser');
    expect(r.browser.name).toBe('Chrome');
    expect(r.device).toEqual({ type: 'mobile', vendor: null, model: 'Cubot P30' });
  });
});

test.describe('operating system, device and CPU details', () => {
  test('Windows NT numbers map to the names people use', () => {
    const version = (nt: string) => parse(`Mozilla/5.0 (Windows NT ${nt}) AppleWebKit/537.36`).os.version;
    expect(version('5.1')).toBe('XP');
    expect(version('6.0')).toBe('Vista');
    expect(version('6.1')).toBe('7');
    expect(version('6.2')).toBe('8');
    expect(version('6.3')).toBe('8.1');
    expect(version('10.0')).toBe('10 or 11');
    expect(version('6.4')).toBe('NT 6.4');
  });

  test('macOS versions have dots, whether the UA used dots or underscores', () => {
    expect(parse('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0').os).toEqual({
      name: 'macOS',
      version: '10.15',
    });
    expect(parse('Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6_3) AppleWebKit/605.1.15').os.version).toBe('12.6.3');
  });

  test('an iPod touch is not an iPhone', () => {
    const r = parse(
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
    );
    expect(r.device).toEqual({ type: 'mobile', vendor: 'Apple', model: 'iPod touch' });
    expect(r.os).toEqual({ name: 'iOS', version: '12.5.7' });
  });

  test('a Samsung model loses its SAMSUNG prefix', () => {
    const r = parse(
      'Mozilla/5.0 (Linux; Android 5.0; SAMSUNG SM-G900F Build/LRX21T) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/3.3 Chrome/38.0.2125.102 Mobile Safari/537.36',
    );
    expect(r.device).toEqual({ type: 'mobile', vendor: 'Samsung', model: 'SM-G900F' });
  });

  test('a model that matches no maker keeps its name with the vendor unknown', () => {
    const r = parse(
      'Mozilla/5.0 (Linux; Android 12; Foo Bar 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    );
    expect(r.device).toEqual({ type: 'mobile', vendor: null, model: 'Foo Bar 9' });
  });

  test('CPU architecture is read from the usual tokens and left null otherwise', () => {
    const cpu = (inner: string) => parse(`Mozilla/5.0 (${inner}) AppleWebKit/537.36`).cpu.architecture;
    expect(cpu('X11; Linux x86_64')).toBe('x86_64');
    expect(cpu('Windows NT 10.0; Win64; x64')).toBe('x86_64');
    expect(cpu('Windows NT 6.1; WOW64')).toBe('x86_64');
    expect(cpu('X11; Linux i686')).toBe('x86');
    expect(cpu('X11; Linux i686 (x86_64)')).toBe('x86_64');
    expect(cpu('X11; Linux aarch64')).toBe('arm64');
    expect(cpu('Windows NT 10.0; ARM64')).toBe('arm64');
    expect(cpu('X11; Linux armv7l')).toBe('arm');
    expect(cpu('X11; Linux armv8l')).toBe('arm');
    expect(cpu('Macintosh; PPC Mac OS X 10.5')).toBe('ppc');
    expect(cpu('Windows NT 6.1')).toBeNull();
    expect(cpu('Macintosh; Intel Mac OS X 10_15_7')).toBeNull();
  });

  test('an unrecognised string leaves every field unknown instead of guessing', () => {
    const r = parse('Mozilla/5.0 (Windows NT 6.1)');
    expect(r.kind).toBe('unknown');
    expect(r.browser).toEqual({ name: null, version: null });
    expect(r.engine).toEqual({ name: null, version: null });
    expect(r.os.name).toBe('Windows');
    expect(r.device.vendor).toBeNull();
    expect(r.device.model).toBeNull();
  });

  test('a browser token without a version keeps the version unknown', () => {
    const r = parse('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/533.21.1 (KHTML, like Gecko) Safari/533.21.1');
    expect(r.browser).toEqual({ name: 'Safari', version: null });
  });
});

test.describe('notes', () => {
  test('Windows 10 or 11 carries the Windows 11 caveat', () => {
    const notes = parse(CASES[0].ua).notes;
    expect(notes.some((n) => n.includes('Windows 11'))).toBe(true);
  });

  test('a Mac carries the frozen-version and Intel caveats', () => {
    const notes = parse(CASES.find((c) => c.title === 'Safari on macOS')!.ua).notes;
    expect(notes.some((n) => n.includes('10.15.7'))).toBe(true);
    expect(notes.some((n) => n.includes('Apple silicon'))).toBe(true);
  });

  test('the reduced Android string is explained', () => {
    const notes = parse(CASES.find((c) => c.title.startsWith("Chrome's reduced"))!.ua).notes;
    expect(notes.some((n) => n.includes('reduced'))).toBe(true);
  });

  test('a bot gets the spoofing warning, a curl does not', () => {
    expect(parse(CASES.find((c) => c.title === 'bingbot')!.ua).notes.join(' ')).toContain('reverse DNS');
    expect(parse('curl/8.4.0').notes).toEqual([]);
  });

  test('a plain Firefox on Linux has nothing to caveat', () => {
    expect(parse('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0').notes).toEqual([]);
  });
});

test.describe('input handling', () => {
  test('empty and whitespace-only input is an error result, not a throw', () => {
    for (const input of ['', '   ', '\n\t ']) {
      const outcome = parseUserAgent(input);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe('empty');
        expect(outcome.error.length).toBeGreaterThan(0);
      }
    }
  });

  test('input that is not a string is an error result', () => {
    const outcome = parseUserAgent(undefined as unknown as string);
    expect(outcome.ok).toBe(false);
  });

  test('input over the length limit is an error result', () => {
    const outcome = parseUserAgent('a'.repeat(MAX_USER_AGENT_LENGTH + 1));
    expect(outcome).toMatchObject({ ok: false, code: 'too-long' });
    expect(parseUserAgent('a'.repeat(MAX_USER_AGENT_LENGTH)).ok).toBe(true);
  });

  test('a pasted header line loses its "User-Agent:" prefix and wrapping quotes', () => {
    expect(parse('User-Agent: curl/8.4.0').userAgent).toBe('curl/8.4.0');
    expect(parse('user-agent:curl/8.4.0').userAgent).toBe('curl/8.4.0');
    expect(parse('"curl/8.4.0"').userAgent).toBe('curl/8.4.0');
  });

  test('line breaks and runs of spaces collapse to single spaces', () => {
    const r = parse('Mozilla/5.0 (X11; Linux x86_64;\n   rv:128.0)   Gecko/20100101\tFirefox/128.0\n');
    expect(r.userAgent).toBe('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0');
    expect(r.browser.name).toBe('Firefox');
  });

  test('gibberish and odd punctuation never throw', () => {
    const inputs = [
      'hello world',
      ';;;;)))((((',
      'Android;',
      'Mozilla/5.0 (',
      '\u0000\u0001',
      'Ünïcödé/1.0 (日本語)',
      'bot',
      '/'.repeat(500),
      'Android '.repeat(500),
      'Version/1 '.repeat(500) + 'Safari/1',
    ];
    for (const input of inputs) {
      expect(() => parseUserAgent(input)).not.toThrow();
    }
    expect(isRecognised(parse('hello world'))).toBe(false);
    expect(isRecognised(parse('Android;'))).toBe(true);
  });

  test('isRecognised is true for anything that identified at least one field', () => {
    for (const c of CASES) expect(isRecognised(parse(c.ua))).toBe(true);
  });
});

test.describe('JSON output', () => {
  test('round-trips through JSON.parse with unknown fields as null', () => {
    const result = parse('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0');
    const json = resultToJson(result);
    expect(JSON.parse(json)).toEqual(result);
    expect(JSON.parse(json).device.vendor).toBeNull();
    expect(json).toContain('\n  "browser": {');
  });

  test('lists every field a reader would look for', () => {
    const json = JSON.parse(resultToJson(parse(CASES[0].ua)));
    expect(Object.keys(json)).toEqual(['userAgent', 'kind', 'browser', 'engine', 'os', 'device', 'cpu', 'notes']);
    expect(Object.keys(json.device)).toEqual(['type', 'vendor', 'model']);
  });
});

test.describe('labels', () => {
  test('every device type and client kind has a label', () => {
    for (const type of ['desktop', 'mobile', 'tablet', 'bot', 'tv', 'console', 'unknown'] as const) {
      expect(DEVICE_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
    for (const kind of ['browser', 'bot', 'http-client', 'unknown'] as const) {
      expect(CLIENT_KIND_LABELS[kind].length).toBeGreaterThan(0);
    }
  });
});

test.describe('client hints', () => {
  test('reads brands, mobile and platform from a navigator.userAgentData shaped object', () => {
    const hints = readClientHints({
      brands: [
        { brand: 'Not/A)Brand', version: '8' },
        { brand: 'Chromium', version: '126' },
        { brand: 'Google Chrome', version: '126' },
      ],
      mobile: false,
      platform: 'Windows',
    });
    expect(hints).toEqual({
      brands: [
        { brand: 'Not/A)Brand', version: '8', placeholder: true },
        { brand: 'Chromium', version: '126', placeholder: false },
        { brand: 'Google Chrome', version: '126', placeholder: false },
      ],
      mobile: false,
      platform: 'Windows',
    });
  });

  test('recognises the placeholder brand in its many spellings', () => {
    for (const brand of ['Not A;Brand', 'Not)A;Brand', '(Not(A:Brand', 'Not_A Brand', 'Not.A/Brand', 'Not=A?Brand']) {
      expect(readClientHints({ brands: [{ brand, version: '99' }] })?.brands[0].placeholder).toBe(true);
    }
    expect(readClientHints({ brands: [{ brand: 'Brave', version: '126' }] })?.brands[0].placeholder).toBe(false);
  });

  test('returns null when the browser has no userAgentData', () => {
    expect(readClientHints(undefined)).toBeNull();
    expect(readClientHints(null)).toBeNull();
    expect(readClientHints('Chrome')).toBeNull();
  });

  test('drops malformed entries and unknown field types', () => {
    const hints = readClientHints({
      brands: [null, 'x', { brand: 'Chromium' }, { brand: 5, version: '1' }, { brand: 'Chromium', version: '126' }],
      mobile: 'yes',
      platform: '',
    });
    expect(hints).toEqual({
      brands: [{ brand: 'Chromium', version: '126', placeholder: false }],
      mobile: null,
      platform: null,
    });
    expect(readClientHints({})).toEqual({ brands: [], mobile: null, platform: null });
  });
});

test.describe('samples offered in the Select', () => {
  test('ids are unique and every sample parses to something recognised', () => {
    expect(new Set(USER_AGENT_SAMPLES.map((s) => s.id)).size).toBe(USER_AGENT_SAMPLES.length);
    for (const sample of USER_AGENT_SAMPLES) {
      const result = parse(sample.userAgent);
      expect(isRecognised(result), sample.label).toBe(true);
    }
  });

  test('each sample parses to what its label says', () => {
    const byId = (id: string) => parse(USER_AGENT_SAMPLES.find((s) => s.id === id)!.userAgent);
    expect(byId('chrome-windows').browser.name).toBe('Chrome');
    expect(byId('edge-windows').browser.name).toBe('Edge');
    expect(byId('firefox-linux').os.name).toBe('Linux');
    expect(byId('safari-macos').browser.name).toBe('Safari');
    expect(byId('opera-windows').browser.name).toBe('Opera');
    expect(byId('ie11-windows').browser.name).toBe('Internet Explorer');
    expect(byId('safari-iphone').device.model).toBe('iPhone');
    expect(byId('safari-ipad').device.type).toBe('tablet');
    expect(byId('chrome-ios').browser.name).toBe('Chrome for iOS');
    expect(byId('firefox-ios').browser.name).toBe('Firefox for iOS');
    expect(byId('chrome-android').device.type).toBe('mobile');
    expect(byId('samsung-internet').browser.name).toBe('Samsung Internet');
    expect(byId('android-tablet').device.type).toBe('tablet');
    expect(byId('googlebot').browser.name).toBe('Googlebot');
    expect(byId('bingbot').browser.name).toBe('Bingbot');
    expect(byId('curl').kind).toBe('http-client');
    expect(byId('wget').browser.name).toBe('Wget');
    expect(byId('playstation-5').device.type).toBe('console');
    expect(byId('samsung-tv').device.type).toBe('tv');
  });
});

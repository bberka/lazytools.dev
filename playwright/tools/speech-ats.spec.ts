import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Flows of the speech tools and the resume analyzer, run against the built app.
 *
 * Nothing here talks to a real speech engine, recognizer or microphone: the
 * machine running the tests would read text aloud, and Chrome's recognizer
 * sends audio to a service. Each speech test installs a stand-in for the
 * browser API before the page loads and then plays the browser's part itself
 * (an utterance starts, a word is reached, a phrase is recognized).
 */

// ── Shared ───────────────────────────────────────────────────────────────────

/**
 * Opens a tool and waits until it responds to input. The pages are prerendered,
 * so the controls are on screen before React has attached to them. The tool
 * page adds itself to the recent tools from an effect; that entry appearing is
 * the sign that the page is live.
 */
async function openTool(page: Page, slug: string) {
  await page.goto(`/tools/${slug}/`);
  await page.waitForFunction(
    (id) => (window.localStorage.getItem('dev-toolbox:recent') ?? '').includes(id),
    slug
  );
}

/** A message shown in an alert. The page also holds the router's own, empty, alert. */
function alertSaying(page: Page, message: string | RegExp) {
  return page.getByRole('alert').filter({ hasText: message });
}

/** The clipboard as text. Windows hands line breaks back as CRLF, whatever was written. */
async function readClipboard(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

/**
 * Picks an option from one of the app's select menus and waits until the menu
 * is gone: it fades out, and for that moment its options are still in the page.
 */
async function selectOption(page: Page, combobox: Locator, option: string) {
  await combobox.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(combobox).toHaveText(option);
}

// ── Text to Speech: a stand-in speech engine ─────────────────────────────────

interface FakeVoice {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
  voiceURI: string;
}

interface FakeUtterance {
  text: string;
  voice: FakeVoice | null;
  rate: number;
  pitch: number;
  volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onboundary: ((event: { name: string; charIndex: number; charLength?: number }) => void) | null;
  /** Ended, failed or cancelled: the engine reports nothing more for it by itself. */
  done: boolean;
}

interface FakeSynthesis {
  /** Every utterance handed to speak(), in order. */
  spoken: FakeUtterance[];
  cancels: number;
  pauses: number;
  resumes: number;
  paused: boolean;
  /** Replaces the installed voices and tells the page, as a browser does once its voices are loaded. */
  announceVoices: (voices: FakeVoice[]) => void;
}

type SynthesisWindow = Window & { __speechAtsSynthesis: FakeSynthesis };

type SpeechEvent = 'start' | 'end' | 'error' | 'boundary';

const VOICES: FakeVoice[] = [
  { name: 'Aria Test', lang: 'en-US', default: false, localService: true, voiceURI: 'aria' },
  { name: 'Bruno Test', lang: 'en-GB', default: true, localService: true, voiceURI: 'bruno' },
  { name: 'Clara Test', lang: 'de-DE', default: false, localService: false, voiceURI: 'clara' },
];

async function installFakeSpeechSynthesis(page: Page, voices: FakeVoice[] = VOICES) {
  await page.addInitScript((initialVoices) => {
    let installedVoices = initialVoices;

    const engine = {
      paused: false,
      onvoiceschanged: null as (() => void) | null,
      getVoices: () => installedVoices,
      speak(utterance: FakeUtterance) {
        control.spoken.push(utterance);
      },
      cancel() {
        control.cancels += 1;
        // Like a real engine: what was being spoken is reported as interrupted, a moment later.
        for (const utterance of control.spoken) {
          if (utterance.done) continue;
          utterance.done = true;
          setTimeout(() => utterance.onerror?.({ error: 'interrupted' }), 0);
        }
      },
      // A real engine stays paused through cancel(); only resume() ends a pause.
      pause() {
        control.pauses += 1;
        control.paused = true;
        engine.paused = true;
      },
      resume() {
        control.resumes += 1;
        control.paused = false;
        engine.paused = false;
      },
    };

    const control: FakeSynthesis = {
      spoken: [],
      cancels: 0,
      pauses: 0,
      resumes: 0,
      paused: false,
      announceVoices(next) {
        installedVoices = next;
        engine.onvoiceschanged?.();
      },
    };

    // Called with `new` by the page; a constructor that returns an object hands that object back.
    const Utterance = function (text: string): FakeUtterance {
      return {
        text,
        voice: null,
        rate: 1,
        pitch: 1,
        volume: 1,
        onstart: null,
        onend: null,
        onerror: null,
        onboundary: null,
        done: false,
      };
    };

    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => engine });
    const scope = window as unknown as Record<string, unknown>;
    scope.SpeechSynthesisUtterance = Utterance;
    scope.__speechAtsSynthesis = control;
  }, voices);
}

/** What the page asked the engine to speak so far. */
function spoken(page: Page) {
  return page.evaluate(() =>
    (window as unknown as SynthesisWindow).__speechAtsSynthesis.spoken.map((utterance) => ({
      text: utterance.text,
      voice: utterance.voice?.name ?? null,
      rate: Number(utterance.rate.toFixed(2)),
      pitch: Number(utterance.pitch.toFixed(2)),
      volume: Number(utterance.volume.toFixed(2)),
    }))
  );
}

function spokenTexts(page: Page) {
  return page.evaluate(() =>
    (window as unknown as SynthesisWindow).__speechAtsSynthesis.spoken.map(
      (utterance) => utterance.text
    )
  );
}

function synthesisCounts(page: Page) {
  return page.evaluate(() => {
    const { cancels, pauses, resumes, paused } = (window as unknown as SynthesisWindow)
      .__speechAtsSynthesis;
    return { cancels, pauses, resumes, paused };
  });
}

/** Plays the engine's part: reports an event for the utterance spoken at `index`. */
async function speechEvent(
  page: Page,
  index: number,
  type: SpeechEvent,
  detail: Record<string, unknown> = {}
) {
  await page.evaluate(
    ({ index, type, detail }) => {
      const utterance = (window as unknown as SynthesisWindow).__speechAtsSynthesis.spoken[index];
      if (type === 'end' || type === 'error') utterance.done = true;
      const handler = utterance[`on${type}`] as ((event: unknown) => void) | null;
      handler?.(detail);
    },
    { index, type, detail }
  );
}

// ── Speech to Text: a stand-in recognizer and microphone ─────────────────────

interface FakeRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string; confidence: number };
}

interface FakeRecognitionSession {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: FakeRecognitionResult[] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  started: number;
  stopped: number;
  aborted: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface FakeRecognition {
  /** One per press of Start Recording, in order. */
  sessions: FakeRecognitionSession[];
  micRequests: number;
  micTracks: MediaStreamTrack[];
  /** Answers the pending microphone prompt (only with the 'prompt' microphone). */
  allowMic: (() => void) | null;
  /** When set, start() throws an error with this message. */
  startFailure: string | null;
}

type RecognitionWindow = Window & { __speechAtsRecognition: FakeRecognition };

type Microphone = 'allowed' | 'blocked' | 'prompt';

type RecognitionEvent = 'start' | 'end' | 'error';

interface Phrase {
  text: string;
  final: boolean;
}

async function installFakeSpeechRecognition(page: Page, microphone: Microphone = 'allowed') {
  await page.addInitScript((mic) => {
    const control: FakeRecognition = {
      sessions: [],
      micRequests: 0,
      micTracks: [],
      allowMic: null,
      startFailure: null,
    };

    // Called with `new` by the page; a constructor that returns an object hands that object back.
    const Recognition = function (): FakeRecognitionSession {
      const session: FakeRecognitionSession = {
        continuous: false,
        interimResults: false,
        lang: '',
        onstart: null,
        onresult: null,
        onerror: null,
        onend: null,
        started: 0,
        stopped: 0,
        aborted: 0,
        start() {
          if (control.startFailure) throw new Error(control.startFailure);
          session.started += 1;
        },
        stop() {
          session.stopped += 1;
        },
        abort() {
          session.aborted += 1;
        },
      };
      control.sessions.push(session);
      return session;
    };

    // A silent stream that needs no hardware and no permission.
    const openMic = () => {
      const stream = new AudioContext().createMediaStreamDestination().stream;
      control.micTracks.push(...stream.getTracks());
      return stream;
    };

    navigator.mediaDevices.getUserMedia = () => {
      control.micRequests += 1;
      if (mic === 'blocked') {
        return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      }
      if (mic === 'prompt') {
        return new Promise<MediaStream>((resolve) => {
          control.allowMic = () => resolve(openMic());
        });
      }
      return Promise.resolve(openMic());
    };

    const scope = window as unknown as Record<string, unknown>;
    scope.SpeechRecognition = Recognition;
    scope.webkitSpeechRecognition = Recognition;
    scope.__speechAtsRecognition = control;
  }, microphone);
}

/** How each recognizer was configured and what was asked of it. */
function recognitionSessions(page: Page) {
  return page.evaluate(() =>
    (window as unknown as RecognitionWindow).__speechAtsRecognition.sessions.map((session) => ({
      lang: session.lang,
      continuous: session.continuous,
      interimResults: session.interimResults,
      started: session.started,
      stopped: session.stopped,
      aborted: session.aborted,
    }))
  );
}

function micTrackStates(page: Page) {
  return page.evaluate(() =>
    (window as unknown as RecognitionWindow).__speechAtsRecognition.micTracks.map(
      (track) => track.readyState
    )
  );
}

/** Plays the recognizer's part: reports that the session at `index` started, ended or failed. */
async function recognitionEvent(
  page: Page,
  index: number,
  type: RecognitionEvent,
  detail: { error: string } = { error: '' }
) {
  await page.evaluate(
    ({ index, type, detail }) => {
      const session = (window as unknown as RecognitionWindow).__speechAtsRecognition.sessions[
        index
      ];
      if (type === 'start') session.onstart?.();
      if (type === 'end') session.onend?.();
      if (type === 'error') session.onerror?.(detail);
    },
    { index, type, detail }
  );
}

/**
 * Reports recognized speech the way Chrome does: every event carries the whole
 * list of phrases heard in the session, and `resultIndex` points at the first
 * one that is new or changed.
 */
async function recognize(page: Page, index: number, resultIndex: number, phrases: Phrase[]) {
  await page.evaluate(
    ({ index, resultIndex, phrases }) => {
      const session = (window as unknown as RecognitionWindow).__speechAtsRecognition.sessions[
        index
      ];
      const results = phrases.map((phrase) =>
        Object.assign([{ transcript: phrase.text, confidence: 0.9 }], { isFinal: phrase.final })
      );
      session.onresult?.({ resultIndex, results });
    },
    { index, resultIndex, phrases }
  );
}

/** Presses Start Recording and lets the stand-in recognizer report that it is running. */
async function startRecording(page: Page, index = 0) {
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await expect
    .poll(async () => (await recognitionSessions(page))[index]?.started ?? 0)
    .toBe(1);
  await recognitionEvent(page, index, 'start');
  await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible();
}

// ── Resume analyzer: PDFs built in memory ────────────────────────────────────

/** A PDF with real text: one inner array per page, one string per line. */
async function buildPdf(pages: string[][]): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);

  for (const lines of pages) {
    const page = document.addPage([612, 792]);
    lines.forEach((line, index) => {
      if (line) page.drawText(line, { x: 48, y: 750 - index * 16, size: 10, font });
    });
  }

  return Buffer.from(await document.save());
}

interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

function pdfFile(name: string, buffer: Buffer): UploadFile {
  return { name, mimeType: 'application/pdf', buffer };
}

/** Picks a file the way a user does: through the Choose File button and the file dialog. */
async function chooseResume(page: Page, file: UploadFile) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose File, PDF resume' }).click();
  await (await chooser).setFiles(file);
}

async function analyze(page: Page) {
  await page.getByRole('button', { name: 'Analyze Resume' }).click();
  await expect(page.getByText('ATS Score', { exact: true })).toBeVisible();
}

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** A row of the score breakdown, such as "Contact Details 20/20". */
function breakdownRow(page: Page, label: string, points: number | string) {
  return page.getByText(new RegExp(`^${escapeForRegExp(label)}\\s*${points}/20$`));
}

/** A labelled figure, such as "Pages 1" or "Read Time 17 sec". */
function metric(page: Page, label: string, value: string | number) {
  return page.getByText(
    new RegExp(`^${escapeForRegExp(label)}\\s*${escapeForRegExp(String(value))}$`)
  );
}

/** A heading followed by exactly these chips (or by one sentence), in this order. */
function chipGroup(page: Page, title: string, items: string[]) {
  const pattern = [title, ...items].map(escapeForRegExp).join('\\s*');
  return page.getByText(new RegExp(`^${pattern}$`));
}

/** The points the page shows for Readability, which depend on syllable counting. */
async function readabilityPoints(page: Page) {
  const row = breakdownRow(page, 'Readability', '(\\d+)');
  await expect(row).toBeVisible();
  const points = Number(/(\d+)\/20$/.exec((await row.textContent()) ?? '')?.[1]);
  expect(points).toBeGreaterThanOrEqual(0);
  expect(points).toBeLessThanOrEqual(20);
  return points;
}

// The extracted text preview has no accessible name, so it cannot be found by role and name.
function extractedText(page: Page) {
  return page.locator('textarea[readonly]');
}

/** A short résumé with every contact detail, four of the six standard sections and four bullets. */
const SHORT_RESUME = [
  'Jane Doe',
  'Berlin, Germany',
  'jane.doe@example.com',
  '+49 30 1234 5678',
  'linkedin.com/in/janedoe',
  'https://janedoe.dev',
  'Summary',
  'Backend engineer who builds reliable payment systems.',
  'Work Experience',
  'Acme Corp, 2019 - 2022',
  '• Built a Kubernetes platform for forty services.',
  '• Led the migration to PostgreSQL.',
  '• Improved deploy times with Terraform.',
  '• Reduced cloud costs by a third.',
  'Education',
  'BSc Computer Science, Example University',
  'Key Skills',
  'TypeScript, Kubernetes, PostgreSQL, Terraform',
];

/**
 * A résumé a scanner has nothing to complain about: all contact details, all
 * six sections (under the longer headings people really use), 13 bullets that
 * each open with an action verb, and well over 250 words on one page.
 */
const STRONG_RESUME = [
  'Maria Keller',
  'Senior Platform Engineer',
  'Hamburg, Germany',
  'maria.keller@example.com',
  '+49 40 5550 1234',
  'linkedin.com/in/mariakeller',
  'https://github.com/mariakeller',
  'Professional Summary',
  'Platform engineer with nine years of practice running large Kubernetes clusters with Terraform',
  'for retail and logistics companies. I care about calm releases and short feedback loops.',
  'I enjoy teaching colleagues, writing plain documentation and keeping the on call rota humane.',
  'Work Experience',
  'Northwind Logistics, Platform Lead, 2020 - 2024',
  '• Built a Kubernetes platform that hosts ninety services for six product groups.',
  '• Led a group of five engineers through the move from virtual machines to Kubernetes.',
  '• Reduced the monthly cloud bill by a quarter through better autoscaling and spot capacity.',
  '• Improved release frequency from weekly to daily with a new Terraform delivery pipeline.',
  '• Designed the alerting rules that cut night pages in half within one quarter.',
  '• Planned the yearly capacity budget together with finance and the product owners.',
  'Contoso Retail, Site Reliability Engineer, 2016 - 2020',
  '• Managed the PostgreSQL fleet behind the checkout and the order history.',
  '• Implemented blue green releases for the storefront with Terraform and Kubernetes.',
  '• Delivered a self service portal so developers could create databases without tickets.',
  '• Streamlined incident reviews and published the findings for the whole company.',
  '• Resolved a long running data loss bug in the nightly backup jobs.',
  'Education',
  'MSc Computer Engineering, University of Hamburg, 2015',
  'BSc Informatics, University of Kiel, 2013',
  'Technical Skills',
  'Kubernetes, Terraform, PostgreSQL, Prometheus, Grafana, Golang, Python, Linux, Networking',
  'Personal Projects',
  '• Created an open source Kubernetes operator that rotates database passwords on a schedule.',
  '• Launched a small weather station at home and published the readings on a public dashboard.',
  'Licenses & Certifications',
  'Certified Kubernetes Administrator, 2022',
  'HashiCorp Certified Terraform Associate, 2021',
];

/** Employment dates in the formats résumés use, an e-mail address, and no phone number. */
const DATES_ONLY_RESUME = [
  'John Roe',
  'john.roe@example.org',
  'Employment History',
  'Globex, 01/2019 - 03/2022',
  'Managed vendor contracts and budgets.',
  'Initech, 2015-2018',
  'Hooli, 2012 - 2015',
  'Graduated 2011-06-30',
  'Born 15.03.1990',
];

const GERMAN_RESUME = [
  'Lukas Brandt',
  'Köln, Deutschland',
  'lukas.brandt@beispiel.de',
  '030/12345678',
  'Zusammenfassung',
  'Ich bin ein Entwickler mit Erfahrung in der Logistik und im Handel.',
  'Berufserfahrung',
  'Musterfirma, 01.2019 - 03.2022',
  '• Entwickelt und optimiert die Plattform für den Versand.',
  'Ausbildung',
  'Informatik an der Universität zu Köln',
  'Fähigkeiten',
  'Kubernetes, Terraform und PostgreSQL',
];

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Speech tools and resume analyzer', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  test.describe('Text to Speech', () => {
    test('counts words, characters and sentences and cuts the text at real sentence ends', async ({
      page,
    }) => {
      await installFakeSpeechSynthesis(page);
      await openTool(page, 'text-to-speech');

      const input = page.getByRole('textbox', { name: 'Text to speak' });
      const speak = page.getByRole('button', { name: 'Speak Text' });

      // Nothing to speak yet.
      await expect(page.getByText('Words: 0 | Characters: 0')).toBeVisible();
      await expect(page.getByText('Sentences: 0')).toBeVisible();
      await expect(speak).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Copy text' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Clear all' })).toBeDisabled();

      // A title, a decimal and a domain name carry full stops that end no sentence.
      await input.fill('Dr. Smith went home. Version 3.14 is out! Visit example.com today? Yes.');
      await expect(page.getByText('Words: 12 | Characters: 71')).toBeVisible();
      await expect(page.getByText('Sentences: 4')).toBeVisible();
      await expect(speak).toBeEnabled();

      // Reader Mode lists the sentences that will be spoken, one utterance each.
      await page.getByRole('switch', { name: 'Reader Mode' }).click();
      const sentences = page.getByRole('group', { name: 'Sentences' }).getByRole('button');
      await expect(sentences).toHaveText([
        'Dr. Smith went home.',
        'Version 3.14 is out!',
        'Visit example.com today?',
        'Yes.',
      ]);
      await page.getByRole('switch', { name: 'Reader Mode' }).click();

      // A line break ends a sentence even without punctuation.
      await input.fill('Milk and eggs\nBread');
      await expect(page.getByText('Words: 4 | Characters: 19')).toBeVisible();
      await expect(page.getByText('Sentences: 2')).toBeVisible();

      // Blank text is not something to speak.
      await input.fill('   \n  ');
      await expect(page.getByText('Words: 0 | Characters: 6')).toBeVisible();
      await expect(page.getByText('Sentences: 0')).toBeVisible();
      await expect(speak).toBeDisabled();

      // Reader Mode without text explains itself.
      await input.fill('');
      await page.getByRole('switch', { name: 'Reader Mode' }).click();
      await expect(page.getByText('Enter text in the editor to use Reader Mode.')).toBeVisible();
    });

    test('speaks the sentences in order with the chosen voice, speed, pitch and volume', async ({
      page,
    }) => {
      await installFakeSpeechSynthesis(page);
      await openTool(page, 'text-to-speech');

      // The browser's default voice is preselected.
      const voice = page.getByRole('combobox', { name: 'Select Voice' });
      await expect(voice).toHaveText('Bruno Test (Local)');
      await voice.click();
      await page.getByRole('option', { name: 'Aria Test (Local)' }).click();
      await expect(voice).toHaveText('Aria Test (Local)');

      // Sliders move one step per arrow key; Home jumps to the lowest value.
      const speed = page.getByRole('group', { name: 'Speed (Rate)' });
      await speed.getByRole('slider').focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(speed.getByText('1.20x')).toBeVisible();

      const pitch = page.getByRole('group', { name: 'Pitch' });
      await pitch.getByRole('slider').focus();
      await page.keyboard.press('Home');
      await expect(pitch.getByText('0.50', { exact: true })).toBeVisible();

      const volume = page.getByRole('group', { name: 'Volume' });
      await volume.getByRole('slider').focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(volume.getByText('90%')).toBeVisible();

      await page
        .getByRole('textbox', { name: 'Text to speak' })
        .fill('Hello there. General Kenobi!');
      await page.getByRole('button', { name: 'Speak Text' }).click();

      // The first sentence goes to the engine with the settings chosen above.
      const settings = { voice: 'Aria Test', rate: 1.2, pitch: 0.5, volume: 0.9 };
      await expect.poll(() => spoken(page)).toEqual([{ text: 'Hello there.', ...settings }]);
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();

      // When the engine finishes a sentence the next one follows.
      await speechEvent(page, 0, 'start');
      await speechEvent(page, 0, 'end');
      await expect
        .poll(() => spoken(page))
        .toEqual([
          { text: 'Hello there.', ...settings },
          { text: 'General Kenobi!', ...settings },
        ]);

      // After the last sentence the tool is idle again and has nothing more to say.
      await speechEvent(page, 1, 'start');
      await speechEvent(page, 1, 'end');
      await expect(page.getByRole('button', { name: 'Speak Text' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
      expect(await spokenTexts(page)).toEqual(['Hello there.', 'General Kenobi!']);
    });

    test('pauses, resumes and stops, and speaks again after a stop made while paused', async ({
      page,
    }) => {
      await installFakeSpeechSynthesis(page);
      await openTool(page, 'text-to-speech');

      await page
        .getByRole('textbox', { name: 'Text to speak' })
        .fill('One small step. One giant leap.');
      await page.getByRole('button', { name: 'Speak Text' }).click();
      await expect.poll(() => spokenTexts(page)).toEqual(['One small step.']);
      await speechEvent(page, 0, 'start');

      await page.getByRole('button', { name: 'Pause' }).click();
      await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
      expect(await synthesisCounts(page)).toMatchObject({ pauses: 1, resumes: 0, paused: true });

      await page.getByRole('button', { name: 'Resume' }).click();
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      expect(await synthesisCounts(page)).toMatchObject({ pauses: 1, resumes: 1, paused: false });
      // Resuming carries on with the same utterance.
      expect(await spokenTexts(page)).toEqual(['One small step.']);

      // Stop while paused: the engine is told to cancel and the tool is idle.
      await page.getByRole('button', { name: 'Pause' }).click();
      await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
      const cancelsBeforeStop = (await synthesisCounts(page)).cancels;
      await page.getByRole('button', { name: 'Stop' }).click();
      await expect(page.getByRole('button', { name: 'Speak Text' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
      expect((await synthesisCounts(page)).cancels).toBe(cancelsBeforeStop + 1);

      // What the engine still reports for the stopped utterance changes nothing.
      await speechEvent(page, 0, 'end');
      await expect(page.getByRole('button', { name: 'Speak Text' })).toBeEnabled();
      expect(await spokenTexts(page)).toEqual(['One small step.']);

      // The engine is still paused from before; speaking again has to end that pause
      // or the new utterance would wait in silence. It starts over from the top.
      await page.getByRole('button', { name: 'Speak Text' }).click();
      await expect.poll(() => spokenTexts(page)).toEqual(['One small step.', 'One small step.']);
      expect((await synthesisCounts(page)).paused).toBe(false);
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      await expect(alertSaying(page, /./)).toHaveCount(0);
    });

    test('Reader Mode starts from the chosen sentence and marks the word being spoken', async ({
      page,
    }) => {
      await installFakeSpeechSynthesis(page);
      await openTool(page, 'text-to-speech');

      await page
        .getByRole('textbox', { name: 'Text to speak' })
        .fill('Hello there. General Kenobi! You are a bold one.');
      await page.getByRole('switch', { name: 'Reader Mode' }).click();

      const sentences = page.getByRole('group', { name: 'Sentences' }).getByRole('button');
      await expect(sentences).toHaveText([
        'Hello there.',
        'General Kenobi!',
        'You are a bold one.',
      ]);

      // Clicking a sentence starts there, not at the top.
      await sentences.nth(1).click();
      await expect.poll(() => spokenTexts(page)).toEqual(['General Kenobi!']);
      await speechEvent(page, 0, 'start');
      await expect(sentences.nth(1)).toHaveAttribute('aria-current', 'true');
      await expect(sentences.nth(0)).not.toHaveAttribute('aria-current', 'true');

      // "Kenobi" starts at character 8 of the sentence and is 6 characters long.
      await speechEvent(page, 0, 'boundary', { name: 'word', charIndex: 8, charLength: 6 });
      await expect(sentences.nth(1).getByText('Kenobi', { exact: true })).toBeVisible();
      await expect(sentences.nth(1)).toHaveText('General Kenobi!');

      // Some engines only say where a word starts; the word is then read from the text.
      await speechEvent(page, 0, 'boundary', { name: 'word', charIndex: 0 });
      await expect(sentences.nth(1).getByText('General', { exact: true })).toBeVisible();
      await expect(sentences.nth(1)).toHaveText('General Kenobi!');

      // The reading moves on by itself.
      await speechEvent(page, 0, 'end');
      await expect.poll(() => spokenTexts(page)).toEqual(['General Kenobi!', 'You are a bold one.']);
      await speechEvent(page, 1, 'start');
      await expect(sentences.nth(2)).toHaveAttribute('aria-current', 'true');

      // Jumping back while a sentence is being spoken replaces it. The engine
      // reports the replaced one as interrupted, and that must not skip ahead.
      await sentences.nth(0).click();
      await expect
        .poll(() => spokenTexts(page))
        .toEqual(['General Kenobi!', 'You are a bold one.', 'Hello there.']);
      await speechEvent(page, 1, 'end');
      await speechEvent(page, 2, 'start');
      await expect(sentences.nth(0)).toHaveAttribute('aria-current', 'true');
      expect(await spokenTexts(page)).toHaveLength(3);
      await expect(alertSaying(page, /./)).toHaveCount(0);

      // The list is one tab stop: arrow keys move between sentences, Enter plays one.
      await sentences.nth(0).focus();
      await page.keyboard.press('ArrowDown');
      await expect(sentences.nth(1)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(sentences.nth(2)).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(sentences.nth(1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect
        .poll(() => spokenTexts(page))
        .toEqual(['General Kenobi!', 'You are a bold one.', 'Hello there.', 'General Kenobi!']);

      // Leaving Reader Mode gives the text back unchanged.
      await page.getByRole('button', { name: 'Stop' }).click();
      await page.getByRole('switch', { name: 'Reader Mode' }).click();
      await expect(page.getByRole('textbox', { name: 'Text to speak' })).toHaveValue(
        'Hello there. General Kenobi! You are a bold one.'
      );
    });

    test('reports a sentence the engine could not speak and carries on with the next', async ({
      page,
    }) => {
      await installFakeSpeechSynthesis(page);
      await openTool(page, 'text-to-speech');

      const input = page.getByRole('textbox', { name: 'Text to speak' });
      await input.fill('First sentence. Second sentence. Third sentence.');
      await page.getByRole('button', { name: 'Speak Text' }).click();
      await expect.poll(() => spokenTexts(page)).toEqual(['First sentence.']);

      await speechEvent(page, 0, 'error', { error: 'synthesis-failed' });
      await expect(alertSaying(page, 'The speech engine could not speak this text.')).toBeVisible();
      await expect
        .poll(() => spokenTexts(page))
        .toEqual(['First sentence.', 'Second sentence.']);

      // A code the tool has no wording for is still shown, with the code.
      await speechEvent(page, 1, 'error', { error: 'engine-on-fire' });
      await expect(alertSaying(page, 'Speech playback failed (engine-on-fire).')).toBeVisible();
      await expect
        .poll(() => spokenTexts(page))
        .toEqual(['First sentence.', 'Second sentence.', 'Third sentence.']);

      // The reading still ends normally, and editing the text dismisses the message.
      await speechEvent(page, 2, 'end');
      await expect(page.getByRole('button', { name: 'Speak Text' })).toBeEnabled();
      await input.fill('Something else.');
      await expect(alertSaying(page, /Speech playback failed/)).toHaveCount(0);
    });

    test('says so when the browser has no speech synthesis, and offers nothing to press', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          get: () => undefined,
        });
      });
      await openTool(page, 'text-to-speech');

      await expect(
        alertSaying(
          page,
          'Speech synthesis is not available in this browser, so text cannot be read aloud here.'
        )
      ).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Select Voice' })).toHaveCount(0);

      // Text can still be typed and counted, but there is nothing to play it with.
      await page.getByRole('textbox', { name: 'Text to speak' }).fill('Can anybody hear me?');
      await expect(page.getByText('Words: 4 | Characters: 20')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Speak Text' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
    });

    test('speaks with the default voice until the browser has loaded its voices', async ({
      page,
    }) => {
      await installFakeSpeechSynthesis(page, []);
      await openTool(page, 'text-to-speech');

      await expect(
        page.getByText(
          "No system voices loaded. Playing will use your browser's default speech voice."
        )
      ).toBeVisible();

      await page.getByRole('textbox', { name: 'Text to speak' }).fill('Testing, testing.');
      await page.getByRole('button', { name: 'Speak Text' }).click();
      await expect
        .poll(() => spoken(page))
        .toEqual([{ text: 'Testing, testing.', voice: null, rate: 1, pitch: 1, volume: 1 }]);
      await page.getByRole('button', { name: 'Stop' }).click();

      // Chrome fills in its voices a moment after the page has loaded.
      await page.evaluate((voices) => {
        (window as unknown as SynthesisWindow).__speechAtsSynthesis.announceVoices(voices);
      }, VOICES);
      const voice = page.getByRole('combobox', { name: 'Select Voice' });
      await expect(voice).toHaveText('Bruno Test (Local)');

      // Voices are listed under their language; a voice that is not on the device has no "(Local)".
      await voice.click();
      await expect(page.getByRole('option')).toHaveText([
        'Aria Test (Local)',
        'Bruno Test (Local)',
        'Clara Test',
      ]);
      await expect(page.getByText('de-DE', { exact: true })).toBeVisible();
      await page.getByRole('option', { name: 'Clara Test' }).click();

      await page.getByRole('button', { name: 'Speak Text' }).click();
      await expect
        .poll(async () => (await spoken(page)).at(-1))
        .toEqual({ text: 'Testing, testing.', voice: 'Clara Test', rate: 1, pitch: 1, volume: 1 });
    });

    test('pastes from the clipboard, copies the text and clears it', async ({ page, context }) => {
      await installFakeSpeechSynthesis(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'text-to-speech');

      const input = page.getByRole('textbox', { name: 'Text to speak' });

      await page.evaluate(() => navigator.clipboard.writeText('Pasted from the clipboard. Twice.'));
      await page.getByRole('button', { name: 'Paste from clipboard' }).click();
      await expect(input).toHaveValue('Pasted from the clipboard. Twice.');
      await expect(page.getByText('Sentences: 2')).toBeVisible();

      await input.fill('Copy this sentence.');
      await page.getByRole('button', { name: 'Copy text' }).click();
      await expect(page.getByRole('button', { name: 'Copy text' })).toHaveText('Copied');
      expect(await readClipboard(page)).toBe('Copy this sentence.');

      // Clear also ends a reading that is under way.
      await page.getByRole('button', { name: 'Speak Text' }).click();
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      await page.getByRole('button', { name: 'Clear all' }).click();
      await expect(input).toHaveValue('');
      await expect(page.getByText('Words: 0 | Characters: 0')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Speak Text' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Clear all' })).toBeDisabled();
    });

    test('explains a Paste the browser refused', async ({ page }) => {
      await installFakeSpeechSynthesis(page);
      // A browser that refuses to hand over the clipboard, as one does when the permission is denied.
      await page.addInitScript(() => {
        navigator.clipboard.readText = () =>
          Promise.reject(new DOMException('Read permission denied.', 'NotAllowedError'));
      });
      await openTool(page, 'text-to-speech');

      const input = page.getByRole('textbox', { name: 'Text to speak' });
      await input.fill('Keep me.');
      await page.getByRole('button', { name: 'Paste from clipboard' }).click();

      await expect(
        alertSaying(
          page,
          'The clipboard could not be read. Allow clipboard access for this site, or paste into the text box with your keyboard.'
        )
      ).toBeVisible();
      // The text that was there is not lost.
      await expect(input).toHaveValue('Keep me.');
    });
  });

  test.describe('Speech to Text', () => {
    test('writes down what is recognized: interim words, final phrases, and the last words after Stop', async ({
      page,
      context,
    }) => {
      await installFakeSpeechRecognition(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'speech-to-text');

      // Idle: defaults are shown and there is nothing to save yet.
      const language = page.getByRole('combobox', { name: 'Spoken Language' });
      const continuous = page.getByRole('switch', { name: 'Continuous Listening' });
      await expect(language).toHaveText('English (United States)');
      await expect(continuous).toBeChecked();
      await expect(
        page.getByText('Click "Start Recording" and speak to see the live transcript here.')
      ).toBeVisible();
      for (const name of [
        'Download as TXT',
        'Download as Markdown',
        'Copy transcript',
        'Clear transcript',
      ]) {
        await expect(page.getByRole('button', { name })).toBeDisabled();
      }

      // Start: one recognizer, configured from the settings, and it is asked to start.
      await page.getByRole('button', { name: 'Start Recording' }).click();
      await expect
        .poll(() => recognitionSessions(page))
        .toEqual([
          {
            lang: 'en-US',
            continuous: true,
            interimResults: true,
            started: 1,
            stopped: 0,
            aborted: 0,
          },
        ]);
      await recognitionEvent(page, 0, 'start');

      // Listening: the settings are locked and the page says it is live.
      await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible();
      await expect(page.getByText('Live', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Listening... Start speaking into your microphone.')
      ).toBeVisible();
      await expect(language).toBeDisabled();
      await expect(continuous).toBeDisabled();
      expect(await micTrackStates(page)).toEqual(['live']);

      // Words still being worked out are shown as such and are not part of the transcript.
      await recognize(page, 0, 0, [{ text: 'hello wor', final: false }]);
      await expect(page.getByText('hello wor...', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy transcript' })).toBeDisabled();

      // The phrase is settled; Chrome starts every later phrase with a space.
      await recognize(page, 0, 0, [{ text: 'Hello world.', final: true }]);
      await expect(page.getByText('Hello world.', { exact: true })).toBeVisible();
      await expect(page.getByText('hello wor...', { exact: true })).toHaveCount(0);

      await recognize(page, 0, 1, [
        { text: 'Hello world.', final: true },
        { text: ' this is a', final: false },
      ]);
      await expect(page.getByText('this is a...', { exact: true })).toBeVisible();

      await recognize(page, 0, 1, [
        { text: 'Hello world.', final: true },
        { text: ' This is a test.', final: true },
      ]);
      await expect(page.getByText('Hello world. This is a test.', { exact: true })).toBeVisible();

      // Stop: the recognizer is asked to stop (not to abort) and the microphone is released.
      await page.getByRole('button', { name: 'Stop Recording' }).click();
      await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();
      await expect(page.getByText('Live', { exact: true })).toHaveCount(0);
      await expect(language).toBeEnabled();
      await expect(continuous).toBeEnabled();
      expect(await recognitionSessions(page)).toMatchObject([{ stopped: 1, aborted: 0 }]);
      expect(await micTrackStates(page)).toEqual(['ended']);

      // A stopped recognizer still delivers what it had heard, and then ends.
      await recognize(page, 0, 2, [
        { text: 'Hello world.', final: true },
        { text: ' This is a test.', final: true },
        { text: ' One more thing.', final: true },
      ]);
      await recognitionEvent(page, 0, 'end');
      await expect(
        page.getByText('Hello world. This is a test. One more thing.', { exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();

      // Copy gives the transcript exactly: one space between phrases, none doubled.
      await page.getByRole('button', { name: 'Copy transcript' }).click();
      await expect(page.getByRole('button', { name: 'Copy transcript' })).toHaveText('Copied');
      expect(await readClipboard(page)).toBe('Hello world. This is a test. One more thing.');

      // Clear empties the transcript and there is nothing to save any more.
      await page.getByRole('button', { name: 'Clear transcript' }).click();
      await expect(
        page.getByText('Click "Start Recording" and speak to see the live transcript here.')
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download as TXT' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Clear transcript' })).toBeDisabled();
    });

    test('downloads the transcript as TXT and as Markdown, named by the date', async ({ page }) => {
      await page.clock.setFixedTime(new Date(2026, 2, 9, 12, 0, 0));
      await installFakeSpeechRecognition(page);
      await openTool(page, 'speech-to-text');

      await startRecording(page);
      await recognize(page, 0, 0, [{ text: 'Buy milk.', final: true }]);
      await recognize(page, 0, 1, [
        { text: 'Buy milk.', final: true },
        { text: ' Call the dentist.', final: true },
      ]);
      await page.getByRole('button', { name: 'Stop Recording' }).click();
      await expect(page.getByText('Buy milk. Call the dentist.', { exact: true })).toBeVisible();

      const txtDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download as TXT' }).click();
      const txt = await txtDownload;
      expect(txt.suggestedFilename()).toBe('transcript-2026-03-09.txt');
      expect(await readFile(await txt.path(), 'utf8')).toBe('Buy milk. Call the dentist.');

      const mdDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download as Markdown' }).click();
      const md = await mdDownload;
      expect(md.suggestedFilename()).toBe('transcript-2026-03-09.md');
      expect(await readFile(await md.path(), 'utf8')).toBe('Buy milk. Call the dentist.');
    });

    test.describe('far east of Greenwich', () => {
      // 14 hours ahead of UTC: for most of the day the UTC date is still yesterday.
      test.use({ timezoneId: 'Pacific/Kiritimati' });

      test('names the download by the date on the user’s own calendar', async ({ page }) => {
        // Noon UTC on 9 March is 02:00 on 10 March in Kiritimati.
        await page.clock.setFixedTime(new Date('2026-03-09T12:00:00Z'));
        await installFakeSpeechRecognition(page);
        await openTool(page, 'speech-to-text');

        await startRecording(page);
        await recognize(page, 0, 0, [{ text: 'Good morning.', final: true }]);
        await page.getByRole('button', { name: 'Stop Recording' }).click();

        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download as TXT' }).click();
        expect((await download).suggestedFilename()).toBe('transcript-2026-03-10.txt');
      });
    });

    test('passes the chosen language and listening mode on, and joins Japanese without spaces', async ({
      page,
      context,
    }) => {
      await installFakeSpeechRecognition(page);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'speech-to-text');

      const language = page.getByRole('combobox', { name: 'Spoken Language' });

      // The list is long enough to come with a search box.
      await language.click();
      await expect(page.getByRole('option')).toHaveCount(16);
      await page.getByPlaceholder('Search...').fill('japan');
      await expect(page.getByRole('option')).toHaveText(['Japanese (Japan)']);
      await page.keyboard.press('Enter');
      await expect(language).toHaveText('Japanese (Japan)');

      await page.getByRole('switch', { name: 'Continuous Listening' }).click();
      await expect(page.getByRole('switch', { name: 'Continuous Listening' })).not.toBeChecked();

      await startRecording(page);
      expect(await recognitionSessions(page)).toMatchObject([
        { lang: 'ja-JP', continuous: false, interimResults: true },
      ]);

      // Japanese is written without spaces between words, so phrases are joined directly.
      await recognize(page, 0, 0, [{ text: 'こんにちは', final: true }]);
      await recognize(page, 0, 1, [
        { text: 'こんにちは', final: true },
        { text: ' 世界', final: true },
      ]);
      await expect(page.getByText('こんにちは世界', { exact: true })).toBeVisible();

      // Without continuous listening the recognizer ends by itself after a pause.
      await recognitionEvent(page, 0, 'end');
      await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();
      await expect(language).toBeEnabled();

      await page.getByRole('button', { name: 'Copy transcript' }).click();
      await expect(page.getByRole('button', { name: 'Copy transcript' })).toHaveText('Copied');
      expect(await readClipboard(page)).toBe('こんにちは世界');

      // The language list can be worked with the keyboard alone.
      await language.click();
      await expect(page.getByRole('option', { name: 'Japanese (Japan)' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(language).toHaveText('Chinese (Mandarin - China)');
    });

    test('waits for the microphone prompt before it starts the recognizer', async ({ page }) => {
      await installFakeSpeechRecognition(page, 'prompt');
      await openTool(page, 'speech-to-text');

      await page.getByRole('button', { name: 'Start Recording' }).click();

      // The prompt is open: nothing is recording, and Start cannot be pressed a second time.
      await expect(page.getByText('Waiting for access to your microphone...')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Recording' })).toBeDisabled();
      await expect(page.getByRole('combobox', { name: 'Spoken Language' })).toBeDisabled();
      expect(await recognitionSessions(page)).toMatchObject([{ started: 0 }]);

      await page.evaluate(() => {
        (window as unknown as RecognitionWindow).__speechAtsRecognition.allowMic?.();
      });
      await expect.poll(() => recognitionSessions(page)).toMatchObject([{ started: 1 }]);
      await recognitionEvent(page, 0, 'start');

      await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible();
      expect(await recognitionSessions(page)).toHaveLength(1);
      expect(await micTrackStates(page)).toEqual(['live']);
    });

    test('puts recognition failures into words and returns to idle', async ({ page }) => {
      await installFakeSpeechRecognition(page, 'blocked');
      await openTool(page, 'speech-to-text');

      const start = page.getByRole('button', { name: 'Start Recording' });

      // The microphone is blocked: the waveform is skipped and the recognizer reports the block.
      await start.click();
      await expect.poll(() => recognitionSessions(page)).toMatchObject([{ started: 1 }]);
      await recognitionEvent(page, 0, 'error', { error: 'not-allowed' });
      await expect(
        alertSaying(
          page,
          'Microphone access blocked. Please enable mic permissions in your browser.'
        )
      ).toBeVisible();
      await recognitionEvent(page, 0, 'end');
      await expect(start).toBeEnabled();
      await expect(page.getByRole('combobox', { name: 'Spoken Language' })).toBeEnabled();

      // Trying again clears the old message; silence gets its own.
      await start.click();
      await expect.poll(() => recognitionSessions(page)).toMatchObject([{}, { started: 1 }]);
      await expect(alertSaying(page, /Microphone access blocked/)).toHaveCount(0);
      await recognitionEvent(page, 1, 'start');
      await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible();
      await recognitionEvent(page, 1, 'error', { error: 'no-speech' });
      await expect(
        alertSaying(page, 'No speech was detected. Check your microphone and try again.')
      ).toBeVisible();
      await recognitionEvent(page, 1, 'end');
      await expect(start).toBeEnabled();

      // A recognizer that was merely cut off has nothing to report.
      await start.click();
      await expect.poll(() => recognitionSessions(page)).toMatchObject([{}, {}, { started: 1 }]);
      await recognitionEvent(page, 2, 'start');
      await recognitionEvent(page, 2, 'error', { error: 'aborted' });
      await recognitionEvent(page, 2, 'end');
      await expect(start).toBeEnabled();
      await expect(alertSaying(page, /./)).toHaveCount(0);

      // A recognizer that refuses to start at all.
      await page.evaluate(() => {
        (window as unknown as RecognitionWindow).__speechAtsRecognition.startFailure =
          'recognition has already started';
      });
      await start.click();
      await expect(alertSaying(page, 'recognition has already started')).toBeVisible();
      await expect(start).toBeEnabled();
    });

    test('releases the microphone when the recognizer cannot be started', async ({ page }) => {
      await installFakeSpeechRecognition(page);
      await page.addInitScript(() => {
        (window as unknown as RecognitionWindow).__speechAtsRecognition.startFailure =
          'The recognizer is busy.';
      });
      await openTool(page, 'speech-to-text');

      await page.getByRole('button', { name: 'Start Recording' }).click();

      await expect(alertSaying(page, 'The recognizer is busy.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();
      // The stream opened for the waveform must not stay open behind an idle page.
      expect(await micTrackStates(page)).toEqual(['ended']);
    });

    test('Clear while listening ends the session and drops what it still reports', async ({
      page,
    }) => {
      await installFakeSpeechRecognition(page);
      await openTool(page, 'speech-to-text');

      await startRecording(page);
      await recognize(page, 0, 0, [{ text: 'Draft one.', final: true }]);
      await expect(page.getByText('Draft one.', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Clear transcript' }).click();
      const placeholder = page.getByText(
        'Click "Start Recording" and speak to see the live transcript here.'
      );
      await expect(placeholder).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();
      expect(await recognitionSessions(page)).toMatchObject([{ aborted: 1 }]);
      expect(await micTrackStates(page)).toEqual(['ended']);

      // The recognizer's parting words belong to the transcript that was thrown away.
      await recognize(page, 0, 1, [
        { text: 'Draft one.', final: true },
        { text: ' Draft two.', final: true },
      ]);
      await recognitionEvent(page, 0, 'end');
      await expect(placeholder).toBeVisible();
      await expect(page.getByText(/Draft/)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy transcript' })).toBeDisabled();
    });

    test('a session that was stopped cannot disturb the one started after it', async ({ page }) => {
      await installFakeSpeechRecognition(page);
      await openTool(page, 'speech-to-text');

      await startRecording(page, 0);
      await recognize(page, 0, 0, [{ text: 'First take.', final: true }]);
      await page.getByRole('button', { name: 'Stop Recording' }).click();
      await expect(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();

      // Start again before the first recognizer has reported that it ended.
      await startRecording(page, 1);

      // The first one now ends, and complains on the way out. Neither concerns the new session.
      await recognitionEvent(page, 0, 'error', { error: 'no-speech' });
      await recognitionEvent(page, 0, 'end');
      await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible();
      await expect(page.getByText('Live', { exact: true })).toBeVisible();
      await expect(alertSaying(page, /./)).toHaveCount(0);

      // The new session adds to the transcript that is already there.
      await recognize(page, 1, 0, [{ text: 'Second take.', final: true }]);
      await expect(page.getByText('First take. Second take.', { exact: true })).toBeVisible();
      expect(await micTrackStates(page)).toEqual(['ended', 'live']);
    });

    test('explains itself in a browser without speech recognition', async ({ page }) => {
      await page.addInitScript(() => {
        const scope = window as unknown as Record<string, unknown>;
        scope.SpeechRecognition = undefined;
        scope.webkitSpeechRecognition = undefined;
      });
      await openTool(page, 'speech-to-text');

      await expect(page.getByText('Browser Not Supported', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Speech Recognition is unavailable in this browser')
      ).toBeVisible();
      await expect(page.getByRole('listitem').filter({ hasText: 'Google Chrome' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Recording' })).toHaveCount(0);
    });
  });

  test.describe('CV / Resume ATS Analyzer', () => {
    test('scores a résumé and lines it up with a job description', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openTool(page, 'resume-ats-analyzer');

      // Nothing to analyze yet.
      await expect(page.getByText('No file chosen')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Analyze Resume' })).toBeDisabled();

      const resume = await buildPdf([SHORT_RESUME]);
      await chooseResume(page, pdfFile('jane-doe.pdf', resume));

      // The file is named next to the button and again, with its size in whole KB, below.
      await expect(page.getByText('jane-doe.pdf', { exact: true })).toHaveCount(2);
      await expect(
        page.getByText(`jane-doe.pdf · ${Math.round(resume.length / 1024)} KB`)
      ).toBeVisible();

      // The job asks for seven things; "with", "and" and the year are not among them.
      await page
        .getByRole('textbox', { name: 'Optional Job Description' })
        .fill('Backend engineer with Kubernetes, PostgreSQL, GraphQL and Rust. 2024 start.');
      await analyze(page);

      await expect(page.getByText('Resume language: English')).toBeVisible();
      await expect(page.getByText(/^\d+% auto-detected$/)).toBeVisible();
      await expect(page.getByText('Job description: English')).toBeVisible();

      await expect(metric(page, 'Pages', 1)).toBeVisible();
      await expect(metric(page, 'Bullets', 4)).toBeVisible();
      // Built, Led, Improved, Reduced.
      await expect(metric(page, 'Action Verbs', 4)).toBeVisible();

      // E-mail 5, phone 5, LinkedIn 4, website 3, location 3.
      await expect(breakdownRow(page, 'Contact Details', 20)).toBeVisible();
      // Four of the six sections, 4 points each. "Work Experience" and "Key Skills" are headings too.
      await expect(breakdownRow(page, 'Sections', 16)).toBeVisible();
      await expect(
        chipGroup(page, 'Found sections', ['Summary', 'Experience', 'Education', 'Skills'])
      ).toBeVisible();
      await expect(
        chipGroup(page, 'Missing opportunities', ['Projects', 'Certifications'])
      ).toBeVisible();
      // One page 4, four bullets 4, four action verbs 2, short words 3; too few words for more.
      await expect(breakdownRow(page, 'ATS Heuristics', 13)).toBeVisible();
      // 4 of the 7 job keywords are in the résumé: 4 / 7 of 20 points, rounded.
      await expect(breakdownRow(page, 'Keyword Match', 11)).toBeVisible();
      await expect(
        chipGroup(page, 'Matched', ['backend', 'engineer', 'kubernetes', 'postgresql'])
      ).toBeVisible();
      await expect(
        chipGroup(page, 'Missing / Underrepresented', ['graphql', 'rust', 'start'])
      ).toBeVisible();

      // The total is the sum of the five areas.
      const readability = await readabilityPoints(page);
      await expect(
        page.getByText(`${20 + 16 + 13 + 11 + readability}/100`, { exact: true })
      ).toBeVisible();

      // Only the length is worth a remark; the contact details are complete.
      await expect(
        page.getByText(
          'Add more measurable project or impact detail; the extracted text is currently quite short.'
        )
      ).toBeVisible();
      await expect(page.getByText(/Add a clearly extractable email address/)).toHaveCount(0);
      await expect(page.getByText(/Add a short summary section/)).toHaveCount(0);
      await expect(page.getByText(/Add a dedicated skills section/)).toHaveCount(0);
      await expect(page.getByText(/Use more bullet points/)).toHaveCount(0);

      // The text is shown line by line as it was read, and can be copied.
      await expect(extractedText(page)).toHaveValue(SHORT_RESUME.join('\n'));
      await page.getByRole('button', { name: 'Copy Text' }).click();
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await readClipboard(page)).toBe(SHORT_RESUME.join('\n'));
    });

    test('finds nothing to improve in a complete résumé', async ({ page }) => {
      await openTool(page, 'resume-ats-analyzer');

      await chooseResume(page, pdfFile('maria-keller.pdf', await buildPdf([STRONG_RESUME])));
      await analyze(page);

      await expect(metric(page, 'Pages', 1)).toBeVisible();
      await expect(metric(page, 'Bullets', 13)).toBeVisible();
      await expect(metric(page, 'Action Verbs', 13)).toBeVisible();

      await expect(breakdownRow(page, 'Contact Details', 20)).toBeVisible();
      // "Professional Summary", "Work Experience", "Technical Skills", "Personal Projects" and
      // "Licenses & Certifications" all count as their section.
      await expect(breakdownRow(page, 'Sections', 20)).toBeVisible();
      await expect(
        chipGroup(page, 'Found sections', [
          'Summary',
          'Experience',
          'Education',
          'Skills',
          'Projects',
          'Certifications',
        ])
      ).toBeVisible();
      await expect(
        chipGroup(page, 'Missing opportunities', ['None. Every standard section was found.'])
      ).toBeVisible();
      // 250 to 1100 words 6, one page 4, bullets 4, action verbs 3, short words 3.
      await expect(breakdownRow(page, 'ATS Heuristics', 20)).toBeVisible();
      // Without a job description a résumé with a skills section gets 12.
      await expect(breakdownRow(page, 'Keyword Match', 12)).toBeVisible();

      const readability = await readabilityPoints(page);
      await expect(
        page.getByText(`${20 + 20 + 20 + 12 + readability}/100`, { exact: true })
      ).toBeVisible();

      // Kubernetes is named 7 times, Terraform 5 times, platform 4 times; nothing else as often.
      await expect(metric(page, 'Top Keywords', 'kubernetes, terraform, platform')).toBeVisible();

      // No job description: both keyword lists ask for one.
      await expect(
        chipGroup(page, 'Matched', ['Add a job description to evaluate keyword alignment.'])
      ).toBeVisible();
      await expect(
        chipGroup(page, 'Missing / Underrepresented', [
          'Add a job description to see which of its keywords are missing.',
        ])
      ).toBeVisible();

      await expect(
        page.getByText('No priority improvements were found for this resume.')
      ).toBeVisible();
    });

    test('does not take employment dates for a phone number', async ({ page }) => {
      await openTool(page, 'resume-ats-analyzer');

      await chooseResume(page, pdfFile('john-roe.pdf', await buildPdf([DATES_ONLY_RESUME])));
      // Nothing in this job description is in the résumé.
      await page
        .getByRole('textbox', { name: 'Optional Job Description' })
        .fill('Kubernetes and Terraform');
      await analyze(page);

      // Only the e-mail address counts: 5 of 20. A phone number would make it 10.
      await expect(breakdownRow(page, 'Contact Details', 5)).toBeVisible();
      await expect(
        page.getByText('Add a clearly extractable email address and phone number near the top.')
      ).toBeVisible();

      // "Employment History" is the experience section; nothing else is there.
      await expect(breakdownRow(page, 'Sections', 4)).toBeVisible();
      await expect(chipGroup(page, 'Found sections', ['Experience'])).toBeVisible();
      await expect(metric(page, 'Bullets', 0)).toBeVisible();
      await expect(metric(page, 'Action Verbs', 1)).toBeVisible();

      // A job description was given and nothing matched, which is not the same as none given.
      await expect(breakdownRow(page, 'Keyword Match', 0)).toBeVisible();
      await expect(
        chipGroup(page, 'Matched', [
          'None of the job description keywords were found in the resume.',
        ])
      ).toBeVisible();
      await expect(
        chipGroup(page, 'Missing / Underrepresented', ['kubernetes', 'terraform'])
      ).toBeVisible();
      await expect(
        page.getByText(
          'Mirror more job-description keywords naturally in your summary, skills, and experience bullets.'
        )
      ).toBeVisible();
    });

    test('reads a German résumé in German and counts pages, words and sentences', async ({
      page,
    }) => {
      await openTool(page, 'resume-ats-analyzer');

      await chooseResume(page, pdfFile('lebenslauf.pdf', await buildPdf([GERMAN_RESUME])));
      await analyze(page);

      await expect(page.getByText('Resume language: Deutsch')).toBeVisible();
      // German texts get the German reading-ease formula.
      await expect(page.getByText('Amstad', { exact: true })).toBeVisible();
      await expect(page.getByText('Flesch Reading Ease', { exact: true })).toHaveCount(0);

      // E-mail 5, a phone number written with a slash 5, "Köln, Deutschland" 3.
      await expect(breakdownRow(page, 'Contact Details', 13)).toBeVisible();
      await expect(breakdownRow(page, 'Sections', 16)).toBeVisible();
      await expect(
        chipGroup(page, 'Found sections', [
          'Zusammenfassung',
          'Berufserfahrung',
          'Ausbildung',
          'Fähigkeiten',
        ])
      ).toBeVisible();
      await expect(
        chipGroup(page, 'Missing opportunities', ['Projekte', 'Zertifikate'])
      ).toBeVisible();
      await expect(metric(page, 'Bullets', 1)).toBeVisible();
      // "Entwickelt" and "optimiert".
      await expect(metric(page, 'Action Verbs', 2)).toBeVisible();

      // The advice comes in the résumé's language.
      await expect(
        page.getByText('Verwenden Sie für Erfolge mehr Aufzählungspunkte statt dichter Absätze.')
      ).toBeVisible();
      await expect(page.getByText(/Fügen Sie oben eine eindeutig auslesbare/)).toHaveCount(0);
      await expect(extractedText(page)).toHaveValue(GERMAN_RESUME.join('\n'));

      // Choosing another file takes the old result off the screen.
      const notes = await buildPdf([
        ['Quarterly planning notes for the team.'],
        ['Nothing else to report here.'],
      ]);
      await chooseResume(page, pdfFile('notes.pdf', notes));
      await expect(page.getByText('ATS Score', { exact: true })).toHaveCount(0);
      await expect(page.getByText('notes.pdf', { exact: true })).toHaveCount(2);

      // Saying which language it is skips the detection.
      await page.getByRole('combobox', { name: 'Resume language' }).click();
      await page.getByRole('option', { name: 'English' }).click();
      await analyze(page);

      await expect(page.getByText('Resume language: English')).toBeVisible();
      await expect(page.getByText('manually selected')).toBeVisible();
      await expect(page.getByText(/auto-detected/)).toHaveCount(0);
      // Two pages with one sentence each: 6 words and 5 words.
      await expect(metric(page, 'Pages', 2)).toBeVisible();
      await expect(metric(page, 'Words', 11)).toBeVisible();
      await expect(metric(page, 'Sentences', 2)).toBeVisible();
      // 11 words at 220 words a minute are 3 seconds.
      await expect(metric(page, 'Read Time', '3 sec')).toBeVisible();
      await expect(breakdownRow(page, 'Contact Details', 0)).toBeVisible();
      await expect(breakdownRow(page, 'Sections', 0)).toBeVisible();
      await expect(
        chipGroup(page, 'Found sections', ['No standard sections detected.'])
      ).toBeVisible();
      // Pages are separated by an empty line.
      await expect(extractedText(page)).toHaveValue(
        'Quarterly planning notes for the team.\n\nNothing else to report here.'
      );
    });

    test('refuses files that are not PDFs and explains PDFs it cannot read', async ({ page }) => {
      await openTool(page, 'resume-ats-analyzer');

      const analyzeButton = page.getByRole('button', { name: 'Analyze Resume' });

      // Not a PDF: it is named in the message and never becomes the chosen file.
      await chooseResume(page, {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('not a pdf'),
      });
      await expect(
        alertSaying(page, '"resume.docx" is not a supported file type.')
      ).toBeVisible();
      await expect(page.getByText('No file chosen')).toBeVisible();
      await expect(analyzeButton).toBeDisabled();

      // A scan: pages, but no text layer. Choosing a PDF also clears the earlier refusal.
      await chooseResume(page, pdfFile('scan.pdf', await buildPdf([[]])));
      await expect(alertSaying(page, /is not a supported file type/)).toHaveCount(0);
      await analyzeButton.click();
      await expect(
        alertSaying(
          page,
          'Error: No selectable text was found in this PDF. Try a PDF with a text layer.'
        )
      ).toBeVisible();
      await expect(page.getByText('ATS Score', { exact: true })).toHaveCount(0);
      await expect(analyzeButton).toBeEnabled();

      // Called a PDF, but it is not one.
      await chooseResume(page, pdfFile('broken.pdf', Buffer.from('this is not a pdf at all')));
      await expect(alertSaying(page, /No selectable text/)).toHaveCount(0);
      await expect(page.getByText('broken.pdf · 0 KB')).toBeVisible();
      await analyzeButton.click();
      await expect(alertSaying(page, 'Error: Invalid PDF structure.')).toBeVisible();
      await expect(page.getByText('ATS Score', { exact: true })).toHaveCount(0);
      await expect(analyzeButton).toBeEnabled();

      // A file dropped on the picker goes through the same check.
      const picture = await page.evaluateHandle(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['pixels'], 'photo.png', { type: 'image/png' }));
        return transfer;
      });
      await page
        .getByRole('button', { name: 'Choose File, PDF resume' })
        .dispatchEvent('drop', { dataTransfer: picture });
      await expect(alertSaying(page, '"photo.png" is not a supported file type.')).toBeVisible();
      await expect(page.getByText('broken.pdf · 0 KB')).toBeVisible();

      // A good PDF after all of that is analyzed normally and the errors are gone.
      await chooseResume(page, pdfFile('jane-doe.pdf', await buildPdf([SHORT_RESUME])));
      await expect(alertSaying(page, /./)).toHaveCount(0);
      await analyze(page);
      await expect(breakdownRow(page, 'Contact Details', 20)).toBeVisible();
    });

    test('takes a dropped PDF, and Clear puts everything back', async ({ page }) => {
      await openTool(page, 'resume-ats-analyzer');

      const resume = await buildPdf([SHORT_RESUME]);
      const dropped = await page.evaluateHandle((bytes) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], 'dropped.pdf', { type: 'application/pdf' })
        );
        return transfer;
      }, Array.from(resume));
      await page
        .getByRole('button', { name: 'Choose File, PDF resume' })
        .dispatchEvent('drop', { dataTransfer: dropped });
      await expect(page.getByText('dropped.pdf', { exact: true })).toHaveCount(2);

      const resumeLanguage = page.getByRole('combobox', { name: 'Resume language' });
      const jobLanguage = page.getByRole('combobox', { name: 'Job description language' });
      const jobDescription = page.getByRole('textbox', { name: 'Optional Job Description' });

      await selectOption(page, resumeLanguage, 'English');
      await selectOption(page, jobLanguage, 'Deutsch');
      await jobDescription.fill('Kubernetes Plattform');
      await analyze(page);

      await expect(page.getByText('manually selected')).toBeVisible();
      await expect(page.getByText('Job description: Deutsch')).toBeVisible();
      await expect(breakdownRow(page, 'Contact Details', 20)).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();

      await expect(page.getByText('No file chosen')).toBeVisible();
      await expect(page.getByText(/dropped\.pdf/)).toHaveCount(0);
      await expect(page.getByText('ATS Score', { exact: true })).toHaveCount(0);
      await expect(extractedText(page)).toHaveCount(0);
      await expect(jobDescription).toHaveValue('');
      await expect(resumeLanguage).toHaveText('Auto-detect');
      await expect(jobLanguage).toHaveText('Auto-detect');
      await expect(page.getByRole('button', { name: 'Analyze Resume' })).toBeDisabled();

      // The same file can be chosen again straight away.
      await chooseResume(page, pdfFile('dropped.pdf', resume));
      await analyze(page);
      await expect(page.getByText(/^\d+% auto-detected$/)).toBeVisible();
      await expect(breakdownRow(page, 'Contact Details', 20)).toBeVisible();
    });

    test('an analysis that was abandoned does not come back', async ({ page }) => {
      await openTool(page, 'resume-ats-analyzer');

      // Hold back the PDF reader's worker, so that reading a file takes as long as the test wants.
      let letWorkerLoad = () => {};
      const workerMayLoad = new Promise<void>((resolve) => {
        letWorkerLoad = resolve;
      });
      await page.route('**/pdf.worker*', async (route) => {
        await workerMayLoad;
        await route.continue();
      });

      await chooseResume(page, pdfFile('first.pdf', await buildPdf([SHORT_RESUME])));
      await page.getByRole('button', { name: 'Analyze Resume' }).click();
      await expect(page.getByRole('button', { name: 'Analyzing PDF...' })).toBeDisabled();

      // Clear in the middle of it: back to the start, and not stuck on "Analyzing".
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByText('No file chosen')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Analyze Resume' })).toBeDisabled();

      // Another file, while the first one is still being read.
      const second = await buildPdf([['Quarterly planning notes for the team.']]);
      await chooseResume(page, pdfFile('second.pdf', second));
      await page.getByRole('button', { name: 'Analyze Resume' }).click();
      await expect(page.getByRole('button', { name: 'Analyzing PDF...' })).toBeDisabled();

      letWorkerLoad();

      // The result on screen is the second file's: six words and no contact details.
      await expect(metric(page, 'Words', 6)).toBeVisible();
      await expect(breakdownRow(page, 'Contact Details', 0)).toBeVisible();
      await expect(extractedText(page)).toHaveValue('Quarterly planning notes for the team.');
      await expect(page.getByText('second.pdf', { exact: true })).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Analyze Resume' })).toBeEnabled();
    });

    test('warns when it cannot tell the language of the résumé', async ({ page }) => {
      await openTool(page, 'resume-ats-analyzer');

      // No word here is typical of English, German or Turkish.
      await chooseResume(
        page,
        pdfFile('lorem.pdf', await buildPdf([['Lorem ipsum dolor sit amet consectetur.']]))
      );
      await analyze(page);

      await expect(page.getByText('0% auto-detected')).toBeVisible();
      await expect(
        page.getByText(
          'Language detection is uncertain. Select the résumé language manually for more reliable scoring.'
        )
      ).toBeVisible();
      await expect(metric(page, 'Words', 6)).toBeVisible();
      await expect(metric(page, 'Sentences', 1)).toBeVisible();
    });
  });
});

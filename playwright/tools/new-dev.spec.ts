import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * End-to-end flows for three developer tools: the ULID Generator and Decoder,
 * the Chmod Calculator and Docker Run to Compose. Everything runs in the page;
 * nothing is stubbed over the network.
 */

test.use({
  timezoneId: 'UTC',
  locale: 'en-US',
  permissions: ['clipboard-read', 'clipboard-write'],
});

/**
 * Opens a tool page and waits until React has hydrated it. The page is
 * prerendered, so the fields exist before they react to input; once hydrated
 * the page records itself as a recent tool, which is what is waited for.
 */
async function openTool(page: Page, slug: string, name: string) {
  const response = await page.goto(`/tools/${slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.waitForFunction(
    (id) => (window.localStorage.getItem('dev-toolbox:recent') ?? '').includes(id),
    slug
  );
}

/** The clipboard text. Windows hands multi-line text back with CRLF line ends. */
async function readClipboard(page: Page) {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.replace(/\r\n/g, '\n');
}

/** Clicks something that saves a file and returns its name and text. */
async function saveFrom(page: Page, trigger: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

/** The value shown under a label such as "Unix milliseconds": the label's next sibling. */
function valueOf(scope: Locator, label: string) {
  return scope.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
}

test.describe('Developer tools', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Tool flows are verified on Chromium');

  // A tool that throws, or logs an error while it is used, has a defect even if its output looks right.
  let problems: string[];
  test.beforeEach(({ page }) => {
    problems = [];
    page.on('pageerror', (error) => problems.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // ULID Generator & Decoder
  // ---------------------------------------------------------------------------
  test.describe('ULID Generator & Decoder', () => {
    // The clock stands at 2016-08-01T00:00:00Z, which is 01AS1PCT00 as a ULID timestamp.
    const NOW = '2016-08-01T00:00:00.000Z';
    // The example ULID from the ULID specification and the same 128 bits as a UUID.
    const SPEC_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const SPEC_UUID = '01563e3a-b5d3-d676-4c61-efb99302bd5b';

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(new Date(NOW));
    });

    /** Makes the 10 random bytes behind each ULID all `byte`; the byte can be changed later in the page. */
    async function fixRandomness(page: Page, byte: number) {
      await page.addInitScript((initial) => {
        Object.assign(window, { __randomByte: initial });
        const real = crypto.getRandomValues.bind(crypto);
        Object.defineProperty(crypto, 'getRandomValues', {
          configurable: true,
          value: (array: Uint8Array) => {
            if (!(array instanceof Uint8Array) || array.length !== 10) return real(array);
            return array.fill((window as unknown as { __randomByte: number }).__randomByte);
          },
        });
      }, byte);
    }

    const resultList = (page: Page) => page.getByRole('list', { name: 'Generated ULIDs' }).getByRole('listitem');

    test('generates a batch, follows the letter case, and copies, saves and clears it', async ({ page }) => {
      await openTool(page, 'ulid-generator', 'ULID Generator & Decoder');
      await expect(page.getByText('No ULIDs yet', { exact: true })).toBeVisible();

      await page.getByRole('spinbutton', { name: 'How many (1 to 1000)' }).fill('3');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();

      const items = resultList(page);
      await expect(items).toHaveCount(3);
      await expect(page.getByText('3 ULIDs. The timestamp part is highlighted.', { exact: true })).toBeVisible();
      const ulids = await items.allTextContents();
      for (const ulid of ulids) expect(ulid).toMatch(/^01AS1PCT00[0-9A-HJKMNP-TV-Z]{16}$/);
      expect(new Set(ulids).size).toBe(3);

      await page.getByRole('button', { name: 'Copy all' }).click();
      await expect.poll(() => readClipboard(page)).toBe(ulids.join('\n'));

      // The letter case only changes how the same ULIDs are written.
      await page.getByRole('combobox', { name: 'Letter case' }).click();
      await page.getByRole('option', { name: 'lowercase', exact: true }).click();
      const lower = ulids.map((ulid) => ulid.toLowerCase());
      await expect(items).toHaveText(lower);
      const saved = await saveFrom(page, page.getByRole('button', { name: 'Download .txt' }));
      expect(saved).toEqual({ name: 'ulids.txt', text: `${lower.join('\n')}\n` });

      await page.getByRole('button', { name: 'Copy all' }).locator('xpath=..').getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByText('No ULIDs yet', { exact: true })).toBeVisible();
      await expect(items).toHaveCount(0);
    });

    test('counts up in monotonic mode, takes a chosen time and rejects bad options', async ({ page }) => {
      await fixRandomness(page, 0);
      await openTool(page, 'ulid-generator', 'ULID Generator & Decoder');
      const count = page.getByRole('spinbutton', { name: 'How many (1 to 1000)' });
      const generate = page.getByRole('button', { name: 'Generate', exact: true });
      const time = page.getByRole('textbox', { name: 'Unix milliseconds or an ISO 8601 date' });

      // Switching the custom time on starts from the clock.
      await page.getByRole('switch', { name: 'Custom timestamp' }).click();
      await expect(time).toHaveValue(String(Date.parse(NOW)));
      await time.fill('2016-07-30T22:36:16.385Z');
      await expect(page.getByText('Reads as 2016-07-30T22:36:16.385Z', { exact: true })).toBeVisible();
      await page.getByRole('switch', { name: 'Monotonic mode' }).click();
      await count.fill('3');
      await generate.click();
      await expect(resultList(page)).toHaveText([
        '01ARYZ6S410000000000000000',
        '01ARYZ6S410000000000000001',
        '01ARYZ6S410000000000000002',
      ]);

      // The largest time the 48-bit field holds, then a random part that cannot be counted up.
      await time.fill('281474976710655');
      await page.evaluate(() => Object.assign(window, { __randomByte: 255 }));
      await count.fill('1');
      await generate.click();
      await expect(resultList(page)).toHaveText(['7ZZZZZZZZZZZZZZZZZZZZZZZZZ']);
      await count.fill('2');
      await generate.click();
      await expect(page.getByText(/^Monotonic overflow: the 80-bit random part is already at its maximum/)).toBeVisible();
      await expect(resultList(page)).toHaveCount(0);
      await page.getByRole('switch', { name: 'Monotonic mode' }).click();
      await generate.click();
      await expect(resultList(page)).toHaveText(['7ZZZZZZZZZZZZZZZZZZZZZZZZZ', '7ZZZZZZZZZZZZZZZZZZZZZZZZZ']);

      for (const bad of ['0', '1001']) {
        await count.fill(bad);
        await expect(page.getByText('Enter a whole number from 1 to 1000.', { exact: true }), bad).toBeVisible();
        await expect(generate).toBeDisabled();
      }
      await count.fill('1');
      const badTimes: Array<[text: string, message: string]> = [
        ['banana', 'That is not Unix milliseconds or a date this tool can read.'],
        ['-5', 'The timestamp cannot be negative.'],
        ['281474976710656', 'The timestamp is beyond the 48-bit maximum of 281474976710655 ms (the year 10889).'],
      ];
      for (const [text, message] of badTimes) {
        await time.fill(text);
        await expect(page.getByText(message, { exact: true }), text).toBeVisible();
        await expect(generate).toBeDisabled();
      }
    });

    test('decodes a ULID and converts between ULID and UUID', async ({ page }) => {
      await openTool(page, 'ulid-generator', 'ULID Generator & Decoder');
      const decoder = page.getByText('Decode a ULID', { exact: true }).locator('xpath=../..');
      const converter = page.getByText('ULID and UUID', { exact: true }).locator('xpath=../..');
      const decodeInput = decoder.getByRole('textbox', { name: 'ULID', exact: true });

      await decoder.getByRole('button', { name: 'Try an example' }).click();
      await expect(decodeInput).toHaveValue(SPEC_ULID);
      await expect(decoder.getByText('Valid ULID', { exact: true })).toBeVisible();
      await expect(valueOf(decoder, 'Timestamp (ISO 8601, UTC)')).toHaveText('2016-07-30T23:54:10.259Z');
      await expect(valueOf(decoder, 'Local time')).toHaveText(/^Saturday, July 30, 2016 at 11:54:10\sPM UTC$/);
      await expect(valueOf(decoder, 'Relative time')).toHaveText('1 day ago');
      await expect(valueOf(decoder, 'Unix milliseconds')).toHaveText('1469922850259');
      await expect(valueOf(decoder, 'Random part (80 bits, hex)')).toHaveText('d6764c61efb99302bd5b');
      await decoder.getByRole('button', { name: 'Copy random part' }).click();
      await expect.poll(() => readClipboard(page)).toBe('d6764c61efb99302bd5b');

      const invalid: Array<[text: string, message: string]> = [
        [
          '01ARZ3NDEKTSV4RRFFQ69G5FAI',
          'Invalid character "I" at position 26. ULIDs use Crockford Base32: digits and letters except I, L, O and U.',
        ],
        ['01ARZ3NDEKTSV4RRFFQ69G5FA', 'A ULID has exactly 26 characters; this input has 25.'],
        ['8ZZZZZZZZZZZZZZZZZZZZZZZZZ', 'The timestamp is beyond the 48-bit maximum: the first character must be 0 to 7, not "8".'],
      ];
      for (const [text, message] of invalid) {
        await decodeInput.fill(text);
        await expect(decoder.getByText(message, { exact: true }), text).toBeVisible();
        await expect(decoder.getByText('Valid ULID', { exact: true })).toHaveCount(0);
      }
      await decoder.getByRole('button', { name: 'Clear' }).click();
      await expect(decoder.getByText('Paste a ULID to decode it.', { exact: true })).toBeVisible();

      // Whichever box is typed in is the source.
      const ulidBox = converter.getByRole('textbox', { name: 'ULID', exact: true });
      const uuidBox = converter.getByRole('textbox', { name: 'UUID', exact: true });
      await ulidBox.fill(SPEC_ULID);
      await expect(uuidBox).toHaveValue(SPEC_UUID);
      await converter.getByRole('button', { name: 'Copy UUID', exact: true }).click();
      await expect.poll(() => readClipboard(page)).toBe(SPEC_UUID);
      await uuidBox.fill('{01563E3A-B5D3-D676-4C61-EFB99302BD5B}');
      await expect(ulidBox).toHaveValue(SPEC_ULID);
      await uuidBox.fill('ffffffff-ffff-ffff-ffff-ffffffffffff');
      await expect(ulidBox).toHaveValue('7ZZZZZZZZZZZZZZZZZZZZZZZZZ');

      await uuidBox.fill(SPEC_ULID);
      await expect(
        converter.getByText('This looks like a ULID, not a UUID. Paste it in the ULID box instead.', { exact: true })
      ).toBeVisible();
      await expect(ulidBox).toHaveValue('');
      await converter.getByRole('button', { name: 'Clear' }).click();
      await expect(uuidBox).toHaveValue('');
    });
  });

  // ---------------------------------------------------------------------------
  // Chmod Calculator
  // ---------------------------------------------------------------------------
  test.describe('Chmod Calculator', () => {
    const octal = (page: Page) => page.getByRole('textbox', { name: 'Octal (3 or 4 digits)', exact: true });
    const symbolic = (page: Page) => page.getByRole('textbox', { name: 'Symbolic (e.g. rwxr-xr-x)', exact: true });
    const box = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true });
    const preset = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
    const command = (page: Page, text: string) => page.getByText(text, { exact: true });
    const reading = (page: Page, who: string) => page.getByRole('listitem').filter({ hasText: who });
    const anyError = (page: Page) => page.getByRole('alert').filter({ hasText: 'last valid value' });

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'chmod-calculator', 'Chmod Calculator');
    });

    test('keeps the boxes, special bits, presets, fields and commands in step', async ({ page }) => {
      await expect(octal(page)).toHaveValue('644');
      await expect(symbolic(page)).toHaveValue('rw-r--r--');
      await expect(command(page, 'chmod 644 file')).toBeVisible();
      await expect(command(page, 'chmod u=rw,g=r,o=r file')).toBeVisible();
      await expect(reading(page, 'Owner (user)')).toHaveText('Owner (user) can read and write but cannot execute.');
      await expect(reading(page, 'Group')).toHaveText('Group can read but cannot write or execute.');
      await expect(preset(page, '644')).toHaveAttribute('aria-pressed', 'true');

      await box(page, 'Owner execute').click();
      await box(page, 'Group write').click();
      await box(page, 'Others read').click();
      await expect(octal(page)).toHaveValue('760');
      await expect(symbolic(page)).toHaveValue('rwxrw----');
      await expect(command(page, 'chmod 760 file')).toBeVisible();
      await expect(reading(page, 'Owner (user)')).toHaveText('Owner (user) can read, write and execute.');
      await expect(page.getByText('Custom mode. Pick a preset or adjust the boxes.', { exact: true })).toBeVisible();

      await page.getByRole('checkbox', { name: 'Setuid (4000)' }).click();
      await expect(octal(page)).toHaveValue('4760');
      await expect(symbolic(page)).toHaveValue('rwsrw----');
      await expect(command(page, 'chmod u=rwxs,g=rw,o= file')).toBeVisible();
      await expect(page.getByText(/^Setuid: when the file is run, it runs with the privileges of the file owner/)).toBeVisible();

      // A preset replaces the whole mode, special bits included.
      await preset(page, '755').click();
      await expect(octal(page)).toHaveValue('755');
      await expect(page.getByRole('checkbox', { name: 'Setuid (4000)' })).not.toBeChecked();
      await expect(page.getByText('Program or directory.', { exact: true })).toBeVisible();
      await preset(page, '777').click();
      await expect(
        page.getByText('World-writable: any user on the system can change this. That is rarely what you want.', { exact: true })
      ).toBeVisible();

      const target = page.getByRole('textbox', { name: 'File or directory name', exact: true });
      await target.fill('my file');
      await expect(command(page, "chmod 777 'my file'")).toBeVisible();
      await page.getByRole('button', { name: 'Copy numeric command' }).click();
      await expect.poll(() => readClipboard(page)).toBe("chmod 777 'my file'");
      await target.fill('-rf');
      await page.getByRole('button', { name: 'Copy symbolic command' }).click();
      await expect.poll(() => readClipboard(page)).toBe('chmod u=rwx,g=rwx,o=rwx -- -rf');

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(octal(page)).toHaveValue('000');
      await expect(symbolic(page)).toHaveValue('---------');
      await expect(target).toHaveValue('');
      await expect(command(page, 'chmod 000 file')).toBeVisible();
      await expect(reading(page, 'Owner (user)')).toHaveText('Owner (user) has no access.');
    });

    test('reads an octal or symbolic value typed in and tidies it when the field is left', async ({ page }) => {
      await octal(page).fill('4755');
      await expect(symbolic(page)).toHaveValue('rwsr-xr-x');
      await expect(octal(page)).toHaveValue('4755');
      await expect(page.getByRole('checkbox', { name: 'Setuid (4000)' })).toBeChecked();
      await expect(command(page, 'chmod u=rwxs,g=rx,o=rx file')).toBeVisible();

      // A leading zero is accepted while typing and dropped on leaving the field.
      await octal(page).fill('0755');
      await expect(octal(page)).toHaveValue('0755');
      await expect(symbolic(page)).toHaveValue('rwxr-xr-x');
      await octal(page).blur();
      await expect(octal(page)).toHaveValue('755');

      // The ten characters from ls -l, file type included.
      await symbolic(page).fill('drwxrwxrwt');
      await expect(octal(page)).toHaveValue('1777');
      await expect(page.getByRole('checkbox', { name: 'Sticky (1000)' })).toBeChecked();
      await expect(page.getByText(/^World-writable/)).toHaveCount(0);

      // A capital S is the bit without execute, and earns a warning.
      await symbolic(page).fill('rwSr--r--');
      await expect(octal(page)).toHaveValue('4644');
      await expect(box(page, 'Owner execute')).not.toBeChecked();
      await expect(
        page.getByText('Setuid is set but the owner has no execute permission (shown as S), which is unusual.', { exact: true })
      ).toBeVisible();

      // An emptied field is waiting for input: no error, and it shows the mode again when left.
      await octal(page).fill('');
      await expect(anyError(page)).toHaveCount(0);
      await octal(page).blur();
      await expect(octal(page)).toHaveValue('4644');
    });

    test('rejects a malformed value, says why, and keeps the last valid mode', async ({ page }) => {
      const problem = (message: string) =>
        page.getByRole('alert').filter({ hasText: `${message} The other fields keep their last valid value.` });

      const badOctal: Array<[text: string, message: string]> = [
        ['789', 'Octal digits run from 0 to 7, but "8" was found.'],
        ['75', 'Use 3 or 4 octal digits (got 2), for example 755 or 4755.'],
        ['75x', 'Use only the digits 0 to 7, for example 755 or 4755.'],
      ];
      for (const [text, message] of badOctal) {
        await octal(page).fill(text);
        await expect(problem(message), text).toBeVisible();
        await expect(octal(page)).toHaveAttribute('aria-invalid', 'true');
        await expect(symbolic(page)).toHaveValue('rw-r--r--');
        await expect(command(page, 'chmod 644 file')).toBeVisible();
      }
      // Leaving a field with an invalid entry does not wipe it.
      await octal(page).blur();
      await expect(octal(page)).toHaveValue('75x');
      await octal(page).fill('755');
      await expect(anyError(page)).toHaveCount(0);

      const badSymbolic: Array<[text: string, message: string]> = [
        ['rwxr-xr', 'Use 9 characters such as rwxr-xr-x, or 10 with a leading file type (got 7).'],
        ['rwxrwxrws', 'Character 9 must be x, t, T or -, but it is "s".'],
        ['xrwxr-xr-x', 'Found 10 characters, so the first must be a file type from ls -l (one of -dlcbps), but it is "x".'],
      ];
      for (const [text, message] of badSymbolic) {
        await symbolic(page).fill(text);
        await expect(problem(message), text).toBeVisible();
        await expect(octal(page)).toHaveValue('755');
      }
      await symbolic(page).fill('rwx------');
      await expect(anyError(page)).toHaveCount(0);
      await expect(octal(page)).toHaveValue('700');
    });
  });

  // ---------------------------------------------------------------------------
  // Docker Run to Compose
  // ---------------------------------------------------------------------------
  test.describe('Docker Run to Compose', () => {
    const EXAMPLE_YAML = [
      'services:',
      '  web:',
      '    image: nginx:1.27-alpine',
      '    container_name: web',
      '    restart: unless-stopped',
      '    ports:',
      '      - "8080:80"',
      '    volumes:',
      '      - web_data:/usr/share/nginx/html',
      '      - ./conf/nginx.conf:/etc/nginx/nginx.conf:ro',
      '    environment:',
      '      - TZ=Europe/Berlin',
      '    networks:',
      '      - proxy',
      '    mem_limit: 512m',
      '    healthcheck:',
      '      test:',
      '        - CMD-SHELL',
      '        - curl -f http://localhost/ || exit 1',
      '      interval: 30s',
      'volumes:',
      '  web_data: {}',
      'networks:',
      '  proxy:',
      '    external: true',
      '',
    ].join('\n');
    const EMPTY_STATE = 'Paste a docker run command, or load the example, to see the Compose file.';

    const command = (page: Page) => page.getByRole('textbox', { name: 'docker run command', exact: true });
    const compose = (page: Page) => page.getByRole('textbox', { name: 'Generated docker-compose.yml', exact: true });
    const refusal = (page: Page) => page.getByRole('alert').filter({ hasText: 'Cannot convert this command.' });

    test.beforeEach(async ({ page }) => {
      await openTool(page, 'docker-run-to-compose', 'Docker Run to Compose');
    });

    test('converts the example and offers the file to copy and download', async ({ page }) => {
      await expect(page.getByText(EMPTY_STATE)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear' })).toBeDisabled();

      await page.getByRole('button', { name: 'Load example' }).click();
      await expect(compose(page)).toHaveValue(EXAMPLE_YAML);
      await expect(page.getByText('One service, "web", ready to save as docker-compose.yml.', { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Warnings' })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Notes' }).getByRole('heading', { name: 'Notes (3)' })).toBeVisible();

      await page.getByRole('button', { name: 'Copy YAML' }).click();
      await expect.poll(() => readClipboard(page)).toBe(EXAMPLE_YAML);
      const saved = await saveFrom(page, page.getByRole('button', { name: 'Download docker-compose.yml' }));
      expect(saved).toEqual({ name: 'docker-compose.yml', text: EXAMPLE_YAML });

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(command(page)).toHaveValue('');
      await expect(compose(page)).toHaveCount(0);
    });

    test('reads line breaks, quotes, combined flags and variables, and lists what it could not convert', async ({ page }) => {
      await command(page).fill(
        [
          '$ docker run --rm -it \\',
          '  --name "My App" \\',
          "  -p8080:80 -e PASSWORD='p$ss' -e HOME_DIR=$HOME \\",
          '  --label-file labels.txt --frobnicate \\',
          '  -v "$(pwd)/data":/data \\',
          '  registry.example.com:5000/team/api:2.1 sh -c "echo hi"',
        ].join('\n')
      );

      await expect(compose(page)).toHaveValue(
        [
          'services:',
          '  My-App:',
          '    image: registry.example.com:5000/team/api:2.1',
          '    container_name: My App',
          '    command:',
          '      - sh',
          '      - "-c"',
          '      - echo hi',
          '    stdin_open: true',
          '    tty: true',
          '    ports:',
          '      - "8080:80"',
          '    volumes:',
          '      - ./data:/data',
          '    environment:',
          '      - PASSWORD=p$$ss',
          '      - HOME_DIR=$HOME',
          '',
        ].join('\n')
      );
      const warnings = page.getByRole('region', { name: 'Warnings' });
      await expect(warnings.getByRole('heading', { name: 'Warnings (2)' })).toBeVisible();
      await expect(warnings.getByRole('listitem')).toHaveText([
        '`--label-file labels.txt` was not converted. Compose has no label file. Move the labels into the labels list.',
        'Unknown option `--frobnicate` was not converted.',
      ]);
      const notes = page.getByRole('region', { name: 'Notes' });
      await expect(notes.getByRole('heading', { name: 'Notes (5)' })).toBeVisible();
      await expect(notes.getByRole('listitem').nth(2)).toHaveText(
        'The service is called "My-App" because service names may only use letters, digits, ".", "_" and "-". The container name is still "My App".'
      );
      await expect(notes.getByRole('listitem').nth(3)).toHaveText(/^A literal dollar sign is written as \$\$ because/);
    });

    test('says why a command cannot be converted and recovers once it is fixed', async ({ page }) => {
      const refused: Array<[text: string, message: string]> = [
        ['docker ps -a', 'Only "docker run" can be converted, but this command is "docker ps".'],
        ['echo hi', 'This does not look like a docker run command. It should start with "docker run".'],
        ['docker run -d --name x', 'No image name found after the options.'],
        ['docker run -e "A=1 nginx', 'Unterminated double quote (").'],
        [
          'docker run -d\n--name web nginx',
          'No image name found after the options. A line break ends the command unless the line ends with a backslash (\\), so options on later lines were not read.',
        ],
      ];
      for (const [text, message] of refused) {
        await command(page).fill(text);
        await expect(refusal(page), text).toHaveText(`Cannot convert this command. ${message}`);
        await expect(compose(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Copy YAML' })).toHaveCount(0);
      }

      await command(page).fill('docker run -p 80:80 nginx');
      await expect(compose(page)).toHaveValue(
        ['services:', '  nginx:', '    image: nginx', '    ports:', '      - "80:80"', ''].join('\n')
      );
      await expect(refusal(page)).toHaveCount(0);

      // Text that is only blank is the empty state, not an error.
      await command(page).fill('   ');
      await expect(page.getByText(EMPTY_STATE)).toBeVisible();
      await expect(refusal(page)).toHaveCount(0);
    });
  });
});

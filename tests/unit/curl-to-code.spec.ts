import { test, expect } from '@playwright/test';
import {
  CURL_TARGET_LANGUAGES,
  PLACEHOLDER_URL,
  generateRequestCode,
  parseCurl,
  type CurlTargetLanguage,
} from '@/lib/tools/curl-to-code';

const convert = (command: string, language: CurlTargetLanguage) =>
  generateRequestCode(parseCurl(command), language);

const EXAMPLE = `curl -X POST https://api.example.com/v1/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer token123" \\
  -d '{"name": "Ada", "role": "admin"}'`;

test.describe('parseCurl', () => {
  test('reads method, URL, headers and body', () => {
    expect(parseCurl(EXAMPLE)).toEqual({
      url: 'https://api.example.com/v1/users',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
      },
      data: '{"name": "Ada", "role": "admin"}',
      warnings: [],
    });
  });

  test('defaults to GET, and to POST once there is a body', () => {
    expect(parseCurl('curl https://x.test/a').method).toBe('GET');
    expect(parseCurl('curl https://x.test/a -d a=1').method).toBe('POST');
    expect(parseCurl('curl -X put https://x.test/a -d a=1').method).toBe('PUT');
  });

  test('accepts the long option names', () => {
    const request = parseCurl(
      'curl --request PATCH --url https://x.test/a --header "X-Id: 7" --data-raw "a=1"'
    );
    expect(request.method).toBe('PATCH');
    expect(request.url).toBe('https://x.test/a');
    expect(request.headers['X-Id']).toBe('7');
    expect(request.data).toBe('a=1');
  });

  test('joins several data options with an ampersand', () => {
    expect(parseCurl('curl https://x.test -d a=1 -d b=2 --data c=3').data).toBe('a=1&b=2&c=3');
  });

  // Every backslash used to be swallowed, which broke JSON escapes in a body.
  test('keeps backslashes inside single quotes', () => {
    const body = String.raw`{"text":"line1\nline2","quote":"say \"hi\"","path":"C:\\temp"}`;
    const request = parseCurl(`curl https://x.test -d '${body}'`);
    expect(request.data).toBe(body);
    expect(JSON.parse(request.data)).toEqual({
      text: 'line1\nline2',
      quote: 'say "hi"',
      path: 'C:\\temp',
    });
  });

  test('in double quotes, a backslash only escapes quote, backslash, dollar and backtick', () => {
    const request = parseCurl(String.raw`curl https://x.test -d "{\"a\":\"b\nc\",\"cost\":\"\$5\",\"p\":\"\\\\\"}"`);
    expect(request.data).toBe(String.raw`{"a":"b\nc","cost":"$5","p":"\\"}`);
  });

  test("decodes the escapes of a $'...' string, as copied from browser dev tools", () => {
    const request = parseCurl(
      String.raw`curl 'https://x.test/a' --data-raw $'{"a":"it\'s","b":"x\ny","c":"\u00e9","d":"\x41\101"}'`
    );
    expect(request.data).toBe('{"a":"it\'s","b":"x\ny","c":"é","d":"AA"}');
  });

  // The empty word used to vanish, so -d took the URL as its value.
  test('keeps an empty quoted argument', () => {
    const request = parseCurl(`curl -X POST -d '' https://x.test/hook`);
    expect(request.url).toBe('https://x.test/hook');
    expect(request.data).toBe('');
    expect(request.method).toBe('POST');
    expect(request.warnings).toEqual([]);

    expect(parseCurl('curl -d "" https://x.test/hook').url).toBe('https://x.test/hook');
  });

  // curl posts a zero-length form for -d '', it does not fall back to GET.
  test('treats an empty -d as a body', () => {
    expect(parseCurl(`curl -d '' https://x.test/hook`)).toEqual({
      url: 'https://x.test/hook',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: '',
      warnings: [],
    });
    expect(parseCurl('curl -G https://x.test/hook')).toMatchObject({ method: 'GET', headers: {} });
  });

  // "-XPUT" used to be ignored, leaving the method at GET or POST.
  test('reads a value attached to a short option', () => {
    const request = parseCurl(`curl -XPUT -d'{"a":1}' -H'Accept: text/plain' https://x.test/a`);
    expect(request.method).toBe('PUT');
    expect(request.data).toBe('{"a":1}');
    expect(request.headers.Accept).toBe('text/plain');
  });

  test('reads clustered short flags', () => {
    expect(parseCurl('curl -sSL -XDELETE https://x.test/a').method).toBe('DELETE');
    const request = parseCurl('curl -sSLd a=1 https://x.test/a');
    expect(request.data).toBe('a=1');
    expect(request.url).toBe('https://x.test/a');
  });

  // The value of -e, -x or -o used to be taken for the request URL.
  test('does not mistake the value of another option for the URL', () => {
    const request = parseCurl(
      'curl https://api.example.com/a -e https://referrer.example/page -x http://proxy.local:8080 --connect-timeout 5'
    );
    expect(request.url).toBe('https://api.example.com/a');
    expect(request.headers.Referer).toBe('https://referrer.example/page');

    expect(parseCurl('curl -o out.json example.com/api').url).toBe('http://example.com/api');
    expect(parseCurl('curl -w "%{http_code}" -o /dev/null https://x.test/a').url).toBe(
      'https://x.test/a'
    );
  });

  // "example.com/api" used to go out as-is, which fetch treats as a relative path.
  test('adds the scheme curl assumes when the URL has none', () => {
    expect(parseCurl('curl example.com/api').url).toBe('http://example.com/api');
    expect(parseCurl('curl localhost:3000/health').url).toBe('http://localhost:3000/health');
    expect(parseCurl('curl HTTPS://Example.com').url).toBe('HTTPS://Example.com');
  });

  test('falls back to a placeholder URL and says so', () => {
    const request = parseCurl('curl -X POST');
    expect(request.url).toBe(PLACEHOLDER_URL);
    expect(request.warnings).toEqual(['No URL found in the command, so a placeholder URL is used.']);
    expect(parseCurl('hello world').url).toBe(PLACEHOLDER_URL);
  });

  // The value used to be sent unencoded.
  test('percent-encodes --data-urlencode values', () => {
    expect(parseCurl(`curl https://x.test --data-urlencode 'name=John Doe & Co'`).data).toBe(
      'name=John+Doe+%26+Co'
    );
    expect(parseCurl(`curl https://x.test --data-urlencode 'a b' -d c=1`).data).toBe('a+b&c=1');
    expect(parseCurl(`curl https://x.test --data-urlencode '=é!'`).data).toBe('%C3%A9%21');
  });

  // -G used to be ignored, turning a search query into a POST body.
  test('moves the data into the query string for -G', () => {
    const request = parseCurl(`curl -G https://x.test/search -d q=cron --data-urlencode 'tag=a b'`);
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://x.test/search?q=cron&tag=a+b');
    expect(request.data).toBe('');
    expect(request.headers).toEqual({});

    expect(parseCurl('curl --get "https://x.test/s?page=2" -d q=1').url).toBe(
      'https://x.test/s?page=2&q=1'
    );
  });

  test('uses HEAD for -I', () => {
    expect(parseCurl('curl -I https://x.test/a').method).toBe('HEAD');
    expect(parseCurl('curl --head https://x.test/a').method).toBe('HEAD');
  });

  test('turns -u into a Basic Authorization header', () => {
    expect(parseCurl('curl -u ada:secret https://x.test').headers.Authorization).toBe(
      `Basic ${Buffer.from('ada:secret').toString('base64')}`
    );
    expect(parseCurl('curl -u ada https://x.test').headers.Authorization).toBe(
      `Basic ${Buffer.from('ada:').toString('base64')}`
    );
  });

  // btoa threw on anything outside Latin-1 and the header was silently dropped.
  test('encodes non-Latin credentials as UTF-8', () => {
    expect(parseCurl(`curl -u 'ayşe:pässwörd€' https://x.test`).headers.Authorization).toBe(
      `Basic ${Buffer.from('ayşe:pässwörd€', 'utf8').toString('base64')}`
    );
  });

  // These options used to be dropped, so the generated request lost its cookies.
  test('turns -A, -e and -b into headers', () => {
    const request = parseCurl(
      `curl https://x.test -A 'Mozilla/5.0' -e https://ref.example -b 'sid=abc; theme=dark'`
    );
    expect(request.headers).toEqual({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://ref.example',
      Cookie: 'sid=abc; theme=dark',
    });
  });

  test('lets an explicit header win over the option that would add it', () => {
    const request = parseCurl(
      `curl https://x.test -H 'user-agent: mine' -A other -H 'authorization: Bearer t' -u a:b`
    );
    expect(request.headers).toEqual({ 'user-agent': 'mine', authorization: 'Bearer t' });
  });

  // Without it fetch sends text/plain and Python sends no type, unlike curl.
  test('adds the Content-Type curl sends for -d', () => {
    expect(parseCurl('curl https://x.test -d a=1').headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(parseCurl(`curl https://x.test -d '{}' -H 'content-type: application/json'`).headers).toEqual({
      'content-type': 'application/json',
    });
    expect(parseCurl('curl https://x.test').headers).toEqual({});
  });

  test('--json sets the JSON headers', () => {
    const request = parseCurl(`curl --json '{"a":1}' https://x.test`);
    expect(request.method).toBe('POST');
    expect(request.data).toBe('{"a":1}');
    expect(request.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  });

  test('drops a header that curl is told to remove and keeps an empty one', () => {
    const request = parseCurl(`curl https://x.test -H 'Accept:' -H 'X-Empty;' -H 'X-Trace: 1'`);
    expect(request.headers).toEqual({ 'X-Empty': '', 'X-Trace': '1' });
  });

  test('keeps colons inside a header value', () => {
    expect(parseCurl(`curl https://x.test -H 'Origin: https://app.example:8443'`).headers).toEqual({
      Origin: 'https://app.example:8443',
    });
  });

  test('stops at a pipe, redirect or command separator', () => {
    const piped = parseCurl(`curl -s https://x.test/a | xargs -d '\\n' -X echo`);
    expect(piped.method).toBe('GET');
    expect(piped.data).toBe('');
    expect(parseCurl('curl https://x.test/a > out.json').url).toBe('https://x.test/a');
    expect(parseCurl(`curl https://x.test/a -d 'a|b'`).data).toBe('a|b');
    expect(parseCurl('curl https://x.test/a?x=1&y=2').url).toBe('https://x.test/a?x=1&y=2');
  });

  test('treats new lines and line continuations as separators', () => {
    const expected = { method: 'POST', url: 'https://x.test/a', data: 'a=1' };
    for (const command of [
      'curl -X POST \\\n  https://x.test/a \\\n  -d a=1',
      'curl -X POST \\\r\n  https://x.test/a \\\r\n  -d a=1',
      'curl -X POST ^\r\n  https://x.test/a ^\r\n  -d a=1',
      'curl -X POST `\n  https://x.test/a `\n  -d a=1',
      'curl -X POST\nhttps://x.test/a\n-d a=1',
      '  curl.exe -X POST https://x.test/a -d a=1  ',
    ]) {
      expect(parseCurl(command), command).toMatchObject(expected);
    }
  });

  test('notes what it cannot convert', () => {
    expect(parseCurl('curl -k https://x.test').warnings).toEqual([
      '-k/--insecure (skip TLS certificate checks) is not carried over to the code.',
    ]);
    expect(parseCurl('curl https://x.test -F file=@a.png -F name=x')).toMatchObject({
      method: 'POST',
      data: '',
      warnings: ['Multipart form fields (-F) are not converted. Add them to the request body by hand.'],
    });

    const fileBody = parseCurl('curl https://x.test -d @body.json');
    expect(fileBody.data).toBe('@body.json');
    expect(fileBody.warnings).toEqual([
      'The body is read from a file (body.json), which cannot be opened here. Replace "@body.json" with the file\'s contents.',
    ]);
    // --data-raw sends a leading @ as it is.
    expect(parseCurl('curl https://x.test --data-raw @mention').warnings).toEqual([]);
  });

  test('copes with unfinished and empty input', () => {
    expect(parseCurl('').url).toBe(PLACEHOLDER_URL);
    expect(parseCurl(`curl https://x.test -d 'unfinished`).data).toBe('unfinished');
    expect(parseCurl('curl https://x.test -H').headers).toEqual({});
    expect(parseCurl('curl https://x.test -d "half \\').data).toBe('half \\');
    expect(parseCurl('curl https://x.test \\').url).toBe('https://x.test');
  });
});

test.describe('generateRequestCode', () => {
  test('writes the fetch snippet', () => {
    expect(convert(EXAMPLE, 'js-fetch')).toBe(
      [
        'const myHeaders = new Headers();',
        'myHeaders.append("Content-Type", "application/json");',
        'myHeaders.append("Authorization", "Bearer token123");',
        '',
        'const raw = JSON.stringify({',
        '  "name": "Ada",',
        '  "role": "admin"',
        '});',
        '',
        'const requestOptions = {',
        '  method: "POST",',
        '  headers: myHeaders,',
        '  body: raw,',
        '  redirect: "follow"',
        '};',
        '',
        'fetch("https://api.example.com/v1/users", requestOptions)',
        '  .then((response) => response.text())',
        '  .then((result) => console.log(result))',
        '  .catch((error) => console.error(error));',
      ].join('\n')
    );
  });

  test('writes a snippet with the URL, method and body in every language', () => {
    expect(CURL_TARGET_LANGUAGES).toHaveLength(13);
    for (const { value } of CURL_TARGET_LANGUAGES) {
      const code = convert(`curl https://x.test/items -H 'X-Key: k1' -d 'a=1'`, value);
      expect(code, value).toContain('https://x.test/items');
      expect(code, value).toContain('X-Key');
      expect(code, value).toContain('a=1');
      expect(code, value).toMatch(/post/i);
    }
  });

  // json.dumps({"active": true}) is a NameError in Python.
  test('writes JSON true, false and null as Python literals', () => {
    const code = convert(
      `curl https://x.test -H 'Content-Type: application/json' -d '{"active": true, "deleted": false, "note": null, "tags": ["a", 1.5], "empty": {}}'`,
      'python-requests'
    );
    expect(code).toContain(
      [
        'payload = json.dumps({',
        '  "active": True,',
        '  "deleted": False,',
        '  "note": None,',
        '  "tags": [',
        '    "a",',
        '    1.5',
        '  ],',
        '  "empty": {}',
        '})',
      ].join('\n')
    );
    expect(code).toContain('import json\n');
    // A string that merely says "true" is left alone.
    expect(convert(`curl https://x.test -d '{"a": "true"}'`, 'python-requests')).toContain(
      '"a": "true"'
    );
  });

  // Re-printing 9007199254740993 through a JavaScript number sends ...992.
  test('sends a JSON body with numbers too big for a double as the exact text', () => {
    const body = '{"id": 9007199254740993, "ratio": 0.1234567890123456789}';
    const command = `curl https://x.test -H 'Content-Type: application/json' -d '${body}'`;

    expect(convert(command, 'js-fetch')).toContain(`const raw = ${JSON.stringify(body)};`);
    expect(convert(command, 'js-axios')).toContain(`const data = ${JSON.stringify(body)};`);
    const python = convert(command, 'python-requests');
    expect(python).toContain(`payload = ${JSON.stringify(body)}`);
    expect(python).not.toContain('import json');

    // Ordinary numbers still get the readable form.
    expect(convert(`curl https://x.test -d '{"id": 42, "ratio": 0.5}'`, 'js-fetch')).toContain(
      'const raw = JSON.stringify({\n  "id": 42,\n  "ratio": 0.5\n});'
    );
  });

  test('sends a body that is not a JSON object or array as the exact text', () => {
    expect(convert(`curl https://x.test -d '1e3'`, 'js-fetch')).toContain('const raw = "1e3";');
    expect(convert(`curl https://x.test -d 'a=1&b=2'`, 'python-requests')).toContain(
      'payload = "a=1&b=2"'
    );
  });

  // "$id" in a double-quoted PHP, Kotlin or Dart string is interpolation.
  test('escapes the dollar sign where it would interpolate', () => {
    const command = String.raw`curl https://x.test/graphql -H 'X-Price: $5' -d '{"query":"query($id: ID!) { user(id: $id) { name } }"}'`;
    const escapedBody = String.raw`"{\"query\":\"query(\$id: ID!) { user(id: \$id) { name } }\"}"`;

    const php = convert(command, 'php-curl');
    expect(php).toContain(`CURLOPT_POSTFIELDS => ${escapedBody},`);
    expect(php).toContain(String.raw`"X-Price: \$5",`);

    const kotlin = convert(command, 'kotlin-okhttp');
    expect(kotlin).toContain(`val body = ${escapedBody}.toRequestBody(mediaType)`);
    expect(kotlin).toContain(String.raw`.addHeader("X-Price", "\$5")`);

    const dart = convert(command, 'dart-http');
    expect(dart).toContain(`final body = ${escapedBody};`);
    expect(dart).toContain(String.raw`"X-Price": "\$5",`);

    // No interpolation by dollar sign in these, so it stays as written.
    expect(convert(command, 'js-fetch')).toContain('"X-Price", "$5"');
    expect(convert(command, 'java-okhttp')).toContain('"X-Price", "$5"');
  });

  test('escapes Ruby interpolation', () => {
    const code = convert(`curl https://x.test -d 'a=#{b}&c=#d'`, 'ruby-net-http');
    expect(code).toContain(String.raw`request.body = "a=\#{b}&c=#d"`);
  });

  test('writes control characters the way each language spells them', () => {
    const command = String.raw`curl https://x.test --data-raw $'a\x1bb\tc'`;
    expect(convert(command, 'js-fetch')).toContain(String.raw`const raw = "a\u001bb\tc";`);
    expect(convert(command, 'rust-reqwest')).toContain(String.raw`.body("a\u{1b}b\tc")`);
    expect(convert(command, 'swift-urlsession')).toContain(String.raw`"a\u{1b}b\tc".data(using: .utf8)`);
    expect(convert(command, 'php-curl')).toContain(String.raw`CURLOPT_POSTFIELDS => "a\u{1b}b\tc",`);
  });

  // reqwest has no client.options(), so that line did not compile.
  test('uses the generic request builder for methods reqwest has no shortcut for', () => {
    expect(convert('curl -X OPTIONS https://x.test', 'rust-reqwest')).toContain(
      'client.request(reqwest::Method::from_bytes(b"OPTIONS")?, "https://x.test")'
    );
    expect(convert('curl -X DELETE https://x.test', 'rust-reqwest')).toContain(
      'client.delete("https://x.test")'
    );
  });

  // HttpMethod.Propfind does not exist.
  test('builds a custom HttpMethod in C# when there is no static one', () => {
    expect(convert('curl -X PROPFIND https://x.test', 'csharp-httpclient')).toContain(
      'new HttpRequestMessage(new HttpMethod("PROPFIND"), "https://x.test")'
    );
    expect(convert('curl -X PATCH https://x.test', 'csharp-httpclient')).toContain(
      'new HttpRequestMessage(HttpMethod.Patch, "https://x.test")'
    );
  });

  // StringContent throws a FormatException on a media type with parameters.
  test('gives StringContent the media type without its parameters', () => {
    const code = convert(
      `curl https://x.test -H 'content-type: application/json; charset=utf-8' -d '{}'`,
      'csharp-httpclient'
    );
    expect(code).toContain('new StringContent("{}", Encoding.UTF8, "application/json");');
    expect(code).not.toContain('request.Headers.Add("content-type"');
  });

  test('finds the content type whatever the case of the header name', () => {
    const command = `curl https://x.test -H 'CONTENT-TYPE: text/csv' -d 'a,b'`;
    expect(convert(command, 'java-okhttp')).toContain('MediaType.parse("text/csv")');
    expect(convert(command, 'kotlin-okhttp')).toContain('"text/csv".toMediaType()');
  });

  // OkHttp throws "method POST must have a request body" on a null body.
  test('gives OkHttp an empty body for a POST without data', () => {
    const java = convert('curl -X POST https://x.test/run', 'java-okhttp');
    expect(java).toContain('RequestBody body = RequestBody.create(null, new byte[0]);');
    expect(java).toContain('.method("POST", body)');

    const kotlin = convert('curl -X POST https://x.test/run', 'kotlin-okhttp');
    expect(kotlin).toContain('val body = ByteArray(0).toRequestBody()');
    expect(kotlin).toContain('.method("POST", body)');

    expect(convert('curl https://x.test/run', 'java-okhttp')).toContain('.method("GET", null)');
    expect(convert('curl -X DELETE https://x.test/run', 'kotlin-okhttp')).toContain(
      '.method("DELETE", null)'
    );
  });

  // package:http has no http.options(), and http.get() takes no body.
  test('builds a Request in Dart when no helper fits', () => {
    const options = convert(`curl -X OPTIONS https://x.test -H 'Origin: https://a.test'`, 'dart-http');
    expect(options).toContain('final request = http.Request("OPTIONS", url);');
    expect(options).toContain('request.headers.addAll(headers);');
    expect(options).toContain('await http.Response.fromStream(await request.send());');

    const getWithBody = convert(`curl -X GET https://x.test/_search -d '{"q":1}'`, 'dart-http');
    expect(getWithBody).toContain('final request = http.Request("GET", url);');
    expect(getWithBody).toContain('request.body = body;');

    expect(convert('curl https://x.test -d a=1', 'dart-http')).toContain(
      'final response = await http.post(url, headers: headers, body: body);'
    );
    expect(convert('curl https://x.test', 'dart-http')).toContain(
      'final response = await http.get(url);'
    );
  });

  test('keeps backticks and carriage returns intact in a Go body', () => {
    expect(convert('curl https://x.test -d \'a`b\'', 'go-http')).toContain(
      'payload := strings.NewReader(`a` + "`" + `b`)'
    );
    expect(convert(String.raw`curl https://x.test --data-raw $'a\r\nb'`, 'go-http')).toContain(
      String.raw`payload := strings.NewReader("a\r\nb")`
    );
  });
});

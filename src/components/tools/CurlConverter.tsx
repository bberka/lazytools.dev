'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy, Check, Trash2, Terminal, Code, Info } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';

type TargetLanguage = 'js-fetch' | 'js-axios' | 'python-requests' | 'go-http' | 'rust-reqwest';

interface ParsedCurl {
  url: string;
  method: string;
  headers: Record<string, string>;
  data: string;
  isInsecure: boolean;
}

// Shell-like parser to tokenize command line arguments while respecting quotes and escapes
function parseCurl(curlCommand: string): ParsedCurl {
  const cleaned = curlCommand.replace(/\\\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  let currentToken = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escapeNext) {
      currentToken += char;
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if ((char === ' ' || char === '\t') && !inSingleQuote && !inDoubleQuote) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    } else {
      currentToken += char;
    }
  }
  if (currentToken) {
    tokens.push(currentToken);
  }

  let method = '';
  let url = '';
  const headers: Record<string, string> = {};
  let data = '';
  let user = '';
  let isInsecure = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const upperToken = token.toUpperCase();

    if (token === '-X' || token === '--request') {
      method = tokens[i + 1]?.toUpperCase() || 'GET';
      i++;
    } else if (token === '-H' || token === '--header') {
      const headerVal = tokens[i + 1];
      if (headerVal) {
        const colonIndex = headerVal.indexOf(':');
        if (colonIndex > -1) {
          const name = headerVal.substring(0, colonIndex).trim();
          const val = headerVal.substring(colonIndex + 1).trim();
          headers[name] = val;
        }
      }
      i++;
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-urlencode'
    ) {
      if (!method) method = 'POST';
      const payload = tokens[i + 1] || '';
      data += (data ? '&' : '') + payload;
      i++;
    } else if (token === '-u' || token === '--user') {
      user = tokens[i + 1] || '';
      i++;
    } else if (token === '-k' || token === '--insecure') {
      isInsecure = true;
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      url = token;
    }
  }

  // Search for url if not found explicitly with http/https prefix
  if (!url) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const prev = tokens[i - 1];
      if (token.startsWith('-')) continue;
      if (i === 0 && token.toLowerCase() === 'curl') continue;
      if (
        [
          '--request',
          '-X',
          '--header',
          '-H',
          '--data',
          '-d',
          '--data-raw',
          '--data-binary',
          '--data-urlencode',
          '--user',
          '-u',
        ].includes(prev)
      ) {
        continue;
      }
      if (token.includes('.') || token.includes('/') || token.startsWith('localhost')) {
        url = token;
        break;
      }
    }
  }

  if (!method) {
    method = data ? 'POST' : 'GET';
  }

  if (user) {
    try {
      headers['Authorization'] = `Basic ${btoa(user)}`;
    } catch {
      // Ignore encoding error if token is not safe for btoa
    }
  }

  return {
    url: url || 'https://api.example.com/endpoint',
    method,
    headers,
    data,
    isInsecure,
  };
}

function tryFormatJson(data: string): { isJson: boolean; formatted: string } {
  try {
    const parsed = JSON.parse(data);
    return { isJson: true, formatted: JSON.stringify(parsed, null, 2) };
  } catch {
    return { isJson: false, formatted: data };
  }
}

// Code Generator functions
function generateJsFetch(parsed: ParsedCurl): string {
  const { url, method, headers, data } = parsed;
  const headerKeys = Object.keys(headers);
  let code = '';

  if (headerKeys.length > 0) {
    code += `const myHeaders = new Headers();\n`;
    headerKeys.forEach((k) => {
      code += `myHeaders.append(${JSON.stringify(k)}, ${JSON.stringify(headers[k])});\n`;
    });
    code += `\n`;
  }

  if (data) {
    const { isJson, formatted } = tryFormatJson(data);
    if (isJson) {
      code += `const raw = JSON.stringify(${formatted.trim()});\n\n`;
    } else {
      code += `const raw = ${JSON.stringify(data)};\n\n`;
    }
  }

  code += `const requestOptions = {\n`;
  code += `  method: ${JSON.stringify(method)},\n`;
  if (headerKeys.length > 0) {
    code += `  headers: myHeaders,\n`;
  }
  if (data) {
    code += `  body: raw,\n`;
  }
  code += `  redirect: "follow"\n`;
  code += `};\n\n`;

  code += `fetch(${JSON.stringify(url)}, requestOptions)\n`;
  code += `  .then((response) => response.text())\n`;
  code += `  .then((result) => console.log(result))\n`;
  code += `  .catch((error) => console.error(error));`;

  return code;
}

function generateJsAxios(parsed: ParsedCurl): string {
  const { url, method, headers, data } = parsed;
  const headerKeys = Object.keys(headers);
  let code = `import axios from 'axios';\n\n`;

  if (data) {
    const { isJson, formatted } = tryFormatJson(data);
    if (isJson) {
      code += `const data = JSON.stringify(${formatted.trim()});\n\n`;
    } else {
      code += `const data = ${JSON.stringify(data)};\n\n`;
    }
  }

  code += `const config = {\n`;
  code += `  method: ${JSON.stringify(method.toLowerCase())},\n`;
  code += `  maxBodyLength: Infinity,\n`;
  code += `  url: ${JSON.stringify(url)},\n`;

  if (headerKeys.length > 0) {
    code += `  headers: {\n`;
    headerKeys.forEach((k, idx) => {
      const comma = idx === headerKeys.length - 1 ? '' : ',';
      code += `    ${JSON.stringify(k)}: ${JSON.stringify(headers[k])}${comma}\n`;
    });
    code += `  },\n`;
  }

  if (data) {
    code += `  data: data\n`;
  }

  code += `};\n\n`;
  code += `axios.request(config)\n`;
  code += `  .then((response) => {\n`;
  code += `    console.log(JSON.stringify(response.data));\n`;
  code += `  })\n`;
  code += `  .catch((error) => {\n`;
  code += `    console.error(error);\n`;
  code += `  });`;

  return code;
}

function generatePythonRequests(parsed: ParsedCurl): string {
  const { url, method, headers, data } = parsed;
  const headerKeys = Object.keys(headers);
  let code = `import requests\n`;
  if (data) {
    const { isJson } = tryFormatJson(data);
    if (isJson) {
      code += `import json\n`;
    }
  }
  code += `\nurl = ${JSON.stringify(url)}\n\n`;

  if (data) {
    const { isJson, formatted } = tryFormatJson(data);
    if (isJson) {
      code += `payload = json.dumps(${formatted.trim()})\n`;
    } else {
      code += `payload = ${JSON.stringify(data)}\n`;
    }
  } else {
    code += `payload = {}\n`;
  }

  if (headerKeys.length > 0) {
    code += `headers = {\n`;
    headerKeys.forEach((k, idx) => {
      const comma = idx === headerKeys.length - 1 ? '' : ',';
      code += `  ${JSON.stringify(k)}: ${JSON.stringify(headers[k])}${comma}\n`;
    });
    code += `}\n\n`;
  } else {
    code += `headers = {}\n\n`;
  }

  code += `response = requests.request(${JSON.stringify(method)}, url, headers=headers, data=payload)\n\n`;
  code += `print(response.text)\n`;

  return code;
}

function generateGoHttp(parsed: ParsedCurl): string {
  const { url, method, headers, data } = parsed;
  const headerKeys = Object.keys(headers);
  let code = `package main\n\n`;
  code += `import (\n`;
  code += `  "fmt"\n`;
  if (data) {
    code += `  "strings"\n`;
  }
  code += `  "net/http"\n`;
  code += `  "io"\n`;
  code += `)\n\n`;

  code += `func main() {\n`;
  code += `  url := ${JSON.stringify(url)}\n`;
  code += `  method := ${JSON.stringify(method)}\n\n`;

  if (data) {
    const escapedData = data.replace(/`/g, '` + "`" + `');
    code += `  payload := strings.NewReader(\`${escapedData}\`)\n\n`;
  } else {
    code += `  var payload io.Reader = nil\n\n`;
  }

  code += `  client := &http.Client{}\n`;
  code += `  req, err := http.NewRequest(method, url, payload)\n\n`;
  code += `  if err != nil {\n`;
  code += `    fmt.Println(err)\n`;
  code += `    return\n`;
  code += `  }\n`;

  if (headerKeys.length > 0) {
    headerKeys.forEach((k) => {
      code += `  req.Header.Add(${JSON.stringify(k)}, ${JSON.stringify(headers[k])})\n`;
    });
    code += `\n`;
  }

  code += `  res, err := client.Do(req)\n`;
  code += `  if err != nil {\n`;
  code += `    fmt.Println(err)\n`;
  code += `    return\n`;
  code += `  }\n`;
  code += `  defer res.Body.Close()\n\n`;

  code += `  body, err := io.ReadAll(res.Body)\n`;
  code += `  if err != nil {\n`;
  code += `    fmt.Println(err)\n`;
  code += `    return\n`;
  code += `  }\n`;
  code += `  fmt.Println(string(body))\n`;
  code += `}`;

  return code;
}

function generateRustReqwest(parsed: ParsedCurl): string {
  const { url, method, headers, data } = parsed;
  const headerKeys = Object.keys(headers);
  let code = `use reqwest::header::{HeaderMap, HeaderValue, HeaderName};\n`;
  code += `use std::str::FromStr;\n\n`;

  code += `#[tokio::main]\n`;
  code += `async fn main() -> Result<(), Box<dyn std::error::Error>> {\n`;
  code += `    let client = reqwest::Client::new();\n`;

  if (headerKeys.length > 0) {
    code += `    let mut headers = HeaderMap::new();\n`;
    headerKeys.forEach((k) => {
      code += `    headers.insert(\n`;
      code += `        HeaderName::from_str(${JSON.stringify(k)})?,\n`;
      code += `        HeaderValue::from_str(${JSON.stringify(headers[k])})?,\n`;
      code += `    );\n`;
    });
    code += `\n`;
  }

  let reqBuilder = `client.${method.toLowerCase()}(${JSON.stringify(url)})`;
  if (headerKeys.length > 0) {
    reqBuilder += `\n        .headers(headers)`;
  }
  if (data) {
    reqBuilder += `\n        .body(${JSON.stringify(data)})`;
  }

  code += `    let response = ${reqBuilder}\n        .send()\n        .await?;\n\n`;
  code += `    println!("{}", response.text().await?);\n`;
  code += `    Ok(())\n`;
  code += `}`;

  return code;
}

export function CurlConverter() {
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<TargetLanguage>('js-fetch');
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const parsed = useMemo(() => {
    if (!input.trim()) return null;
    try {
      return parseCurl(input);
    } catch {
      return null;
    }
  }, [input]);

  const outputCode = useMemo(() => {
    if (!parsed) return '';
    switch (activeTab) {
      case 'js-fetch':
        return generateJsFetch(parsed);
      case 'js-axios':
        return generateJsAxios(parsed);
      case 'python-requests':
        return generatePythonRequests(parsed);
      case 'go-http':
        return generateGoHttp(parsed);
      case 'rust-reqwest':
        return generateRustReqwest(parsed);
      default:
        return '';
    }
  }, [parsed, activeTab]);

  const handleClear = () => {
    setInput('');
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: input */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Terminal className="h-5 w-5 text-primary" />
              cURL Command
            </CardTitle>
            <CardDescription>Paste your raw shell cURL request command here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`curl -X POST https://api.example.com/v1/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer token123" \\
  -d '{"name": "Ada", "role": "admin"}'`}
              rows={16}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-background focus-visible:ring-1"
            />
            <div className="flex items-center justify-between pt-2">
              <Button
                onClick={handleClear}
                variant="outline"
                size="sm"
                className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition-colors duration-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right column: output code */}
        <Card className="flex flex-col border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <Code className="h-5 w-5 text-primary" />
                Generated Code Snippet
              </CardTitle>
            </div>
            <CardDescription>Select the target language to convert the command.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-4">
            <Tabs
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as TargetLanguage)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 gap-1 bg-muted/60 p-1 rounded-lg h-auto">
                <TabsTrigger value="js-fetch" className="text-xs font-semibold py-1.5 px-2">Fetch</TabsTrigger>
                <TabsTrigger value="js-axios" className="text-xs font-semibold py-1.5 px-2">Axios</TabsTrigger>
                <TabsTrigger value="python-requests" className="text-xs font-semibold py-1.5 px-2">Python</TabsTrigger>
                <TabsTrigger value="go-http" className="text-xs font-semibold py-1.5 px-2">Go</TabsTrigger>
                <TabsTrigger value="rust-reqwest" className="text-xs font-semibold py-1.5 px-2">Rust</TabsTrigger>
              </TabsList>
            </Tabs>

            <Textarea
              value={outputCode}
              readOnly
              placeholder="Your generated code snippet will appear here..."
              rows={16}
              className="flex-1 font-mono text-xs leading-relaxed resize-y bg-muted/20 border-muted focus-visible:ring-0 cursor-text"
            />

            <Button
              onClick={() => copyToClipboard(outputCode)}
              disabled={!outputCode}
              size="sm"
              variant={isCopied ? 'default' : 'outline'}
              className="w-full sm:w-auto font-medium transition-all duration-200"
            >
              {isCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Snippet
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-400">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block mb-0.5">Privacy First</strong>
          All parsing and conversions run entirely inside your browser. No cURL headers, request
          data, or authorization keys are ever transmitted over the network.
        </div>
      </div>
    </div>
  );
}

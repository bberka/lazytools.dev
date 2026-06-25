import type { ComponentType } from 'react';
import type { Tool } from '../types';

type ToolComponent = ComponentType;
type ToolComponentLoader = () => Promise<ToolComponent>;
type ToolMetadata = Omit<Tool, 'id'>;

type ToolRegistryEntry = ToolMetadata & {
  component: ToolComponentLoader;
};

export const TOOL_REGISTRY = {
  'pdf-to-image': {
    name: 'PDF to Image',
    description: 'Convert PDF document pages into high-quality PNG images.',
    tags: ['pdf-tools'],
    icon: 'ImageIcon',
    keywords: ['pdf', 'image', 'png', 'convert', 'extract'],
    component: () =>
      import('@/components/tools/PdfToImage').then(
        (module) => module.PdfToImage
      ),
  },
  'pdf-to-word': {
    name: 'PDF to Word',
    description: 'Extract text from PDF files into editable Word documents.',
    tags: ['pdf-tools'],
    icon: 'FileOutput',
    keywords: ['pdf', 'word', 'docx', 'convert', 'extract', 'text'],
    component: () =>
      import('@/components/tools/PdfToWord').then(
        (module) => module.PdfToWord
      ),
  },
  'word-to-pdf': {
    name: 'Word to PDF',
    description: 'Convert Word documents (.docx) into standard PDF format.',
    tags: ['pdf-tools'],
    icon: 'FileInput',
    keywords: ['word', 'docx', 'pdf', 'convert', 'document'],
    component: () =>
      import('@/components/tools/WordToPdf').then(
        (module) => module.WordToPdf
      ),
  },
  'pdf-split': {
    name: 'Split PDF',
    description: 'Extract specific pages or ranges from any PDF document.',
    tags: ['pdf-tools'],
    icon: 'Scissors',
    keywords: ['pdf', 'split', 'extract', 'pages', 'documents'],
    component: () =>
      import('@/components/tools/PdfSplit').then(
        (module) => module.PdfSplit
      ),
  },
  'image-to-pdf': {
    name: 'Image to PDF',
    description: 'Convert multiple images into a single PDF document.',
    tags: ['pdf-tools'],
    icon: 'FileImage',
    keywords: ['image', 'pdf', 'convert', 'jpeg', 'png'],
    component: () =>
      import('@/components/tools/ImageToPdf').then(
        (module) => module.ImageToPdf
      ),
  },
  'pdf-merge': {
    name: 'Merge PDF',
    description: 'Combine multiple PDF files into a single document.',
    tags: ['pdf-tools'],
    icon: 'Files',
    keywords: ['pdf', 'merge', 'combine', 'join', 'documents'],
    component: () =>
      import('@/components/tools/PdfMerge').then(
        (module) => module.PdfMerge
      ),
  },
  'markdown-to-pdf': {
    name: 'Markdown Converter',
    description: 'Convert Markdown text to PDF, HTML, PNG, or JPG files.',
    tags: ['pdf-tools', 'converters', 'text-tools', 'image-tools'],
    icon: 'FileText',
    keywords: ['markdown', 'pdf', 'html', 'convert', 'export', 'txt', 'png', 'jpg'],
    component: () =>
      import('@/components/tools/MarkdownConverter').then(
        (module) => module.MarkdownConverter
      ),
  },
  'html-converter': {
    name: 'HTML Converter',
    description: 'Convert HTML code to PDF, Markdown, or plain text format.',
    tags: ['pdf-tools', 'converters', 'text-tools'],
    icon: 'FileCode',
    keywords: [
      'html',
      'pdf',
      'markdown',
      'md',
      'plain text',
      'convert',
      'export',
      'print',
      'css',
    ],
    component: () =>
      import('@/components/tools/HtmlConverter').then(
        (module) => module.HtmlConverter
      ),
  },
  'color-blindness-simulator': {
    name: 'Color Blindness Simulator',
    description: 'Simulate color blindness filters on uploaded images.',
    tags: ['image-tools'],
    icon: 'Eye',
    keywords: ['color', 'blindness', 'simulator', 'protanopia', 'deuteranopia', 'accessibility'],
    component: () =>
      import('@/components/tools/ColorBlindnessSimulator').then(
        (module) => module.ColorBlindnessSimulator
      ),
  },
  'color-palette-extractor': {
    name: 'Color Palette Extractor',
    description: 'Extract dominant color palettes from any uploaded image.',
    tags: ['image-tools'],
    icon: 'Palette',
    keywords: ['color', 'palette', 'extract', 'image', 'colors'],
    component: () =>
      import('@/components/tools/ColorPaletteExtractor').then(
        (module) => module.ColorPaletteExtractor
      ),
  },
  'image-to-icon': {
    name: 'Image to Icon',
    description: 'Convert standard images into multi-resolution ICO files.',
    tags: ['image-tools'],
    icon: 'Box',
    keywords: ['image', 'icon', 'ico', 'favicon', 'convert'],
    component: () =>
      import('@/components/tools/ImageToIcon').then(
        (module) => module.ImageToIcon
      ),
  },
  'svg-to-png': {
    name: 'SVG to PNG Converter',
    description: 'Rasterize SVG vector code or files into PNG images.',
    tags: ['image-tools'],
    icon: 'FileImage',
    keywords: ['svg', 'png', 'rasterize', 'convert', 'vector'],
    component: () =>
      import('@/components/tools/SvgToPng').then(
        (module) => module.SvgToPng
      ),
  },
  'image-converter': {
    name: 'Image Converter & Editor',
    description: 'Convert formats, resize, rotate, and filter your images.',
    tags: ['image-tools'],
    icon: 'Image',
    keywords: ['image', 'convert', 'resize', 'rotate', 'flip', 'filters', 'ico', 'favicon'],
    component: () =>
      import('@/components/tools/ImageConverter').then(
        (module) => module.ImageConverter
      ),
  },
  'image-compressor': {
    name: 'Compress Image',
    description: 'Compress images by adjusting quality and dimensions.',
    tags: ['image-tools'],
    icon: 'Zap',
    keywords: ['image', 'compress', 'optimize', 'shrink', 'size'],
    component: () =>
      import('@/components/tools/ImageCompressor').then(
        (module) => module.ImageCompressor
      ),
  },
  'image-resizer': {
    name: 'Resize Image',
    description: 'Resize image dimensions with aspect ratio constraints.',
    tags: ['image-tools'],
    icon: 'Maximize',
    keywords: ['image', 'resize', 'dimensions', 'width', 'height'],
    component: () =>
      import('@/components/tools/ImageResizer').then(
        (module) => module.ImageResizer
      ),
  },
  'image-cropper': {
    name: 'Crop Image',
    description: 'Crop images using preset or custom aspect ratios.',
    tags: ['image-tools'],
    icon: 'Crop',
    keywords: ['image', 'crop', 'cut', 'aspect ratio'],
    component: () =>
      import('@/components/tools/ImageCropper').then(
        (module) => module.ImageCropper
      ),
  },
  'exif-viewer-remover': {
    name: 'EXIF Viewer & Remover',
    description: 'Inspect and strip metadata from images for privacy.',
    tags: ['image-tools'],
    icon: 'Shield',
    keywords: ['exif', 'metadata', 'image', 'jpeg', 'gps', 'privacy', 'remove'],
    component: () =>
      import('@/components/tools/ExifViewerRemover').then(
        (module) => module.ExifViewerRemover
      ),
  },
  'base64-converter': {
    name: 'Base64 Encoder/Decoder',
    description: 'Encode text or files into Base64 and decode them.',
    tags: ['encoders-decoders'],
    icon: 'Binary',
    keywords: ['base64', 'encode', 'decode'],
    featured: true,
    component: () =>
      import('@/components/tools/Base64Converter').then(
        (module) => module.Base64Converter
      ),
  },
  'number-base-converter': {
    name: 'Number Base Converter',
    description: 'Convert numbers between binary, decimal, hex, and octal.',
    tags: ['converters'],
    icon: 'Hash',
    keywords: ['number', 'binary', 'hex', 'octal', 'decimal'],
    component: () =>
      import('@/components/tools/NumberBaseConverter').then(
        (module) => module.NumberBaseConverter
      ),
  },
  'json-yaml-xml': {
    name: 'JSON / YAML / XML / CSV / TOML Converter',
    description: 'Convert data between JSON, YAML, XML, CSV, and TOML.',
    tags: ['converters'],
    icon: 'Code',
    keywords: ['json', 'yaml', 'xml', 'csv', 'toml', 'convert', 'converter', 'parse', 'stringify'],
    component: () =>
      import('@/components/tools/JsonYamlXmlConverter').then(
        (module) => module.JsonYamlXmlConverter
      ),
  },
  'yaml-json-converter': {
    name: 'YAML ↔ JSON Converter',
    description: 'Convert between YAML and JSON with formatting controls.',
    tags: ['converters'],
    icon: 'ArrowRightLeft',
    keywords: ['yaml', 'json', 'converter', 'serialize', 'parse'],
    hidden: true,
    component: () =>
      import('@/components/tools/YamlJsonConverter').then(
        (module) => module.YamlJsonConverter
      ),
  },
  'csv-json-converter': {
    name: 'CSV ↔ JSON Converter',
    description: 'Convert between CSV and JSON arrays with header mapping.',
    tags: ['converters'],
    icon: 'FileSpreadsheet',
    keywords: ['csv', 'json', 'converter', 'spreadsheet', 'table', 'delimiter'],
    hidden: true,
    component: () =>
      import('@/components/tools/CsvJsonConverter').then(
        (module) => module.CsvJsonConverter
      ),
  },
  'curl-to-code': {
    name: 'cURL Command to Code',
    description: 'Convert cURL commands to Fetch, Axios, Python, Go, and Rust.',
    tags: ['converters'],
    icon: 'Terminal',
    keywords: ['curl', 'fetch', 'axios', 'python', 'go', 'rust', 'request', 'convert', 'snippet'],
    component: () =>
      import('@/components/tools/CurlConverter').then(
        (module) => module.CurlConverter
      ),
  },
  'json-to-typescript': {
    name: 'JSON to TypeScript',
    description: 'Convert raw JSON payloads into typed TypeScript interfaces.',
    tags: ['converters'],
    icon: 'FileCode',
    keywords: ['json', 'typescript', 'ts', 'interface', 'type', 'convert', 'generate', 'schema'],
    component: () =>
      import('@/components/tools/JsonToTypescript').then(
        (module) => module.JsonToTypescript
      ),
  },
  'markdown-to-docx': {
    name: 'Markdown to DOCX Converter',
    description: 'Convert Markdown to styled Word documents (.docx) format.',
    tags: ['converters'],
    icon: 'FileText',
    keywords: ['markdown', 'docx', 'word', 'convert', 'pagination', 'spacing', 'page break'],
    component: () =>
      import('@/components/tools/MarkdownToDocx').then(
        (module) => module.MarkdownToDocx
      ),
  },
  'timestamp-converter': {
    name: 'Unix Timestamp Converter',
    description: 'Convert Unix timestamps to readable date and time.',
    tags: ['converters'],
    icon: 'Clock',
    keywords: ['timestamp', 'unix', 'date', 'time'],
    component: () =>
      import('@/components/tools/TimestampConverter').then(
        (module) => module.TimestampConverter
      ),
  },
  'url-encoder': {
    name: 'URL Encoder/Decoder',
    description: 'Encode and decode URL parameters and queries safely.',
    tags: ['encoders-decoders'],
    icon: 'Link',
    keywords: ['url', 'encode', 'decode', 'uri'],
    component: () =>
      import('@/components/tools/UrlEncoder').then((module) => module.UrlEncoder),
  },
  'hex-converter': {
    name: 'Hex ↔ String Converter',
    description: 'Convert text to hex representations and vice-versa.',
    tags: ['encoders-decoders'],
    icon: 'Binary',
    keywords: ['hex', 'string', 'text', 'convert', 'encode', 'decode', 'binary'],
    component: () =>
      import('@/components/tools/HexConverter').then(
        (module) => module.HexConverter
      ),
  },
  'punycode-converter': {
    name: 'Punycode Converter',
    description: 'Translate domain names to and from Punycode format.',
    tags: ['encoders-decoders'],
    icon: 'Globe',
    keywords: ['punycode', 'domain', 'idn', 'unicode', 'ascii', 'convert', 'dns'],
    component: () =>
      import('@/components/tools/PunycodeConverter').then(
        (module) => module.PunycodeConverter
      ),
  },
  'morse-binary-converter': {
    name: 'Morse Code & Binary Converter',
    description: 'Convert text to Morse code or binary, with audio playback.',
    tags: ['encoders-decoders'],
    icon: 'Music',
    keywords: ['morse', 'binary', 'audio', 'beep', 'play', 'text', 'encode', 'decode'],
    component: () =>
      import('@/components/tools/MorseBinaryConverter').then(
        (module) => module.MorseBinaryConverter
      ),
  },
  'url-parser-builder': {
    name: 'URL Parser & Builder',
    description: 'Deconstruct, edit, and rebuild complex URL query parameters.',
    tags: ['encoders-decoders'],
    icon: 'Link2',
    keywords: ['url', 'parser', 'builder', 'query', 'parameter', 'encode', 'decode'],
    component: () =>
      import('@/components/tools/UrlParserBuilder').then(
        (module) => module.UrlParserBuilder
      ),
  },
  'html-encoder': {
    name: 'HTML Encoder/Decoder',
    description: 'Encode special characters to HTML entities and decode.',
    tags: ['encoders-decoders'],
    icon: 'Code2',
    keywords: ['html', 'encode', 'decode', 'entities'],
    component: () =>
      import('@/components/tools/HtmlEncoder').then(
        (module) => module.HtmlEncoder
      ),
  },
  'case-converter': {
    name: 'Case Converter',
    description: 'Convert text between camelCase, snake_case, and more.',
    tags: ['text-tools'],
    icon: 'CaseSensitive',
    keywords: ['case', 'camel', 'snake', 'pascal', 'kebab', 'convert'],
    component: () =>
      import('@/components/tools/CaseConverter').then(
        (module) => module.CaseConverter
      ),
  },
  'jwt-decoder': {
    name: 'JWT Decoder',
    description: 'Decode, parse, and inspect JSON Web Tokens (JWT).',
    tags: ['encoders-decoders'],
    icon: 'KeyRound',
    keywords: ['jwt', 'token', 'decode', 'authentication'],
    component: () =>
      import('@/components/tools/JwtDecoder').then((module) => module.JwtDecoder),
  },
  'text-escape': {
    name: 'Text Escape/Unescape',
    description: 'Escape or unescape special characters for programming.',
    tags: ['encoders-decoders'],
    icon: 'Quote',
    keywords: ['escape', 'unescape', 'text', 'special'],
    component: () =>
      import('@/components/tools/TextEscape').then((module) => module.TextEscape),
  },
  'hash-generator': {
    name: 'Hash Generator',
    description: 'Generate secure MD5, SHA-1, SHA-256, and SHA-512 hashes.',
    tags: ['security'],
    icon: 'Shield',
    keywords: ['hash', 'md5', 'sha', 'checksum'],
    featured: true,
    component: () =>
      import('@/components/tools/HashGenerator').then(
        (module) => module.HashGenerator
      ),
  },
  'uuid-generator': {
    name: 'UUID Generator',
    description: 'Generate random UUID v4, time-based v7, or custom IDs.',
    tags: ['generators'],
    icon: 'Fingerprint',
    keywords: ['uuid', 'guid', 'generate', 'unique'],
    featured: true,
    component: () =>
      import('@/components/tools/UuidGenerator').then(
        (module) => module.UuidGenerator
      ),
  },
  'snowflake-id-generator': {
    name: 'Snowflake ID Generator & Decoder',
    description: 'Generate and decode customizable 64-bit Snowflake IDs.',
    tags: ['generators'],
    icon: 'Cpu',
    keywords: ['snowflake', 'id', 'generator', 'decoder', 'parser', 'unique', 'twitter', 'discord', 'instagram'],
    component: () =>
      import('@/components/tools/SnowflakeGenerator').then(
        (module) => module.SnowflakeGenerator
      ),
  },
  'password-generator': {
    name: 'Password Generator',
    description: 'Generate secure, customizable random passwords.',
    tags: ['generators'],
    icon: 'Key',
    keywords: ['password', 'generate', 'random', 'secure'],
    component: () =>
      import('@/components/tools/PasswordGenerator').then(
        (module) => module.PasswordGenerator
      ),
  },
  'lorem-ipsum': {
    name: 'Lorem Ipsum Generator',
    description: 'Generate custom placeholder lorem ipsum text blocks.',
    tags: ['generators'],
    icon: 'AlignLeft',
    keywords: ['lorem', 'ipsum', 'placeholder', 'text'],
    component: () =>
      import('@/components/tools/LoremIpsumGenerator').then(
        (module) => module.LoremIpsumGenerator
      ),
  },
  'sql-formatter': {
    name: 'SQL Formatter & Validator',
    description: 'Format and validate SQL queries for multiple dialects.',
    tags: ['formatters-validators'],
    icon: 'Database',
    keywords: ['sql', 'format', 'database', 'query', 'validate', 'validator', 'syntax'],
    component: () =>
      import('@/components/tools/SqlFormatter').then(
        (module) => module.SqlFormatter
      ),
  },
  'json-formatter': {
    name: 'JSON Formatter & Validator',
    description: 'Format, validate, and query JSON with an interactive tree.',
    tags: ['formatters-validators'],
    icon: 'Braces',
    keywords: ['json', 'format', 'validate', 'pretty', 'validator', 'tree', 'query', 'jsonpath'],
    featured: true,
    component: () =>
      import('@/components/tools/JsonFormatter').then(
        (module) => module.JsonFormatter
      ),
  },
  'json-validator': {
    name: 'JSON Validator',
    description: 'Validate JSON syntax and inspect formatted outputs.',
    tags: ['formatters-validators'],
    icon: 'CheckCircle',
    keywords: ['json', 'validate', 'validator', 'syntax', 'parse'],
    hidden: true,
    component: () =>
      import('@/components/tools/JsonValidator').then(
        (module) => module.JsonValidator
      ),
  },
  'yaml-validator': {
    name: 'YAML Formatter & Validator',
    description: 'Format and validate YAML data with an interactive tree.',
    tags: ['formatters-validators'],
    icon: 'FileCode',
    keywords: ['yaml', 'format', 'validate', 'pretty', 'validator', 'tree', 'syntax', 'parse'],
    component: () =>
      import('@/components/tools/YamlValidator').then(
        (module) => module.YamlValidator
      ),
  },
  'xml-formatter': {
    name: 'XML Formatter & Validator',
    description: 'Format and validate XML markup with an interactive tree.',
    tags: ['formatters-validators'],
    icon: 'FileCode',
    keywords: ['xml', 'format', 'pretty', 'validate', 'validator', 'tree', 'syntax'],
    component: () =>
      import('@/components/tools/XmlFormatter').then(
        (module) => module.XmlFormatter
      ),
  },
  'xml-validator': {
    name: 'XML Validator',
    description: 'Validate XML document syntax and check for errors.',
    tags: ['formatters-validators'],
    icon: 'CheckCircle',
    keywords: ['xml', 'validate', 'syntax'],
    hidden: true,
    component: () =>
      import('@/components/tools/XmlValidator').then(
        (module) => module.XmlValidator
      ),
  },
  'markdown-editor': {
    name: 'Markdown Editor',
    description: 'Write, preview, and export Markdown with a clean editor.',
    tags: ['text-tools'],
    icon: 'FileCode',
    keywords: ['markdown', 'preview', 'render', 'editor', 'write', 'html', 'export'],
    component: () =>
      import('@/components/tools/MarkdownEditor').then(
        (module) => module.MarkdownEditor
      ),
  },
  'text-diff': {
    name: 'Text Diff Visualizer',
    description: 'Compare texts using side-by-side or inline diff views.',
    tags: ['text-tools'],
    icon: 'GitCompare',
    keywords: ['diff', 'compare', 'text', 'changes'],
    component: () =>
      import('@/components/tools/TextDiff').then((module) => module.TextDiff),
  },
  'regex-tester': {
    name: 'Regex Tester',
    description: 'Test and debug regular expressions with highlighting.',
    tags: ['text-tools'],
    icon: 'SearchCode',
    keywords: ['regex', 'regexp', 'test', 'pattern'],
    component: () =>
      import('@/components/tools/RegexTester').then(
        (module) => module.RegexTester
      ),
  },
  'word-counter': {
    name: 'Word Counter',
    description: 'Count words, characters, lines, and read time for text.',
    tags: ['text-tools'],
    icon: 'WholeWord',
    keywords: ['word', 'counter', 'characters', 'sentences', 'reading time', 'text'],
    component: () =>
      import('@/components/tools/WordCounter').then(
        (module) => module.WordCounter
      ),
  },
  'find-replace': {
    name: 'Find and Replace',
    description: 'Search and replace text using standard or regex terms.',
    tags: ['text-tools'],
    icon: 'Replace',
    keywords: ['find', 'replace', 'search', 'regex', 'text'],
    component: () =>
      import('@/components/tools/FindAndReplace').then(
        (module) => module.FindAndReplace
      ),
  },
  'resume-ats-analyzer': {
    name: 'CV / Resume ATS Analyzer',
    description: 'Parse PDF resumes and score their ATS search compliance.',
    tags: ['text-tools'],
    icon: 'FileSearch',
    keywords: ['resume', 'cv', 'ats', 'pdf', 'readability', 'keywords', 'job description'],
    component: () =>
      import('@/components/tools/ResumeAtsAnalyzer').then(
        (module) => module.ResumeAtsAnalyzer
      ),
  },
  'cron-parser': {
    name: 'Cron Expression Parser',
    description: 'Parse, validate, and generate standard cron expressions.',
    tags: ['utilities'],
    icon: 'Calendar',
    keywords: ['cron', 'schedule', 'parse', 'generate'],
    component: () =>
      import('@/components/tools/CronParser').then((module) => module.CronParser),
  },
  'qr-code-generator': {
    name: 'QR Code Generator',
    description: 'Generate custom QR codes with PNG and SVG export options.',
    tags: ['generators'],
    icon: 'QrCode',
    keywords: ['qr', 'qrcode', 'barcode', 'url', 'text', 'png', 'svg'],
    component: () =>
      import('@/components/tools/QrCodeGenerator').then(
        (module) => module.QrCodeGenerator
      ),
  },
  'gzip-compressor': {
    name: 'GZip Compressor / Decompressor',
    description: 'Compress and decompress text using native browser GZip.',
    tags: ['utilities'],
    icon: 'PackageOpen',
    keywords: ['gzip', 'compress', 'decompress', 'deflate', 'base64', 'zip'],
    component: () =>
      import('@/components/tools/GzipCompressor').then(
        (module) => module.GzipCompressor
      ),
  },
  'text-to-speech': {
    name: 'Text to Speech',
    description: 'Convert text to spoken audio using browser speech synthesis.',
    tags: ['utilities'],
    icon: 'Volume2',
    keywords: ['tts', 'text to speech', 'voice', 'speak', 'speech', 'read aloud', 'audio'],
    component: () =>
      import('@/components/tools/TextToSpeech').then(
        (module) => module.TextToSpeech
      ),
  },
  'speech-to-text': {
    name: 'Speech to Text',
    description: 'Transcribe voice or microphone input into text in real-time.',
    tags: ['utilities'],
    icon: 'Mic',
    keywords: ['stt', 'speech to text', 'dictation', 'transcribe', 'voice typing', 'microphone', 'speech recognition'],
    component: () =>
      import('@/components/tools/SpeechToText').then(
        (module) => module.SpeechToText
      ),
  },
  'rsa-key-generator': {
    name: 'RSA Key Pair Generator',
    description: 'Generate secure client-side RSA public/private key pairs.',
    tags: ['security'],
    icon: 'KeySquare',
    keywords: ['rsa', 'key', 'pair', 'public', 'private', 'encryption', 'security'],
    component: () =>
      import('@/components/tools/RsaKeyGenerator').then(
        (module) => module.RsaKeyGenerator
      ),
  },
  'aes-encryption': {
    name: 'AES Encryption/Decryption',
    description: 'Encrypt and decrypt text using secure AES-256-GCM.',
    tags: ['security'],
    icon: 'Lock',
    keywords: ['aes', 'encrypt', 'decrypt', 'security', 'cipher'],
    component: () =>
      import('@/components/tools/AesEncryption').then(
        (module) => module.AesEncryption
      ),
  },
  'password-hasher': {
    name: 'Password Hasher',
    description: 'Hash and verify passwords with Bcrypt or Argon2.',
    tags: ['security'],
    icon: 'ShieldCheck',
    keywords: ['bcrypt', 'argon2', 'argon2id', 'argon2i', 'argon2d', 'hash', 'password', 'verify', 'security'],
    featured: true,
    component: () =>
      import('@/components/tools/PasswordHasher').then(
        (module) => module.PasswordHasher
      ),
  },
  'bcrypt-hasher': {
    name: 'Bcrypt Hasher',
    description: 'Securely hash and verify passwords using Bcrypt.',
    tags: ['security'],
    icon: 'ShieldCheck',
    keywords: ['bcrypt', 'hash', 'password', 'verify', 'security'],
    hidden: true,
    component: () =>
      import('@/components/tools/PasswordHasher').then(
        (module) => module.PasswordHasher
      ),
  },
  'certificate-decoder': {
    name: 'Certificate Decoder',
    description: 'Inspect and decode X.509 certificates and fingerprints.',
    tags: ['security'],
    icon: 'BadgeCheck',
    keywords: ['certificate', 'x509', 'ssl', 'tls', 'pem', 'crt', 'der', 'openssl', 'inspect', 'decode'],
    component: () =>
      import('@/components/tools/CertificateDecoder').then(
        (module) => module.CertificateDecoder
      ),
  },
  'ip-lookup': {
    name: 'IP Address Lookup',
    description: 'Look up geolocation and network details for any IP.',
    tags: ['networking'],
    icon: 'MapPin',
    keywords: ['ip', 'address', 'lookup', 'geolocation', 'network'],
    component: () =>
      import('@/components/tools/IpLookup').then((module) => module.IpLookup),
  },
  'dns-lookup': {
    name: 'DNS Records Lookup',
    description: 'Query DNS records like A, AAAA, MX, TXT, and CNAME.',
    tags: ['networking'],
    icon: 'Server',
    keywords: ['dns', 'lookup', 'records', 'domain', 'nameserver'],
    component: () =>
      import('@/components/tools/DnsLookup').then((module) => module.DnsLookup),
  },
  'subnet-calculator': {
    name: 'Subnet Calculator',
    description: 'Calculate network subnets, CIDR ranges, and IP masks.',
    tags: ['networking'],
    icon: 'Network',
    keywords: ['subnet', 'cidr', 'netmask', 'ip', 'calculator'],
    component: () =>
      import('@/components/tools/SubnetCalculator').then(
        (module) => module.SubnetCalculator
      ),
  },
  'port-checker': {
    name: 'Port Scanner',
    description: 'Scan common network ports and services for connectivity.',
    tags: ['networking'],
    icon: 'Radar',
    keywords: ['port', 'scanner', 'check', 'services', 'network'],
    component: () =>
      import('@/components/tools/PortChecker').then(
        (module) => module.PortChecker
      ),
  },
  'svg-path-editor': {
    name: 'SVG Path Editor/Optimizer',
    description: 'Edit, visualize, and optimize vector SVG path data.',
    tags: ['design'],
    icon: 'Pen',
    keywords: ['svg', 'path', 'editor', 'optimize', 'visualize', 'vector'],
    component: () =>
      import('@/components/tools/SvgPathEditor').then(
        (module) => module.SvgPathEditor
      ),
  },
  'color-contrast-checker': {
    name: 'Color Contrast Checker',
    description: 'Check color contrast ratios for WCAG A11y compliance.',
    tags: ['design'],
    icon: 'Eye',
    keywords: ['color', 'contrast', 'wcag', 'accessibility', 'a11y', 'compliance'],
    component: () =>
      import('@/components/tools/ColorContrastChecker').then(
        (module) => module.ColorContrastChecker
      ),
  },
  'color-picker': {
    name: 'Color Picker',
    description: 'Pick colors, adjust color channels, and get CSS codes.',
    tags: ['design'],
    icon: 'Pipette',
    keywords: [
      'color',
      'picker',
      'eyedropper',
      'palette',
      'hex',
      'rgb',
      'hsl',
      'css',
      'swatch',
    ],
    component: () =>
      import('@/components/tools/ColorPicker').then(
        (module) => module.ColorPicker
      ),
  },
  'glassmorphism-generator': {
    name: 'Glassmorphism Generator',
    description: 'Design and preview glassmorphism CSS backdrop effects.',
    tags: ['design'],
    icon: 'Sparkles',
    keywords: ['glassmorphism', 'glass', 'css', 'generator', 'backdrop-filter', 'ui', 'design', 'styles'],
    component: () =>
      import('@/components/tools/GlassmorphismGenerator').then(
        (module) => module.GlassmorphismGenerator
      ),
  },
  'box-shadow-generator': {
    name: 'CSS Box Shadow Generator',
    description: 'Design, layer, and preview custom CSS box shadows.',
    tags: ['design'],
    icon: 'Layers',
    keywords: [
      'css',
      'shadow',
      'box-shadow',
      'generator',
      'visualizer',
      'tailwind',
      'style',
      'glow',
      'neumorphism',
    ],
    component: () =>
      import('@/components/tools/BoxShadowVisualizer').then(
        (module) => module.BoxShadowVisualizer
      ),
  },
  'percentage-calculator': {
    name: 'Percentage Calculator',
    description: 'Calculate percentage values, changes, and ratios.',
    tags: ['calculators'],
    icon: 'Percent',
    keywords: [
      'percentage',
      'percent',
      'calculator',
      'ratio',
      'increase',
      'decrease',
      'change',
      'math',
    ],
    component: () =>
      import('@/components/tools/PercentageCalculator').then(
        (module) => module.PercentageCalculator
      ),
  },
  'unit-converter': {
    name: 'Unit Converter',
    description: 'Convert between length, weight, data, and other units.',
    tags: ['calculators'],
    icon: 'Scale',
    keywords: [
      'unit',
      'converter',
      'measurement',
      'length',
      'weight',
      'temperature',
      'speed',
      'time',
      'data',
      'area',
      'volume',
    ],
    component: () =>
      import('@/components/tools/UnitConverter').then(
        (module) => module.UnitConverter
      ),
  },
  'age-calculator': {
    name: 'Age Calculator',
    description: 'Calculate age details, total days, and next birthday.',
    tags: ['calculators'],
    icon: 'Cake',
    keywords: [
      'age',
      'birthday',
      'date of birth',
      'years',
      'months',
      'days',
      'next birthday',
      'calculator',
    ],
    component: () =>
      import('@/components/tools/AgeCalculator').then(
        (module) => module.AgeCalculator
      ),
  },
  'timezone-converter': {
    name: 'Timezone Converter',
    description: 'Convert date and time values across global timezones.',
    tags: ['calculators'],
    icon: 'Clock3',
    keywords: [
      'timezone',
      'time zone',
      'convert',
      'date time',
      'utc',
      'offset',
      'iana',
      'world clock',
    ],
    component: () =>
      import('@/components/tools/TimezoneConverter').then(
        (module) => module.TimezoneConverter
      ),
  },
  'currency-converter': {
    name: 'Currency Converter',
    description: 'Convert currencies using live exchange rates.',
    tags: ['calculators'],
    icon: 'BadgeDollarSign',
    keywords: [
      'currency',
      'exchange rate',
      'forex',
      'money',
      'usd',
      'eur',
      'convert',
      'live rates',
    ],
    component: () =>
      import('@/components/tools/CurrencyConverter').then(
        (module) => module.CurrencyConverter
      ),
  },
  'bmi-calculator': {
    name: 'BMI Calculator',
    description: 'Calculate Body Mass Index using metric or US units.',
    tags: ['calculators'],
    icon: 'Scale',
    keywords: [
      'bmi',
      'body mass index',
      'weight',
      'height',
      'health',
      'metric',
      'pounds',
      'kilograms',
    ],
    component: () =>
      import('@/components/tools/BmiCalculator').then(
        (module) => module.BmiCalculator
      ),
  },
  'date-difference-calculator': {
    name: 'Date Difference Calculator',
    description: 'Calculate the exact duration and days between two dates.',
    tags: ['calculators'],
    icon: 'CalendarRange',
    keywords: [
      'date',
      'difference',
      'duration',
      'days',
      'weeks',
      'months',
      'years',
      'calculator',
    ],
    component: () =>
      import('@/components/tools/DateDifferenceCalculator').then(
        (module) => module.DateDifferenceCalculator
      ),
  },
  'clamp-calculator': {
    name: 'CSS Clamp Calculator',
    description: 'Generate responsive CSS clamp() functions for layouts.',
    tags: ['calculators'],
    icon: 'Maximize',
    keywords: [
      'css',
      'clamp',
      'fluid',
      'responsive',
      'typography',
      'font size',
      'rem',
      'px',
      'calculator',
    ],
    component: () =>
      import('@/components/tools/ClampCalculator').then(
        (module) => module.ClampCalculator
      ),
  },
  'pdf-editor': {
    name: 'Edit PDF',
    description: 'Rearrange, rotate, delete, and annotate PDF pages.',
    tags: ['pdf-tools'],
    icon: 'FilePenLine',
    keywords: ['pdf', 'edit', 'annotate', 'signature', 'rotate', 'reorder', 'delete'],
    component: () =>
      import('@/components/tools/PdfEditor').then(
        (module) => module.PdfEditor
      ),
  },
  'pdf-compress': {
    name: 'Compress PDF',
    description: 'Reduce PDF file size by compressing images and structure.',
    tags: ['pdf-tools'],
    icon: 'FileDown',
    keywords: ['pdf', 'compress', 'shrink', 'size', 'optimize'],
    component: () =>
      import('@/components/tools/PdfCompress').then(
        (module) => module.PdfCompress
      ),
  },
  'pdf-watermark': {
    name: 'PDF Watermark',
    description: 'Add text or image watermarks to your PDF pages easily.',
    tags: ['pdf-tools'],
    icon: 'Shield',
    keywords: ['pdf', 'watermark', 'text', 'image', 'stamp', 'confidential'],
    component: () =>
      import('@/components/tools/PdfWatermark').then(
        (module) => module.PdfWatermark
      ),
  },
  'roman-numeral-converter': {
    name: 'Roman Numeral Converter',
    description: 'Bidirectional converter between decimal and Roman numerals.',
    tags: ['converters', 'calculators'],
    icon: 'Binary',
    keywords: ['roman', 'numeral', 'decimal', 'number', 'convert', 'math'],
    component: () =>
      import('@/components/tools/RomanNumeralConverter').then(
        (module) => module.RomanNumeralConverter
      ),
  },
  'list-converter': {
    name: 'List Converter',
    description: 'Convert lists to JSON, CSV, SQL IN clauses, and custom formats.',
    tags: ['converters', 'text-tools'],
    icon: 'ListCollapse',
    keywords: ['list', 'convert', 'csv', 'json', 'sql', 'in', 'array', 'format'],
    component: () =>
      import('@/components/tools/ListConverter').then(
        (module) => module.ListConverter
      ),
  },
  'mock-data-generator': {
    name: 'Mock Data Generator',
    description: 'Generate mock user lists, addresses, and custom schemas.',
    tags: ['generators', 'utilities'],
    icon: 'Database',
    keywords: ['mock', 'dummy', 'data', 'generate', 'generator', 'csv', 'json', 'schema', 'test'],
    component: () =>
      import('@/components/tools/MockDataGenerator').then(
        (module) => module.MockDataGenerator
      ),
  },
} as const satisfies Record<string, ToolRegistryEntry>;

// Enforce strict limits on tool description lengths to ensure visual consistency in the UI
const MIN_DESC_LIMIT = 40;
const MAX_DESC_LIMIT = 65;

for (const [id, tool] of Object.entries(TOOL_REGISTRY)) {
  const length = tool.description.length;
  if (length < MIN_DESC_LIMIT || length > MAX_DESC_LIMIT) {
    throw new Error(
      `Tool Description Limit Error: Description for tool "${id}" is ${length} characters. ` +
      `It must be between ${MIN_DESC_LIMIT} and ${MAX_DESC_LIMIT} characters (inclusive).`
    );
  }
}

export type ToolId = keyof typeof TOOL_REGISTRY;

export function getToolComponentLoader(id: string): ToolComponentLoader | undefined {
  return TOOL_REGISTRY[id as ToolId]?.component;
}

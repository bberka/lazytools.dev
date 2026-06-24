# Proposed Tools Backlog

This document serves as a reference catalog for the proposed client-side tools that can be added to the lazytools.dev platform. It complements the high-level roadmap in [ROADMAP.md](./ROADMAP.md) by providing implementation libraries, browser APIs, and features for each proposed tool.

---

## Technical Guidelines
All tools must be:
- **100% Client-Side**: No user-entered data leaves the browser.
- **Static Export Compatible**: Next.js static builds are supported. External lookups must use public CORS-enabled HTTPS endpoints.
- **Lazy Loaded**: Heavy libraries must be loaded dynamically inside the tool's component.

---

## Detailed Tool BACKLOG

### 1. Converters

#### cURL Command to Fetch/Axios Converter (Status: Implemented)
- **Description**: Convert raw cURL commands into JavaScript fetch, Axios, Python requests, or Go snippets.
- **Key Features**: Auto-parsing of raw curl options, selection of target language output, highlight styling.
- **Implementation**: Pure client-side parsing using standard string parsing or the `curlconverter` package.

#### JSON/YAML/XML to Multi-Language Model Generator
- **Description**: Convert JSON, YAML, or XML payloads into typed code models for multiple languages.
- **Key Features**: Supports input parsing of JSON, YAML, and XML; generates typed interfaces, classes, or structs for TypeScript, C#, Go, Rust, Java, Python, and PHP; customizable declaration style, property optionals, and formatting config.
- **Implementation**: Client-side AST parsing and mapping.

#### JSON/CSV to TOML (Status: Implemented)
- **Description**: Bidirectional conversion between JSON, CSV, and TOML formats.
- **Key Features**: Prettification, indentation spacing settings.
- **Implementation**: Dynamic imports of `@iarna/toml` or a lightweight YAML/TOML package.

#### Roman Numeral Converter (Status: Implemented)
- **Description**: Convert numbers to Roman numerals and vice versa.
- **Key Features**: Bidirectional conversion, validates standard Roman numeral syntax.
- **Implementation**: Custom parsing algorithm.

#### List Converter (Status: Implemented)
- **Description**: Convert line-break lists to comma-separated, JSON arrays, SQL IN clauses, etc.
- **Key Features**: Custom delimiters, quoting options, removing duplicates.
- **Implementation**: Native JS string/array operations.

---

### 2. Encoders & Decoders

#### Hex to String / String to Hex Converter (Status: Implemented)
- **Description**: Convert text to hexadecimal representation and vice-versa.
- **Key Features**: Customizable prefixes (`\x`, `0x`), byte count summaries.
- **Implementation**: Native JS string conversion.

#### Punycode Encoder/Decoder (Status: Implemented)
- **Description**: Translate internationalized domain names (IDN) to/from Punycode.
- **Key Features**: Encodes special characters (e.g. `münchen` ↔ `xn--mnchen-3ya`).
- **Implementation**: Lightweight `punycode.js` library.

#### Morse Code / Binary Encoder (Status: Implemented)
- **Description**: Encode text to binary or Morse code (with optional audio playback).
- **Key Features**: Plays audio representing Morse code using the browser's Web Audio API oscillators.
- **Implementation**: Custom Morse dictionary mapping; native audio synthesis.

#### Outlook Safelink Decoder
- **Description**: Decode obfuscated enterprise Outlook safelinks back to their original URLs.
- **Key Features**: Extracts the original URL from the `url=` parameter.
- **Implementation**: URL search params decoding.

#### Compression Algorithms Visualizer
- **Description**: Compress and decompress text using LZW, RLE, and Huffman coding.
- **Key Features**: Step-by-step compression walkthrough, dictionary generation trees, compression ratio statistics.
- **Implementation**: Client-side implementations of Lempel–Ziv–Welch (LZW), Run-Length Encoding (RLE), and Huffman coding.

---

### 3. Generators

#### Mock/Dummy Data Generator (Status: Implemented)
- **Description**: Generate mock user lists, addresses, and schemas to export as CSV/JSON.
- **Key Features**: Custom schemas (names, addresses, phone numbers, emails), adjustable row limits.
- **Implementation**: Custom mock lists or dynamic imports of a lightweight faking utility.

#### SSH Key Generator
- **Description**: Generate client-side SSH public and private key pairs (RSA, ECDSA) via WebCrypto.
- **Key Features**: Key size selectors, browser downloads for public and private keys.
- **Implementation**: Uses native **Web Cryptography API** (`window.crypto.subtle.generateKey`).

#### Barcode Generator
- **Description**: Generate linear 1D barcodes (Code 128, EAN, UPC) in SVG/PNG format.
- **Key Features**: Format selectors, size settings, copy/download outputs.
- **Implementation**: Uses `jsbarcode` library.

#### TOTP (2FA) Code Generator
- **Description**: Generate and display 6-digit 2FA authenticator codes from secret keys.
- **Key Features**: Real-time counter, scanning inputs.
- **Implementation**: Uses `otplib` or lightweight HMAC-SHA1 calculation.

#### ULID Generator
- **Description**: Generate Universally Unique Lexicographically Sortable Identifiers.
- **Key Features**: Timestamp-based sorting, random generation.
- **Implementation**: Dynamically imported `ulid` library.

#### Basic Auth Generator
- **Description**: Generate HTTP `Basic` authentication headers.
- **Key Features**: Encodes `username:password` in base64.
- **Implementation**: Native `btoa()` base64 encoding.

#### WiFi QR Code Generator
- **Description**: Generate QR codes that automatically connect devices to a WiFi network.
- **Key Features**: WPA/WEP/Hidden network support.
- **Implementation**: QR code generator with specific WiFi string format `WIFI:T:WPA;S:MyNetwork;P:MyPassword;;`.

---

### 4. Formatters & Validators

#### CSS Minifier & Formatter
- **Description**: Beautify or compress stylesheet blocks.
- **Key Features**: Custom rules, indentation spaces, comparison metrics (pre vs. post size).
- **Implementation**: Client-side regex parser or lightweight minifier.

#### HTML Minifier & Formatter
- **Description**: Format or minify markup and strip comments.
- **Key Features**: Comments removal, tag formatting.
- **Implementation**: Lightweight parser.

#### JSON Schema Validator
- **Description**: Validate JSON data instances against a provided JSON Schema.
- **Key Features**: Two-pane editor layout, displays exact validation exceptions with line numbers.
- **Implementation**: Dynamically imported `ajv` validator library.

#### JSON Minify
- **Description**: Minify JSON payloads by removing all whitespace and newlines.
- **Key Features**: One-click minification, copy to clipboard.
- **Implementation**: `JSON.stringify()` with no spaces.

#### Phone Parser and Formatter
- **Description**: Parse international phone numbers to extract country codes and formats.
- **Key Features**: Country flags, validity checking, formatting (E.164, national).
- **Implementation**: `google-libphonenumber` or `awesome-phonenumber`.

#### IBAN Validator and Parser
- **Description**: Validate international bank account numbers and extract bank details.
- **Key Features**: Country format validation, checksum verification.
- **Implementation**: Client-side IBAN validation library.

---

### 5. Text Tools

#### Text Sorter & Deduplicator
- **Description**: Sort lists alphabetically, by length, and remove duplicate entries.
- **Key Features**: Strips leading/trailing spaces, case insensitivity selectors, reverse sorting.
- **Implementation**: Native JS array sorting routines.

#### Zero-Width & Unicode Inspector
- **Description**: Inspect string characters to highlight hidden or zero-width symbols.
- **Key Features**: Detailed Unicode mapping, reveals characters like `\u200B` or control markers.
- **Implementation**: Loop checking character codes.

#### Markdown Table Generator
- **Description**: A visual grid builder to design and export Markdown tables.
- **Key Features**: Visual columns/rows adding, alignment selectors.
- **Implementation**: Standard state-bound React grid.

#### Slugify String
- **Description**: Convert standard text into URL-friendly slugs.
- **Key Features**: Removes special characters, replaces spaces with hyphens, lowers case.
- **Implementation**: Native regex replacement or `slugify` library.

#### Text to NATO Alphabet
- **Description**: Translate words into the NATO phonetic alphabet.
- **Key Features**: Bidirectional translation if possible, copy out.
- **Implementation**: Dictionary mapping.

#### Text to Unicode / ASCII Art
- **Description**: Convert text into stylized Unicode fonts or ASCII art.
- **Key Features**: Various font styles (Fraktur, script, bold), Figlet ASCII art.
- **Implementation**: Unicode character mapping, `figlet.js`.

#### Email Normalizer
- **Description**: Normalize email addresses (e.g., stripping `+tags` or dots for Gmail).
- **Key Features**: Domain-specific rules (Gmail, Outlook).
- **Implementation**: Regex parsing.

#### Numeronym Generator
- **Description**: Generate i18n-style abbreviations (e.g., "internationalization" -> "i18n").
- **Key Features**: Selectable word length threshold.
- **Implementation**: Native JS string manipulation.

#### HTML WYSIWYG Editor
- **Description**: A rich-text editor that exports to clean HTML.
- **Key Features**: Formatting toolbar, HTML source view.
- **Implementation**: Lightweight editor like `quill` or `tiptap`.

#### JSON Diff
- **Description**: Visual diff tool specifically for comparing two JSON objects.
- **Key Features**: Highlights added, removed, and changed keys, ignores key order.
- **Implementation**: React diff viewer with parsed JSON.

#### AI Summarizer
- **Description**: Generate concise summaries from text or documents.
- **Key Features**: Adjustable summary length.
- **Implementation**: Web LLM API or integration with external AI APIs.

---

### 6. Utilities

#### JWT Creator/Signer
- **Description**: Generate mock JSON Web Tokens (HMAC) for testing authorization flows.
- **Key Features**: Adjustable header/payload parameters, private keys signature.
- **Implementation**: Client-side cryptography via Web Crypto API.

#### Base64 Image Decoder
- **Description**: View and download images from their raw base64 data URLs.
- **Key Features**: Live preview, files info (width, height, size), simple downloads.
- **Implementation**: Native HTML canvas bindings.

#### Screen & Viewport Inspector
- **Description**: Display live viewport specs, pixel ratio, orientation, and browser preferences.
- **Key Features**: Real-time listener on window resizing.
- **Implementation**: Browser standard APIs.

#### Chmod Calculator
- **Description**: Visual Unix file permission calculator (e.g., `rwx` to `777`).
- **Key Features**: Checkboxes for Owner/Group/Public, octal and symbolic output.
- **Implementation**: Bitwise operations.

#### Docker Run to Docker Compose
- **Description**: Convert `docker run` shell commands into `docker-compose.yml` configurations.
- **Key Features**: Parses environment variables, ports, and volumes.
- **Implementation**: Client-side parsing algorithm.

#### MIME Types Reference
- **Description**: Searchable directory of file extensions and their MIME types.
- **Key Features**: Fast offline lookup.
- **Implementation**: Static dictionary dataset.

#### User-Agent Parser
- **Description**: Parse and display device, OS, and browser info from a User-Agent string.
- **Key Features**: Visual badges for browser/OS, current user-agent detection.
- **Implementation**: `ua-parser-js` library.

#### Keycode Info
- **Description**: Press any key to see its Javascript event `keyCode`, `code`, and `key` values.
- **Key Features**: Interactive keyboard listener.
- **Implementation**: Global `keydown` event listener.

#### Git & Regex Cheatsheets
- **Description**: Quick reference guides for standard Git commands and Regex syntax.
- **Key Features**: Categorized commands, click-to-copy.
- **Implementation**: Static markdown/JSON data.

#### Open Graph Meta Generator
- **Description**: Generate and preview SEO/Open Graph HTML meta tags for websites.
- **Key Features**: Facebook/Twitter card previews.
- **Implementation**: React state to HTML string generation.

---

### 7. Security

#### HMAC Generator
- **Description**: Compute HMAC signatures (SHA-256/512) with a custom secret key.
- **Key Features**: Hex and Base64 output options.
- **Implementation**: Native Web Crypto API.

#### Password Strength Evaluator
- **Description**: Real-time password safety metric and warnings using entropy checks.
- **Key Features**: Safe feedback boxes, zxcvbn-based predictions.
- **Implementation**: Uses `@zxcvbn-ts/core`.

#### Self-Signed Certificate Generator
- **Description**: Create client-side self-signed X.509 certificates for local HTTPS.
- **Key Features**: Custom organization details, Common Names.
- **Implementation**: Uses `node-forge`.

#### BIP39 Passphrase Generator
- **Description**: Generate secure crypto wallet recovery phrases (BIP39).
- **Key Features**: 12 or 24 words, multiple languages.
- **Implementation**: `bip39` client-side library.

#### String Obfuscator
- **Description**: Obfuscate text or email addresses to hide them from simple bots.
- **Key Features**: HTML entity encoding, JS `document.write` wrappers.
- **Implementation**: Text encoding utilities.

---

### 8. Networking

#### CORS Request Tester
- **Description**: Test if a given endpoint supports CORS requests directly from the client.
- **Key Features**: Output verbose error descriptions if request fails.
- **Implementation**: Native `fetch` with error status inspection.

#### HTTP Status Codes Cheat Sheet
- **Description**: Fast reference directory of HTTP status codes and specifications.
- **Key Features**: Responsive search filter.
- **Implementation**: Static dictionary.

#### MAC Address Vendor Lookup
- **Description**: Identify NIC manufacturers from MAC address OUI prefixes.
- **Key Features**: Offline fallback dictionary lookup.
- **Implementation**: Static dataset parser.

#### IPv4 Address Converter
- **Description**: Convert IPs between Decimal, Hex, Octal, and Binary formats.
- **Key Features**: Bidirectional conversion.
- **Implementation**: Bitwise IP conversion.

#### IPv4 Range Expander
- **Description**: Expand CIDR notations or IP ranges into a full list of IP addresses.
- **Key Features**: CIDR to IP list, start/end IP to list.
- **Implementation**: IP math calculations.

#### IPv6 ULA Generator
- **Description**: Generate Unique Local IPv6 Addresses (ULA).
- **Key Features**: Random `/48` prefix generation following RFC 4193.
- **Implementation**: Native Math.random() / Web Crypto.

#### MAC Address Generator
- **Description**: Generate random valid MAC addresses.
- **Key Features**: Unicast/Multicast, specific OUI prefixes.
- **Implementation**: Hex string generation.

#### Random Port Generator
- **Description**: Generate random unassigned high-numbered network ports.
- **Key Features**: Avoids known registered ports.
- **Implementation**: Random number within `1024-65535` range.

---

### 9. Design

#### CSS Gradient Generator
- **Description**: Visual multi-stop linear/radial gradient picker producing CSS and Tailwind.
- **Key Features**: Colorful visual sliders, custom stop additions.
- **Implementation**: Direct CSS rendering.

#### SVG Waves & Shape Generator
- **Description**: Visual math-based generator for custom header waves and vector blobs.
- **Key Features**: Amplitude sliders, SVG copy.
- **Implementation**: Bezier curve generators.

#### Tailwind Flexbox & Grid Builder
- **Description**: Click-to-build visual layout grid generating responsive Tailwind CSS.
- **Key Features**: Add/remove container elements, live styling preview.
- **Implementation**: Reactive Tailwind grid elements.

#### SVG Placeholder Generator
- **Description**: Generate lightweight SVG placeholder images with custom dimensions and text.
- **Key Features**: Colors, dimensions, text customization, data-URI export.
- **Implementation**: Dynamic SVG string generation.

#### Code Snippet Image Generator
- **Description**: Convert code snippets into beautiful, styled screenshot images.
- **Key Features**: Rich syntax highlighting for multiple languages, customizable background gradients, macOS-style window controls, padding and typography adjustments, export as PNG.
- **Implementation**: Client-side rendering utilizing `highlight.js` for syntax highlighting and `html2canvas` for DOM-to-image capture.

---

### 10. PDF & Image Tools

#### Client-Side PDF OCR (Image-to-Text)
- **Description**: Scan and extract editable text from scanned PDFs/images.
- **Key Features**: Drag-and-drop file inputs, language selection, loader indicators.
- **Implementation**: Dynamically imported `tesseract.js`.

#### PDF Metadata Editor
- **Description**: View and update standard PDF fields (Author, Title, Subject).
- **Key Features**: Edit forms, download updated documents.
- **Implementation**: Direct edits using `pdf-lib`.

#### Meme Generator
- **Description**: Overlay text on top/bottom of uploaded images and export to PNG.
- **Key Features**: Customize fonts, outlines, sizes, drag positions.
- **Implementation**: HTML Canvas pipeline.

#### Advanced Conversions
- **Description**: Extract data from PDF into editable presentations or spreadsheets.
- **Key Features**: Convert PDF to PowerPoint, Excel, or PDF/A format.
- **Implementation**: External API or advanced WASM PDF parsing.

#### Security & Compliance
- **Description**: Remove or add password security and encryption to PDF documents.
- **Key Features**: AES encryption, digital signatures, blackout redaction.
- **Implementation**: `pdf-lib` encryption features, canvas overlays.

#### Document Manipulation
- **Description**: Crop margins or use a side-by-side diff viewer to spot changes between versions.
- **Key Features**: Visual crop box, add page numbers.
- **Implementation**: `pdf.js` rendering and manipulation.

#### AI & Processing
- **Description**: Repair corrupted PDFs, fill interactive forms, capture mobile scans, translate text.
- **Key Features**: Cross-reference table repair, camera integration, form field detection.
- **Implementation**: File parsing algorithms, MediaDevices API, translation APIs.

---

### 11. Calculators

#### Loan & Mortgage Calculator
- **Description**: Compute loan payment tables and view complete amortization schedules.
- **Key Features**: Interactive monthly tables.
- **Implementation**: Math interest formula.

#### Compound Interest Calculator
- **Description**: Project investment growth with monthly contributions and interest graphs.
- **Key Features**: Clean CSS graphs/charts.
- **Implementation**: Compounding formula models.

#### Math Evaluator
- **Description**: Parse and evaluate complex mathematical expressions.
- **Key Features**: Variables, functions (sin, cos), constants.
- **Implementation**: `mathjs` library.

#### ETA Calculator
- **Description**: Calculate estimated time of arrival based on distance and speed.
- **Key Features**: Various units (km, miles, knots).
- **Implementation**: Standard physics equations.

#### Chronometer / Benchmark Builder
- **Description**: Stopwatches, timers, and JS performance benchmark runners.
- **Key Features**: Lap times, operations per second (ops/sec).
- **Implementation**: `performance.now()` API, `benchmark.js`.

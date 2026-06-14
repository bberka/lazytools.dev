# Roadmap

Live at [lazytools.dev](https://lazytools.dev/). 76 tools across 12 categories.

## Immediate / Quality of Life

- [x] Add route coverage tests (every `TOOLS` entry renders)
- [ ] Add focused tests for pure transform helpers
- [x] Add Playwright smoke tests for search, favorites, command palette, and a tool page
- [ ] Add generated Open Graph images
- [x] Support full desktop multi-platform release wrapper (Tauri v2)

## Tool Expansion Backlog

### 1. Converters
- [x] **cURL Command to Fetch/Axios**: Convert raw cURL commands into JavaScript, Python, Go, or Rust snippets.
- [x] **JSON to TypeScript Interface**: Convert JSON payloads into typed TypeScript interfaces.
- [x] **JSON/CSV to TOML**: Bidirectional conversion between JSON, CSV, and TOML formats.
- [ ] **Roman Numeral Converter**: Convert numbers to Roman numerals and vice versa.
- [ ] **List Converter**: Convert line-break lists to comma-separated, JSON arrays, SQL IN clauses, etc.

### 2. Encoders & Decoders
- [x] **Hex to String / String to Hex**: Convert text to hex representations and vice-versa.
- [x] **Punycode Encoder/Decoder**: Translate internationalized domain names (IDN) to/from Punycode.
- [x] **Morse Code / Binary Encoder**: Encode text to binary or Morse code (with optional audio playback).
- [ ] **Outlook Safelink Decoder**: Decode obfuscated enterprise Outlook safelinks back to their original URLs.

### 3. Generators
- [ ] **Mock/Dummy Data Generator**: Generate mock user lists, addresses, and schemas to export as CSV/JSON.
- [ ] **SSH Key Generator**: Generate client-side SSH public and private key pairs (RSA, ECDSA) via WebCrypto.
- [ ] **Barcode Generator**: Generate linear 1D barcodes (Code 128, EAN, UPC) in SVG/PNG format.
- [ ] **TOTP (2FA) Code Generator**: Generate and display 6-digit 2FA authenticator codes from secret keys.
- [ ] **ULID Generator**: Generate Universally Unique Lexicographically Sortable Identifiers.
- [ ] **Basic Auth Generator**: Generate HTTP `Basic` authentication headers.
- [ ] **WiFi QR Code Generator**: Generate QR codes that automatically connect devices to a WiFi network.

### 4. Formatters & Validators
- [ ] **CSS Minifier & Formatter**: Beautify or compress stylesheet blocks.
- [ ] **HTML Minifier & Formatter**: Format or minify markup and strip comments.
- [ ] **JSON Schema Validator**: Validate JSON data instances against a provided JSON Schema.
- [ ] **JSON Minify**: Minify JSON payloads by removing all whitespace and newlines.
- [ ] **Phone Parser and Formatter**: Parse international phone numbers to extract country codes and formats.
- [ ] **IBAN Validator and Parser**: Validate international bank account numbers and extract bank details.

### 5. Text Tools
- [ ] **Text Sorter & Deduplicator**: Sort lists alphabetically, by length, and remove duplicate entries.
- [ ] **Zero-Width & Unicode Inspector**: Inspect string characters to highlight hidden or zero-width symbols.
- [ ] **Markdown Table Generator**: A visual grid builder to design and export Markdown tables.
- [ ] **Slugify String**: Convert standard text into URL-friendly slugs.
- [ ] **Text to NATO Alphabet**: Translate words into the NATO phonetic alphabet.
- [ ] **Text to Unicode / ASCII Art**: Convert text into stylized Unicode fonts or ASCII art.
- [ ] **Email Normalizer**: Normalize email addresses (e.g., stripping `+tags` or dots for Gmail).
- [ ] **Numeronym Generator**: Generate i18n-style abbreviations (e.g., "internationalization" -> "i18n").
- [ ] **HTML WYSIWYG Editor**: A rich-text editor that exports to clean HTML.
- [ ] **JSON Diff**: Visual diff tool specifically for comparing two JSON objects.
- [ ] **AI Summarizer**: Generate concise summaries from text or documents via AI.

### 6. Utilities
- [ ] **JWT Creator/Signer**: Generate mock JSON Web Tokens (HMAC) for testing authorization flows.
- [ ] **Base64 Image Decoder**: View and download images from their raw base64 data URLs.
- [ ] **Screen & Viewport Inspector**: Display live viewport specs, pixel ratio, orientation, and browser preferences.
- [ ] **Chmod Calculator**: Visual Unix file permission calculator (e.g., `rwx` to `777`).
- [ ] **Docker Run to Docker Compose**: Convert `docker run` shell commands into `docker-compose.yml` configurations.
- [ ] **MIME Types Reference**: Searchable directory of file extensions and their MIME types.
- [ ] **User-Agent Parser**: Parse and display device, OS, and browser info from a User-Agent string.
- [ ] **Keycode Info**: Press any key to see its Javascript event values (`keyCode`, `code`, `key`).
- [ ] **Git & Regex Cheatsheets**: Quick reference guides for standard Git commands and Regex syntax.
- [ ] **Open Graph Meta Generator**: Generate and preview SEO/Open Graph HTML meta tags for websites.

### 7. Security
- [ ] **HMAC Generator**: Compute HMAC signatures (SHA-256/512) with a custom secret key.
- [ ] **Password Strength Evaluator**: Real-time password safety metric and warnings using entropy checks.
- [ ] **Self-Signed Certificate Generator**: Create client-side self-signed X.509 certificates for local HTTPS.
- [ ] **BIP39 Passphrase Generator**: Generate secure crypto wallet recovery phrases (BIP39).
- [ ] **String Obfuscator**: Obfuscate text or email addresses to hide them from simple bots.

### 8. Networking
- [ ] **CORS Request Policy Tester**: Test if a given endpoint supports CORS requests directly from the client.
- [ ] **HTTP Status Codes Cheat Sheet**: Fast reference directory of HTTP status codes and specifications.
- [ ] **MAC Address Vendor Lookup**: Identify NIC manufacturers from MAC address OUI prefixes.
- [ ] **IPv4 Address Converter**: Convert IPs between Decimal, Hex, Octal, and Binary formats.
- [ ] **IPv4 Range Expander**: Expand CIDR notations or IP ranges into a full list of IP addresses.
- [ ] **IPv6 ULA Generator**: Generate Unique Local IPv6 Addresses (ULA).
- [ ] **MAC Address Generator**: Generate random valid MAC addresses.
- [ ] **Random Port Generator**: Generate random unassigned high-numbered network ports.

### 9. Design
- [ ] **CSS Gradient Generator**: Visual multi-stop linear/radial gradient picker producing CSS and Tailwind.
- [ ] **SVG Waves & Shape Generator**: Visual math-based generator for custom header waves and vector blobs.
- [ ] **Tailwind Flexbox & Grid Builder**: Click-to-build visual layout grid generating responsive Tailwind CSS.
- [ ] **SVG Placeholder Generator**: Generate lightweight SVG placeholder images with custom dimensions and text.

### 10. PDF & Image Tools
- [ ] **Client-Side PDF OCR (Image-to-Text)**: Scan and extract editable text from scanned PDFs/images.
- [ ] **PDF Metadata Editor**: View and update standard PDF fields (Author, Title, Subject).
- [ ] **Meme Generator**: Overlay text on top/bottom of uploaded images and export to PNG.
- [ ] **Advanced Conversions**: PDF to PowerPoint, PDF to Excel, PDF to PDF/A.
- [ ] **Security & Compliance**: Unlock PDF (remove password), Protect PDF (encrypt), Sign PDF, Redact PDF.
- [ ] **Document Manipulation**: Crop PDF margins, add Page Numbers, Compare PDFs side-by-side.
- [ ] **AI & Processing**: Repair corrupted PDFs, PDF Forms creator/filler, Scan to PDF, Translate PDF.

### 11. Calculators
- [ ] **Loan & Mortgage Calculator**: Compute loan payment tables and view complete amortization schedules.
- [ ] **Compound Interest Calculator**: Project investment growth with monthly contributions and interest graphs.
- [ ] **Math Evaluator**: Parse and evaluate complex mathematical expressions.
- [ ] **ETA Calculator**: Calculate estimated time of arrival based on distance and speed.
- [ ] **Chronometer / Benchmark Builder**: Stopwatches, timers, and JS performance benchmark runners.

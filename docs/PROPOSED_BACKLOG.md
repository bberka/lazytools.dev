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

#### JSON to TypeScript Interface Generator (Status: Implemented)
- **Description**: Convert JSON payloads into typed TypeScript interfaces.
- **Key Features**: Handles nested arrays/objects, generates clean exports, toggles optional properties.
- **Implementation**: Client-side recursive interface generator or standard typescript typings package.

#### JSON/CSV to TOML (Status: Implemented)
- **Description**: Bidirectional conversion between JSON, CSV, and TOML formats.
- **Key Features**: Prettification, indentation spacing settings.
- **Implementation**: Dynamic imports of `@iarna/toml` or a lightweight YAML/TOML package.

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

---

### 3. Generators

#### Mock/Dummy Data Generator
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

---

### 10. PDF & Image Tools

#### Client-Side PDF OCR (Image-to-Text)
- **Description**: Scan and extract editable text from scanned PDFs/images using `tesseract.js` in WASM.
- **Key Features**: Drag-and-drop file inputs, language selection, loader indicators.
- **Implementation**: Dynamically imported `tesseract.js`.

#### PDF Metadata Editor
- **Description**: View and update standard PDF fields (Author, Title, Subject) via `pdf-lib`.
- **Key Features**: Edit forms, download updated documents.
- **Implementation**: Direct edits using `pdf-lib`.

#### Meme Generator
- **Description**: Overlay text on top/bottom of uploaded images and export to PNG.
- **Key Features**: Customize fonts, outlines, sizes, drag positions.
- **Implementation**: HTML Canvas pipeline.

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

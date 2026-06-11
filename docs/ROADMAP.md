# Roadmap

Live at [lazytools.dev](https://lazytools.dev/). 76 tools across 12 categories.

## Immediate / Quality of Life

- [x] Add route coverage tests (every `TOOLS` entry renders)
- [ ] Add focused tests for pure transform helpers
- [x] Add Playwright smoke tests for search, favorites, command palette, and a tool page
- [ ] Add generated Open Graph images

## Tool Expansion Backlog

### 1. Converters
- [x] **cURL Command to Fetch/Axios**: Convert raw cURL commands into JavaScript, Python, Go, or Rust snippets.
- [x] **JSON to TypeScript Interface**: Convert JSON payloads into typed TypeScript interfaces.
- [x] **JSON/CSV to TOML**: Bidirectional conversion between JSON, CSV, and TOML formats (integrated inside the existing JSON / YAML / XML / CSV / TOML Converter).

### 2. Encoders & Decoders
- [ ] **Hex to String / String to Hex**: Convert text to hex representations and vice-versa.
- [ ] **Punycode Encoder/Decoder**: Translate internationalized domain names (IDN) to/from Punycode.
- [ ] **Morse Code / Binary Encoder**: Encode text to binary or Morse code (with optional audio playback).

### 3. Generators
- [ ] **Mock/Dummy Data Generator**: Generate mock user lists, addresses, and schemas to export as CSV/JSON.
- [ ] **SSH Key Generator**: Generate client-side SSH public and private key pairs (RSA, ECDSA) via WebCrypto.
- [ ] **Barcode Generator**: Generate linear 1D barcodes (Code 128, EAN, UPC) in SVG/PNG format.
- [ ] **TOTP (2FA) Code Generator**: Generate and display 6-digit 2FA authenticator codes from secret keys.

### 4. Formatters & Validators
- [ ] **CSS Minifier & Formatter**: Beautify or compress stylesheet blocks.
- [ ] **HTML Minifier & Formatter**: Format or minify markup and strip comments.
- [ ] **JSON Schema Validator**: Validate JSON data instances against a provided JSON Schema.

### 5. Text Tools
- [ ] **Text Sorter & Deduplicator**: Sort lists alphabetically, by length, and remove duplicate entries.
- [ ] **Zero-Width & Unicode Inspector**: Inspect string characters to highlight hidden or zero-width symbols.
- [ ] **Markdown Table Generator**: A visual grid builder to design and export Markdown tables.

### 6. Utilities
- [ ] **JWT Creator/Signer**: Generate mock JSON Web Tokens (HMAC) for testing authorization flows.
- [ ] **Base64 Image Decoder**: View and download images from their raw base64 data URLs.
- [ ] **Screen & Viewport Inspector**: Display live viewport specs, pixel ratio, orientation, and browser preferences.

### 7. Security
- [ ] **HMAC Generator**: Compute HMAC signatures (SHA-256/512) with a custom secret key.
- [ ] **Password Strength Evaluator**: Real-time password safety metric and warnings using entropy checks.
- [ ] **Self-Signed Certificate Generator**: Create client-side self-signed X.509 certificates for local HTTPS.

### 8. Networking
- [ ] **CORS Request Policy Tester**: Test if a given endpoint supports CORS requests directly from the client.
- [ ] **HTTP Status Codes Cheat Sheet**: Fast reference directory of HTTP status codes and specifications.
- [ ] **MAC Address Vendor Lookup**: Identify NIC manufacturers from MAC address OUI prefixes.

### 9. Design
- [ ] **CSS Gradient Generator**: Visual multi-stop linear/radial gradient picker producing CSS and Tailwind.
- [ ] **SVG Waves & Shape Generator**: Visual math-based generator for custom header waves and vector blobs.
- [ ] **Tailwind Flexbox & Grid Builder**: Click-to-build visual layout grid generating responsive Tailwind CSS.

### 10. PDF & Image Tools
- [ ] **Client-Side PDF OCR (Image-to-Text)**: Scan and extract editable text from scanned PDFs/images using `tesseract.js` in WASM.
- [ ] **PDF Metadata Editor**: View and update standard PDF fields (Author, Title, Subject) via `pdf-lib`.
- [ ] **Meme Generator**: Overlay text on top/bottom of uploaded images and export to PNG.

### 11. Calculators
- [ ] **Loan & Mortgage Calculator**: Compute loan payment tables and view complete amortization schedules.
- [ ] **Compound Interest Calculator**: Project investment growth with monthly contributions and interest graphs.


# OCR Architecture: PaddleOCR to Selectable Text (Rust + Python + React)

## 1. Purpose and Scope

This document describes the complete OCR subsystem in SnapLLM, from PaddleOCR inference execution to interactive/selectable text rendered over the source image.

The architecture is polyglot and layered:

- Python sidecar (`sidecars/paddle-ocr`) performs OCR inference via PaddleOCR.
- Rust/Tauri backend (`app/src`) orchestrates sidecar lifecycle, IPC, cancellation, timeout, and model path injection.
- React/TypeScript frontend (`ui/src`) requests OCR, persists OCR data, and renders a text-selection overlay using SVG.
- `xtask` (`xtask/src`) builds and packages sidecars for production and development.

This document intentionally focuses on technical implementation details: protocols, payload schemas, process behavior, model lifecycle, storage schema, and UI text-layer mechanics.

### 1.1 Current stack snapshot (2026-03-01)

- OCR runtime stack:
  - `paddlepaddle==3.3.0`
  - `paddleocr==3.4.0`
  - `paddlex==3.4.2`
  - `pyinstaller==6.19.0`
- Bundled default model ids:
  - `PP-OCRv5_server_det`
  - `en_PP-OCRv5_mobile_rec`
  - `PP-LCNet_x1_0_textline_ori`
- App default OCR language/model id:
  - `pp-ocr-v5-en`
- Release OCR sidecar targets:
  - Linux x64
  - Windows x64
  - macOS ARM64

---

## 2. Component Topology

### 2.1 High-level runtime flow

1. User opens/creates a chat with an image.
2. React component `ImageArtifact` requests OCR via Tauri `invoke("ocr_image")`.
3. Rust command `ocr_image` spawns the packaged OCR sidecar executable, writes a length-prefixed JSON payload to stdin, and keeps stdin open for cancellation.
4. Python sidecar reads payload, runs PaddleOCR, emits JSON to stdout.
5. Rust parses OCR JSON and returns normalized `OcrBox[]` to UI.
6. UI maps OCR boxes to `OcrFrame` (`bbox` format), persists per chat/model, and renders an SVG text layer.
7. User selects text directly from the SVG text nodes; menu actions support copy/search/translate/select-all.

### 2.2 Core source map (primary files)

#### Build and packaging
- `xtask/src/commands/build.rs`
- `xtask/src/commands/pkg.rs`
- `xtask/src/lib.rs`
- `app/tauri.conf.json`
- `sidecars/paddle-ocr/ocr-engine.spec`
- `sidecars/paddle-ocr/download_models.py`
- `sidecars/paddle-ocr/patches/*`

#### Backend orchestration (Rust/Tauri)
- `app/src/lib.rs`
- `app/src/commands/ocr.rs`
- `app/src/commands/models.rs`
- `app/src/services/models.rs`
- `app/src/services/network.rs`
- `app/src/state.rs`
- `app/src/commands/chat.rs`
- `crates/ops-chat-storage/src/types.rs`
- `crates/ops-chat-storage/src/storage.rs`

#### Inference sidecar (Python/PaddleOCR)
- `sidecars/paddle-ocr/src/main.py`
- `sidecars/paddle-ocr/src/engine.py`
- `sidecars/paddle-ocr/src/config.py`
- `sidecars/paddle-ocr/src/models.py`
- `sidecars/paddle-ocr/src/__init__.py`

#### Frontend OCR flow (React/TypeScript)
- `ui/src/features/chat/components/ImageArtifact/ImageArtifact.tsx`
- `ui/src/features/ocr/components/OCRTextCanvas.tsx`
- `ui/src/features/ocr/hooks/useTextSelection.ts`
- `ui/src/features/chat/components/ImageArtifact/ImageTextMenu.tsx`
- `ui/src/features/ocr/ocr-models.store.ts`
- `ui/src/features/ocr/ocr-models.types.ts`
- `ui/src/features/ocr/services/modelDownloader.ts`
- `ui/src/features/ocr/services/modelRegistry.ts`
- `ui/src/hooks/app/useApp.ts`
- `ui/src/hooks/app/useAppOcr.ts`
- `ui/src/lib/storage/chat.ts`

---

## 3. Build and Shipping Architecture

## 3.1 Sidecar dependency baseline

`sidecars/paddle-ocr/requirements.txt` pins runtime dependencies:

- `paddlepaddle==3.3.0`
- `paddleocr==3.4.0`
- `paddlex==3.4.2`
- `requests`
- `pyinstaller==6.19.0`

These packages are installed into a local venv during sidecar build.

## 3.2 Sidecar build pipeline (`cargo xtask build` -> OCR stage)

`xtask/src/commands/build.rs` (`ocr()`):

1. Creates virtual environment (`python3`/`python`/`py -3`) if missing.
2. Installs dependencies from `requirements.txt`.
3. Applies packaging compatibility patches:
   - `patches/paddle_core.py`
4. Downloads baseline OCR models via `download_models.py`.
6. Runs `pyinstaller --clean ocr-engine.spec`.
7. Packages resulting binary into Tauri binaries via `pkg::ocr()`.

Model bootstrap behavior in `download_models.py`:

- Downloads tar archives from PaddleX official inference bucket into `sidecars/paddle-ocr/models/`.
- Extracts archives locally and normalizes extracted folder names to canonical names above.
- Supports PP3 layouts that use `inference.json` (instead of only `inference.pdmodel`).
- Removes temporary archives after successful extraction.

## 3.3 PyInstaller artifact and frozen runtime behavior

`sidecars/paddle-ocr/ocr-engine.spec` includes:

- `paddle/libs`
- `paddleocr`
- `paddlex`
- `models`
- `src`
- required package metadata (`*.dist-info`) for Paddle/PaddleOCR/PaddleX and OCR-core deps

Patches ensure frozen execution works reliably:

- `patches/paddle_core.py` injects `_MEIPASS`-aware Paddle lib loading.

Result: OCR sidecar is shipped as a single executable artifact (`dist/ocr-engine(.exe)`), with packaged resources loaded in frozen mode.

## 3.4 Host-triple packaging and Tauri bundling

`xtask/src/commands/pkg.rs` copies `dist/ocr-engine(.exe)` into:

- `app/binaries/ocr-engine-<host-triple>(.exe)`
- `target/debug/binaries/ocr-engine-<host-triple>(.exe)` for dev convenience

`app/tauri.conf.json` declares:

- `bundle.externalBin = ["binaries/ocr-engine", ...]`

At runtime, Rust resolves from Tauri resource directory:

- `app/src/commands/ocr.rs` -> `resource_dir()/binaries/<resolved-sidecar-name>`

Windows runtime name in command code is `ocr-engine.exe`; Linux is `ocr-engine-x86_64-unknown-linux-gnu`; macOS is `ocr-engine`.

Current release target policy for OCR sidecar artifacts is:
- Linux x64
- Windows x64
- macOS ARM64

---

## 4. Runtime OCR Execution Path (Depth-First)

## 4.1 UI trigger and scan orchestration

`ui/src/features/chat/components/ImageArtifact/ImageArtifact.tsx` is the OCR execution entry on frontend.

Key responsibilities:

- Selects active OCR model from `currentOcrModel`.
- Prevents duplicate scans:
  - local request versioning (`scanRequestRef`)
  - global lock per `imageId+model` (`globalScanLock`)
- Cancels stale/in-flight jobs when image changes or user cancels.
- Calls:
  - `invoke<OCRBox[]>("ocr_image", { imageData, isBase64: false, modelName })`
- Converts backend payload:
  - from `box_coords` to internal `box`
  - then to persisted `bbox` through `useAppOcr`
- Supports auto-run gate:
  - disabled when OCR global toggle is off
  - disabled when per-chat sentinel key indicates auto-OCR opt-out

Auto-run is effectively: "scan once per image/model if not already cached and not explicitly disabled."

## 4.2 Rust Tauri command layer (`ocr_image`)

`app/src/commands/ocr.rs`:

- Serializes request into:
  - `type`: `"path"` or `"base64"`
  - `data`: image path/base64 content
  - optional `config` with model overrides
- Uses process-spawn controls:
  - `stdin/stdout/stderr` piped
  - thread-limiting env vars set in parent process
  - Windows no-window creation flag
  - Unix lowered CPU priority (`nice(10)`)
  - Linux IO priority (`ioprio_set`)
- Writes IPC payload in two steps:
  1. `<payload-byte-length>\n`
  2. raw JSON payload bytes
- Keeps stdin open to allow async cancellation signal (`CANCEL\n`).

Concurrency and lifecycle controls:

- `OCR_LOCK` (`LazyLock<Mutex<()>>`) guarantees one OCR job globally at a time.
- `AppState.ocr_job` stores active sidecar handle.
- Existing lingering job is canceled before new job starts (defensive cleanup).
- Polls process completion using `try_wait()` loop.
- Timeout enforced at 120 seconds; on timeout, sends cancel then kills.

Error handling semantics:

- sidecar exit code `2` -> treated as canceled OCR job
- non-zero exit -> stderr wrapped into command error
- stdout parsed as either:
  - `{"error":"..."}` or
  - `Vec<RawOcrResult>`

Normalization from sidecar schema:

- sidecar field `box` -> Rust `box_coords`
- missing confidence defaults to `1.0`

## 4.3 Python IPC endpoint (`main.py`)

`sidecars/paddle-ocr/src/main.py` supports:

- CLI mode: positional path argument
- IPC mode: stdin JSON

IPC protocol details:

- Preferred protocol: length-prefixed payload
  - first line: decimal byte length
  - next `N` bytes: JSON payload
- Backward compatibility:
  - fallback to non-length-prefixed JSON when first line is not an int
- After reading payload:
  - starts daemon cancel listener on stdin
  - if line `CANCEL` received -> immediate `os._exit(2)`
  - this ensures termination works even while C extensions are running

Request schema:

```json
{
  "type": "path | base64",
  "data": "<image-path-or-base64>",
  "config": {
    "lang": "en",
    "use_angle_cls": true,
    "det_model_dir": "/path/to/det",
    "rec_model_dir": "/path/to/rec",
    "cls_model_dir": "/path/to/cls"
  }
}
```

Response schema:

```json
[
  {
    "text": "detected text",
    "box": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]],
    "confidence": 0.98
  }
]
```

Or error:

```json
{ "error": "..." }
```

## 4.4 PaddleOCR execution engine (`engine.py`)

`sidecars/paddle-ocr/src/engine.py`:

- Initializes environment:
  - `DISABLE_MODEL_SOURCE_CHECK=True`
  - `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True`
  - `PADDLEOCR_BASE_PATH=<model-dir>`
  - `cv2.setNumThreads(1)`
  - suppresses `ppocr` logs
- Lazily creates `PaddleOCR(...)` with PP3-native model name+dir arguments:
  - `text_detection_model_name/text_detection_model_dir`
  - `text_recognition_model_name/text_recognition_model_dir`
  - `textline_orientation_model_name/textline_orientation_model_dir`
  - `enable_mkldnn=False` (Windows/CPU stability)
- Preprocess step:
  - reads image via OpenCV
  - if max dimension > `MAX_DET_SIDE` (2048), resizes image for detection
  - stores temporary resized file
- Inference:
  - PP3 path: `ocr.ocr(det_path)`
  - legacy fallback: `ocr.ocr(det_path, cls=...)`
- Postprocess:
  - normalizes PP3 and legacy result shapes
  - extracts quadrilateral points, text, confidence
  - remaps coordinates to original scale when resized
  - emits `OCRResult` list

Output serialization uses `models.py` dataclasses (`OCRResult`, `BoundingBox`) and `NumpyEncoder`.

---

## 5. Model Architecture and Lifecycle

## 5.1 Bundled baseline models (offline default path)

Bundled at build-time from `download_models.py`:

- Detection model: `PP-OCRv5_server_det`
- Recognition model: `en_PP-OCRv5_mobile_rec`
- Textline orientation model: `PP-LCNet_x1_0_textline_ori`

Default model paths in `sidecars/paddle-ocr/src/config.py`:

- `models/PP-OCRv5_server_det`
- `models/en_PP-OCRv5_mobile_rec`
- `models/PP-LCNet_x1_0_textline_ori`

These are available with zero runtime network dependency.

## 5.2 Runtime downloadable recognition models

Additional language models are managed by:

- UI definitions: `ui/src/features/ocr/ocr-models.types.ts`
- download invocation: `ui/src/features/ocr/services/modelDownloader.ts`
- backend manager: `app/src/services/models.rs`

`ModelManager` behavior:

- stores models under config directory:
  - `<config>/snapllm/Local Storage/models/<model-id>/`
- supports resumable downloads using `Range` header
- emits `download-progress` events (`checking/downloading/paused/extracting`)
- handles cancellation by token map per `model_id`
- validates installed model by checking:
  - `inference.pdmodel` or `inference.json`
  - `inference.pdiparams`
- extraction flattens model archives into target model directory and keeps auxiliary files (`inference.yml`, etc.) that PP3 runtime may require.

Network awareness:

- `PeerNetworkMonitor` attempts TCP connect to `8.8.8.8:53`
- offline state pauses download loop

## 5.3 How selected model flows into inference

When UI passes `modelName` to `ocr_image`:

- Rust checks whether model directory exists in `ModelManager`.
- If installed:
  - derives `lang` from model id suffix (`split('-').last()`)
  - injects `rec_model_dir` override into sidecar config
  - detection/classifier remain default unless overridden

Important architecture detail:

- Only recognition model is typically replaced at runtime.
- Detection and angle classifier remain stable defaults from bundled models.

---

## 6. Persistence and Chat Coupling

## 6.1 OCR frame schema and semantics

Rust storage schema (`crates/ops-chat-storage/src/types.rs`):

- `OcrFrame = HashMap<String, Option<Vec<OcrRegion>>>`
- key = `model_id`
- value semantics:
  - `None`: not scanned yet
  - `Some(vec)`: scan completed (possibly empty vec)

`OcrRegion` in storage:

- `text: String`
- `bbox: Vec<Vec<i32>>`

Frontend mirror (`ui/src/lib/storage/chat.ts`) uses:

- `OcrFrame = Record<string, OcrRegion[] | null>`

## 6.2 OCR persistence operations

Storage commands (`app/src/commands/chat.rs`) delegate to `ops-chat-storage`:

- `save_ocr_data(chat_id, model_id, ocr_data)`
- `get_ocr_data(chat_id, model_id)`
- `get_ocr_frame(chat_id)`
- `init_ocr_frame(chat_id, model_ids)`

File-level storage:

- each chat directory stores `ocr_frame.json`
- merges per model key on each save (`read-modify-write`)

Legacy migration path:

- old `ocr.json` flat format is migrated into frame format keyed by `pp-ocr-v5-en`.

## 6.3 Session model and metadata linkage

`ui/src/hooks/app/useApp.ts`:

- auto-persists current session OCR model into chat metadata field `ocr_lang`
- when loading a chat:
  - if metadata model has cached frame data, selects it
  - else uses first scanned model in frame

This makes OCR model selection sticky per chat session.

## 6.4 Auto-run opt-out sentinel

Frontend introduces:

- `AUTO_OCR_DISABLED_MODEL_ID = "__meta_auto_ocr_disabled__"`

This sentinel key is written to OCR frame to suppress automatic OCR reruns for that chat, while still allowing manual OCR scans.

---

## 7. SVG Text Layer and Selectable Overlay (Lens-like Local UX)

## 7.1 Rendering model

`ui/src/features/ocr/components/OCRTextCanvas.tsx` renders:

- one `<polygon>` per OCR box (highlight/background)
- one transparent `<text>` node per OCR result
- each text node:
  - anchored to OCR quad geometry
  - `textLength` approximates box width
  - `lengthAdjust="spacingAndGlyphs"`
  - `id="text-<index>"`
  - `data-selectable-text` marker

`OCRTextCanvas.module.css`:

- entire layer is absolute-positioned over image
- layer default `pointer-events: none`
- text nodes override with `pointer-events: auto` + `user-select: text`

This creates a fully local "select text from image" UX that mimics key interaction properties of Lens-style OCR overlays, but without cloud OCR dependency.

## 7.2 Selection engine

`ui/src/features/ocr/hooks/useTextSelection.ts` implements custom selection mechanics:

- maps mouse position to nearest OCR text line
- projects pointer onto top edge vector of OCR quad
- converts projection ratio into character index
- supports multi-click modes:
  - char
  - word
  - line
- applies native browser selection via:
  - `selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)`

Selection completion callback triggers OCR context menu.

## 7.3 OCR context menu and actions

`ui/src/features/chat/components/ImageArtifact/ImageTextMenu.tsx`:

- positions menu relative to selected text rect
- supports:
  - copy selected text
  - search externally
  - translate externally
  - select-all over OCR SVG layer
- uses `open_external_url` command for browser navigation actions

This menu layer is decoupled from OCR inference; it consumes only current `displayData`.

---

## 8. IPC and Data Contracts (Cross-language)

## 8.1 Request contract (TS -> Rust -> Python)

Frontend invoke:

- `invoke("ocr_image", { imageData, isBase64, modelName })`

Rust internal request:

- `OcrRequest { type, data, config? }`

Python expected payload:

- same JSON keys (`type`, `data`, `config`)

Length-prefixed framing:

1. decimal payload length + newline
2. exact number of payload bytes

## 8.2 Response contract (Python -> Rust -> TS)

Python returns JSON array:

- `[{ text, box, confidence }]`

Rust maps:

- `box` -> `box_coords: Vec<Vec<f64>>`
- `confidence` (optional in legacy payloads) -> `confidence: f64` with fallback `1.0`

Frontend maps:

- `box_coords` -> `box` -> persisted `bbox`

## 8.3 Type drift and precision notes

Runtime OCR uses floating coordinates (`f64` in Rust command layer), while persisted `OcrRegion` uses `i32` in `ops-chat-storage`. This implies quantization when writing OCR data to chat storage.

---

## 9. Cancellation, Timeout, and Concurrency Model

## 9.1 Concurrency controls

- Global backend mutex: only one OCR process active app-wide.
- UI scan dedup:
  - lock per image+model key
  - request-version guards to drop stale responses.

## 9.2 Cancellation path

User cancel -> frontend `cancelOcrJob()` -> Rust `cancel_ocr_job`:

1. take active job handle from `AppState`.
2. write `CANCEL\n` to sidecar stdin.
3. wait up to 500 ms for graceful exit.
4. force-kill if not exited.

Python side:

- cancel listener receives `CANCEL`
- immediate `os._exit(2)`

Rust maps exit code `2` to user-visible cancellation.

## 9.3 Timeout path

- Rust enforces 120s OCR hard timeout.
- On timeout:
  - logs timeout event
  - invokes same cancel/kill path
  - returns stability-protection error message

---

## 10. Performance and Resource Controls

Controls are applied in multiple layers (defense in depth):

### Python process level
- `OMP_NUM_THREADS=1`
- `OPENBLAS_NUM_THREADS=1`
- `MKL_NUM_THREADS=1`
- `NUMEXPR_NUM_THREADS=1`
- `OMP_WAIT_POLICY=PASSIVE`

### Rust spawn level
- sets same env vars on sidecar command.
- lowers priority (`nice(10)` on Unix).
- sets Linux IO priority to best-effort low priority class.

### Engine preprocessing
- image downscale when max side > 2048 to bound detection cost.
- remaps coordinates back to original space.

### UI/interaction
- avoids redundant OCR calls via caching and dedup logic.

---

## 11. "Offline Lens Mimic" Behavior

The OCR UX is designed to emulate practical "Lens-like" affordances while remaining local-first:

- Local OCR extraction from on-device sidecar.
- Visual dim + highlighted text regions.
- Direct text selection over image geometry.
- Contextual actions (copy/search/translate).
- Per-chat cached OCR frame, model-switch scanning, and quick re-open behavior.

The external network is optional for action links (search/translate) and runtime model downloads; core OCR itself can run fully offline with bundled models.

---

## 12. Known Technical Observations (Current Implementation)

1. `confidence` is emitted by sidecar JSON and mapped in Rust with fallback default `1.0` for missing legacy payloads.
2. Runtime model language derivation in Rust uses model-id suffix split; this can diverge from Paddle language token naming expectations in edge cases.
3. Persisted OCR bbox type is integer (`i32`) while runtime transport is float (`f64`), so stored geometry may be rounded.
4. OCR engine sets `enable_mkldnn=False` for PP3 stability on Windows CPU runtime.
5. PP3 result payloads can include numpy arrays (`rec_polys`), so parser normalization must accept list/tuple and ndarray-like objects.

These are implementation-level details to consider when extending OCR ranking, confidence thresholding, geometry fidelity, or multilingual selection heuristics.

---

## 13. End-to-End Sequence (Concrete)

1. `Chat` passes `sessionOcrLanguage` into `ImageArtifact`.
2. `ImageArtifact.scan()` calls `invoke("ocr_image", ...)`.
3. Rust `ocr_image`:
   - validates sidecar path
   - maps optional model to `OcrModelConfig`
   - spawns sidecar
   - writes length-prefixed JSON
   - stores job handle for cancellation
   - waits with timeout
4. Python `main.py`:
   - reads framed request
   - starts cancel-listener thread
   - dispatches path/base64 flow
5. Python `engine.py`:
   - preprocess/downscale
   - run PaddleOCR
   - rescale boxes
   - return structured list
6. Rust parses stdout JSON -> returns `Vec<OcrBox>`.
7. UI converts to `bbox`, updates `OcrFrame`, persists via `save_ocr_data`.
8. `OCRTextCanvas` renders selectable transparent text nodes over image.
9. `useTextSelection` maps pointer interactions to native selection ranges.
10. `ImageTextMenu` provides local OCR actions.

---

## 14. File-by-File Responsibility Summary

### Python (OCR sidecar)
- `sidecars/paddle-ocr/src/main.py`: stdin IPC framing, request dispatch, cancellation listener.
- `sidecars/paddle-ocr/src/engine.py`: PaddleOCR init, preprocess/downscale, inference, postprocess.
- `sidecars/paddle-ocr/src/config.py`: frozen/runtime model path resolution.
- `sidecars/paddle-ocr/src/models.py`: OCR output models and JSON serialization.
- `sidecars/paddle-ocr/ocr-engine.spec`: bundled resources and hidden imports.
- `sidecars/paddle-ocr/patches/*`: PyInstaller compatibility patches.

### Rust/Tauri
- `app/src/commands/ocr.rs`: sidecar process orchestration and IPC bridge.
- `app/src/state.rs`: active OCR process handle storage.
- `app/src/commands/models.rs`: model download/list/path commands.
- `app/src/services/models.rs`: resumable model downloads and extraction.
- `app/src/services/network.rs`: connectivity monitor for paused/resumed downloads.
- `app/src/commands/chat.rs`: OCR frame persistence commands.
- `crates/ops-chat-storage/src/storage.rs`: on-disk chat/ocr frame storage logic.
- `app/src/lib.rs`: command registration and service initialization.

### React/TypeScript
- `ui/src/features/chat/components/ImageArtifact/ImageArtifact.tsx`: scan orchestration, auto-run, cancel, model switch behavior.
- `ui/src/features/ocr/components/OCRTextCanvas.tsx`: SVG OCR overlay rendering.
- `ui/src/features/ocr/hooks/useTextSelection.ts`: geometric selection and native range synthesis.
- `ui/src/features/chat/components/ImageArtifact/ImageTextMenu.tsx`: OCR inline action menu.
- `ui/src/features/ocr/ocr-models.store.ts`: downloadable model state and progress event binding.
- `ui/src/hooks/app/useApp.ts`: chat-level OCR model persistence and restore behavior.
- `ui/src/hooks/app/useAppOcr.ts`: OCR frame state update and storage persistence.
- `ui/src/lib/storage/chat.ts`: typed OCR storage command wrappers.

---

## 15. Model ID Migration Contract (v4 -> v5)

Legacy ids are auto-migrated to v5 ids in frontend and backend paths.

- `pp-ocr-v4-en` -> `pp-ocr-v5-en`
- `pp-ocr-v4-ru` -> `pp-ocr-v5-cyrillic`
- `pp-ocr-v4-ko` -> `pp-ocr-v5-korean`
- `pp-ocr-v4-ja` -> `pp-ocr-v5-cjk`
- `pp-ocr-v4-zh` -> `pp-ocr-v5-cjk`
- `pp-ocr-v4-es` -> `pp-ocr-v5-latin`
- `pp-ocr-v4-it` -> `pp-ocr-v5-latin`
- `pp-ocr-v4-pt` -> `pp-ocr-v5-latin`
- `pp-ocr-v4-hi` -> `pp-ocr-v5-devanagari`

Migration is idempotent and applied in:

- frontend preference load path (`ocrLanguage`)
- chat metadata (`ocr_lang`)
- OCR frame model keys
- model directory resolution (legacy directory aliases for v5 ids)

---

## 16. Ubuntu Bring-up and Validation (Fresh Session)

### 16.1 Preflight

Required baseline:

- Rust toolchain + `cargo`
- Node.js + npm
- Python 3.12 or 3.13 available as `python3` (release path is pinned to 3.13 in CI)
- build tools needed by your distro for Rust/Tauri work

Quick checks:

```bash
rustc --version
cargo --version
node --version
npm --version
python3 --version
```

### 16.2 OCR sidecar build smoke

```bash
cargo xtask build ocr
```

Expected:

- venv created under `sidecars/paddle-ocr/venv`
- dependencies installed (PP3 stack)
- models downloaded under `sidecars/paddle-ocr/models`
- executable produced at `sidecars/paddle-ocr/dist/ocr-engine`
- packaged copies:
  - `app/binaries/ocr-engine-x86_64-unknown-linux-gnu`
  - `target/debug/binaries/ocr-engine-x86_64-unknown-linux-gnu`

### 16.3 Sidecar runtime smoke (CLI)

```bash
sidecars/paddle-ocr/dist/ocr-engine /absolute/path/to/image.png
```

Expected JSON array:

```json
[{"text":"...","box":[[...]],"confidence":0.99}]
```

### 16.4 Sidecar runtime smoke (length-prefixed IPC)

```bash
PAYLOAD='{"type":"path","data":"/absolute/path/to/image.png"}'
{ printf "%s\n" "${#PAYLOAD}"; printf "%s" "$PAYLOAD"; } | sidecars/paddle-ocr/dist/ocr-engine
```

Expected: same JSON contract as CLI.

### 16.5 App-layer checks

```bash
cargo check -p xtask
cargo check -p ops-chat-storage
npm --prefix ui run build
```

If app crate check fails due missing sidecars, build/package sidecars first (`ocr`, `whisper`, `capture`) or provide required binaries in `app/binaries/`.

---

## 17. Known Warnings and Troubleshooting

### 17.1 Common non-fatal warnings

- `RequestsDependencyWarning` from bundled `requests`/`urllib3` version mismatch.
- Paddle/PaddleX host connectivity checks in logs.
- PyInstaller warning for missing `paddlex.inference.serving` plugin.

These can appear while build/runtime still succeeds.

### 17.2 Typical failure classes

1. `paddlepaddle==2.6.2` install failure on Windows:
   - expected with modern Python; fixed by PP3 migration.
2. Model dir mismatch assertion in PP3:
   - ensure explicit model names match model directory names.
3. Runtime crash in detection path with oneDNN on Windows:
   - mitigated by `enable_mkldnn=False` in `engine.py`.
4. Sidecar found but app build fails:
   - usually another required sidecar binary (e.g., whisper) missing in `app/binaries`.

### 17.3 Model file compatibility

Both `inference.pdmodel` and `inference.json` are accepted model graph formats.
Validation still requires `inference.pdiparams`.

---

## 18. Maintainer Rules for OCR Stack Changes

When upgrading Paddle/PaddleOCR/PaddleX again:

1. Keep OCR JSON contract stable: `text`, `box`, `confidence`.
2. Re-run build smoke on Windows and Ubuntu at minimum.
3. Re-run CLI + length-prefixed IPC smoke.
4. Verify PyInstaller frozen runtime, not just venv runtime.
5. Keep `OCR.md` and model-id migration mapping updated in same PR.

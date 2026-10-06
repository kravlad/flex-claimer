# In-browser LLM runtimes for Android Chrome and iOS Safari

Research for issue #2 (child of map #1). Researched 2026-10-06.
Scope: which runtimes can run a local LLM offline inside a static PWA (GitHub Pages, no backend) on **Android Chrome** and **iOS Safari, including the installed home-screen web app**. Covers WebGPU/WASM requirements, memory ceilings, model formats, weight caching, storage quota and eviction, and Svelte/Vite integration.

Sources are primary where they exist: official docs, repo READMEs and source, W3C spec, WebKit/Chrome blogs, MDN browser-compat-data (BCD 8.1.4). Anything without a primary source is marked **(unverified)**.

## Summary

- **WebGPU is now available on both target platforms.** Chrome for Android since 121, on Android 12+ with Qualcomm or ARM GPUs ([Chrome 121](https://developer.chrome.com/blog/new-in-webgpu-121)). Safari since 26.0 on iOS/iPadOS ([WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). Current releases are Safari 27 (2026-09-14) and Chrome 154 (2026-09-22) ([BCD](https://unpkg.com/@mdn/browser-compat-data/data.json)).
- **The binding limit on iPhone is memory, not API support.** A 2026 cross-device study of llama.cpp/WebGPU in the browser reports that "on iOS devices Safari tab memory is limited to <500 MB". On iPhone 17 Pro Max and iPhone 15, only models up to about 0.4 GB of q4 GGUF fit (LFM2.5-350M, Bonsai-1.7B q1, Gemma3-270M, Qwen3-0.6B). A 0.9 GB Granite4-1B did not fit ([Levine et al., arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)). A WebLLM user on iOS 26 reports that a 135M model works but Qwen2.5-3B q4f16 kills the tab once loading finishes ([web-llm#753](https://github.com/mlc-ai/web-llm/issues/753)). Plan for a model of **about 0.5B parameters or less, around 400 MB, on iOS**.
- **Of the four runtimes, only wllama and transformers.js have a CPU/WASM fallback.** WebLLM throws `WebGPUNotAvailableError` without WebGPU ([engine.ts](https://github.com/mlc-ai/web-llm/blob/main/src/engine.ts)). MediaPipe LLM Inference "requires a web browser with WebGPU compatibility" ([MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js)).
- **MediaPipe LLM Inference is in maintenance-only mode.** Google recommends migrating to the LiteRT-LM JS API (`@litert-lm/core`). That API is an "early preview" that supports only Gemma 4 E2B/E4B web models, and the E2B model is about 2.0 GB ([MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js), [LiteRT-LM JS README](https://github.com/google-ai-edge/LiteRT-LM/tree/main/js/packages/core), [HF file listing](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/main)). Given the iOS memory ceiling above, it is unlikely to run on iPhone **(unverified, inference)**.
- **iOS storage quota is generous, and installed web apps are protected from the 7-day ITP wipe.** Each origin gets up to 60% of disk, and home-screen web apps get the same quota ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). Home-screen web apps are exempt from ITP's 7-day cap on script-writable storage ([WebKit Tracking Prevention](https://webkit.org/tracking-prevention/)). Their storage is isolated from Safari, so a model downloaded in a Safari tab is **not** visible to the installed app, and the reverse is also true (same source).
- **GitHub Pages cannot send COOP/COEP headers**, so WASM multithreading (SharedArrayBuffer) needs the `coi-serviceworker` shim ([coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)). On iOS the shim can use only `require-corp`, because Safari has no `credentialless` ([BCD](https://unpkg.com/@mdn/browser-compat-data/data.json)). Hugging Face sends CORS headers, so this is compatible (verified by request, see below). This matters only for the WASM/CPU paths.

## Comparison table

| | WebLLM (MLC) | transformers.js (ONNX Runtime Web) | wllama (llama.cpp WASM + WebGPU) | MediaPipe LLM Inference, and successor LiteRT-LM JS |
|---|---|---|---|---|
| npm / latest seen | `@mlc-ai/web-llm` 0.2.85 | `@huggingface/transformers` 4.3.1 (onnxruntime-web 1.31.0-dev) | `@wllama/wllama` 3.9.0 | `@mediapipe/tasks-genai` 0.10.29; `@litert-lm/core` 0.18.0 |
| Status | Active | Active | Active (v3: OpenAI-style API, WebGPU since 3.1) | MediaPipe: maintenance-only. LiteRT-LM JS: "early preview" |
| GPU backend | WebGPU (required) | WebGPU (`device: 'webgpu'`) | WebGPU (auto since v3.1, `n_gpu_layers`) | WebGPU (required) |
| CPU fallback | None | WASM (default in browser) | WASM SIMD, single or multi-thread | None documented for MediaPipe; LiteRT-LM fallback **(unverified)** |
| WebGPU features used | `shader-f16` for `q4f16_*` models (only some prebuilt records list it as required) | fp16 dtypes need `shader-f16` **(unverified)** | not documented | not documented |
| Model format | MLC (weight shards + compiled model-lib `.wasm` + `mlc-chat-config.json`) | ONNX (+ `.onnx_data` external data), HF repo layout | GGUF (single file ≤2 GB, or split with `llama-gguf-split`) | `.task` / `.bin` (MediaPipe), `.litertlm` (LiteRT-LM), "-web" variants |
| Built-in weight cache | Cache API (default), IndexedDB, OPFS, cross-origin (Chrome extension) | Cache API (`transformers-cache`), or `customCache` | OPFS (default), via experimental Cross-Origin Storage when present | None built in; app supplies URL, Blob or ReadableStream |
| Safari specifics | Works on Safari 26 for small models; tab crashes on 3B ([#753](https://github.com/mlc-ai/web-llm/issues/753)) | Historical v3 memory growth and crashes on iOS ([#1242](https://github.com/huggingface/transformers.js/issues/1242)) | Needs a "compat" WASM build on Safari (no Memory64; JSPI only since Safari 27); compat assets from jsDelivr unless self-hosted | No iOS guidance in docs |
| Smallest practical chat models | SmolLM2-360M q4f16 (376 MB VRAM), Qwen3-0.6B q4f16 (1403 MB VRAM), Llama-3.2-1B q4f16 (879 MB VRAM) | e.g. Qwen3-0.6B `model_q4f16.onnx` 570 MB | e.g. Qwen3-0.6B Q4_K_M ≈0.40 GB | Gemma3-1B int4-web `.task` 700 MB (gated); Gemma 4 E2B web 2.0 GB |

The "VRAM" figures are WebLLM's own `vram_required_MB` metadata ([config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)). Sizes for other formats are file sizes from the Hugging Face API (see the per-runtime sections).

## 1. Platform capabilities

### 1.1 WebGPU

- **Chrome Android.** Enabled by default since Chrome 121 on "Android 12 and greater" with "Qualcomm and ARM GPUs" ([Chrome 121](https://developer.chrome.com/blog/new-in-webgpu-121), restated Nov 2025 in [web.dev](https://web.dev/blog/webgpu-supported-major-browsers)). Chrome also has a WebGPU "compatibility mode" (`featureLevel: "compatibility"`) for devices on OpenGL ES 3.1. Google notes that "15% of Android users don't have Vulkan 1.1, including 10% who don't have Vulkan at all" ([Chrome 139](https://developer.chrome.com/blog/new-in-webgpu-139), [Chrome 146](https://developer.chrome.com/blog/new-in-webgpu-146)). None of the four runtimes document compatibility-mode support **(unverified)**.
- **iOS Safari.** WebGPU is "now shipping in Safari 26.0 for macOS, iOS, iPadOS, and visionOS" ([WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). BCD lists `GPU` and `shader-f16` as supported from safari_ios 26, and `subgroups` as unsupported on iOS ([BCD](https://unpkg.com/@mdn/browser-compat-data/data.json)). All iOS browsers use WebKit, so Chrome on iOS behaves like Safari here **(unverified for this specific feature)**.
- **Installed home-screen web app on iOS.** It runs on the same WebKit. From iOS 26, "every website added to the Home Screen opens as a web app" by default ([WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). I found no WebKit statement that WebGPU behaves differently in standalone mode **(unverified; needs a device test)**.
- **Buffer limits.** The WebGPU spec defaults are `maxBufferSize` = 256 MiB and `maxStorageBufferBindingSize` = 128 MiB. Higher values must be requested from the adapter ([W3C WebGPU](https://www.w3.org/TR/webgpu/)). In WebKit on iOS (non-Mac), `maxBufferSize = max(256 MiB, min(1 GiB, MTLDevice.maxBufferLength / 3))`, and storage/uniform binding sizes are set to the same value. **A single GPU buffer on iPhone is therefore capped at 1 GiB at most** ([WebKit HardwareCapabilities.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebGPU/WebGPU/HardwareCapabilities.mm)). WebLLM records `buffer_size_required_bytes` per model for this reason ([config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)).

### 1.2 WebAssembly features relevant to the WASM paths

From BCD 8.1.4 ([data.json](https://unpkg.com/@mdn/browser-compat-data/data.json)) and WebKit release notes:

| Feature | Chrome Android | Safari iOS |
|---|---|---|
| Fixed-width SIMD | 91 | 16.4 |
| Threads and atomics / SharedArrayBuffer | 88 / 89 | 15.2 / 15.2 |
| Memory64 | 133 | not supported (Safari: "preview" only) |
| JSPI | 137 | 27 ([WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)) |
| COEP `require-corp` / `credentialless` | 83 / 96 | 15.2 / not supported |

Multithreaded WASM needs `crossOriginIsolated`. ONNX Runtime Web says: "Only when the browser supports WebAssembly multi-threading and `crossOriginIsolated` mode is enabled, multi-threading will be enabled" ([ORT env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)). wllama: "To enable multi-thread, you must add `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers" ([wllama README](https://github.com/ngxson/wllama)).

### 1.3 Memory ceilings in practice

- **iOS Safari.** Apple publishes no per-tab memory limit **(unverified: no primary Apple source found)**. The best evidence is empirical:
  - Levine et al. (2026): "on iOS devices Safari tab memory is limited to <500 MB". On iPhone 17 Pro Max and iPhone 15, the low-tier devices "were only able to fit the four smallest models (lfm, bonsai, gemma3, and qwen3)", with GGUF sizes of 0.23 to 0.40 GB. Decode speed in that cluster was in the single to low double digits of tok/s ([arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)).
  - WebLLM on iOS 26: SmolLM2-135M q0f16 works, and Qwen2.5-3B q4f16 makes Safari show "A problem occurred with this webpage" when loading finishes. The issue was closed as not planned ([web-llm#753](https://github.com/mlc-ai/web-llm/issues/753)).
  - transformers.js v3 had memory growing to over 10 GB on Safari until the tab was killed ([transformers.js#1242](https://github.com/huggingface/transformers.js/issues/1242), [arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)). Whether this is fixed in v4 is **unverified**.
- **Memory overhead differs by runtime.** The same paper measured its llama.cpp WebGPU backend (shipped in wllama) at about 49% less memory than WebLLM and 41% less than transformers.js, geometric mean. Its explanation is that transformers.js "creates temporary copies of models into CPU buffers before sending them to GPU buffers", that WebLLM "loads the entire model into JavaScript memory before sending it to the GPU", and that wllama streams weights from OPFS without materialising them in the WASM heap ([arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)). This is the authors' own comparison (the author maintains the llama.cpp WebGPU backend), so treat it as indicative.
- **Android Chrome.** There is no documented per-tab cap. The limits that apply:
  - Device RAM and the Android low-memory killer **(unverified, no primary source found)**.
  - Chrome `ArrayBuffer` max of about 2 GB (0x7fe00000) and the 4 GB wasm32 memory limit ([ORT large models](https://onnxruntime.ai/docs/tutorials/web/large-models.html)).
  - WebLLM marks models as `low_resource_required` for "limited devices (e.g. Android phone)" ([config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)).
  - Levine et al. put Galaxy S24 (Xclipse) in the "mid" cluster that ran every model in their suite (the suite includes models of 0.9 GB and 1.28 GB and larger), and Adreno 7xx, Mali and PowerVR in the "low" cluster that fit only the four smallest models ([arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)).

### 1.4 Storage quota and eviction

**WebKit (iOS 17+ / Safari 17+)** ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)):

- Origin quota "for a browser app … is up to 60% of the total disk space". Overall quota is up to 80%. Other WebKit apps get 15% / 20%.
- "When a web app is running standalone (as Home Screen Web App on iOS …), it has the same origin quota and overall quota as when it is opened in a browser app."
- The quota covers "localStorage, Cache API, IndexedDB, Service Worker, and File System". Exceeding it throws `QuotaExceededError`. Safari 17 "no longer prompts users".
- Eviction is whole-origin LRU when the overall quota is exceeded, when the system is under storage pressure, or through ITP. Origins with an active page or in persistent mode are excluded.
- `navigator.storage.persist()` is granted by heuristics "like whether the website is opened as a Home Screen Web App". `estimate()` is supported, but the quota "might change based on factors like existing usage and site visit frequency".

**ITP 7-day cap.** Safari deletes "all of a website's script-writable storage after seven days of Safari use without user interaction on the site". This covers IndexedDB, LocalStorage, and Service Worker registrations and cache ([WebKit blog 10218](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). Home-screen web apps are exempt: "The first-party domain of home screen web applications is exempt from ITP's 7-day cap … In addition, the website data of home screen web applications is kept isolated from Safari" ([WebKit Tracking Prevention](https://webkit.org/tracking-prevention/)).

- **Implication:** in a plain Safari tab, a cached model can disappear after 7 days of Safari use without visiting the site. The installed web app does not have this problem. Because storage is isolated, the download UI must run inside the installed app; a model downloaded in the Safari tab before installing is not reused.

**Chromium / Android** ([MDN quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [web.dev persistent storage](https://web.dev/articles/persistent-storage)):

- Per-origin quota is 60% of disk, total 80%. IndexedDB, Cache API and OPFS all count toward it.
- Best-effort data is evicted LRU under pressure. Origins granted `persist()` are skipped.
- Chrome grants `persist()` without a prompt, based on engagement, whether the site is installed or bookmarked, and notification permission.

### 1.5 Storage APIs available

From BCD ([data.json](https://unpkg.com/@mdn/browser-compat-data/data.json)):

| API | Chrome Android | Safari iOS |
|---|---|---|
| Cache API | 40 | 11.3 |
| OPFS `navigator.storage.getDirectory()` | 109 | 15.2 |
| `createSyncAccessHandle()` (worker only) | 109 | 15.2 |
| `FileSystemFileHandle.createWritable()` | 109 | 26 |
| `StorageManager.persist()` | 55 | 15.2 |

WebKit 26.0 confirms "support for the File System WritableStream API" ([WebKit 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). Before iOS 26, writing to OPFS on iOS meant using a sync access handle inside a worker. wllama special-cases this: its OPFS backend writes through a worker and branches on `isSafariMobile()` ([wllama src/storage/opfs.ts](https://github.com/ngxson/wllama/blob/master/src/storage/opfs.ts)).

## 2. Runtimes in detail

### 2.1 WebLLM (MLC)

- **What it is.** "A high-performance in-browser LLM inference engine that leverages WebGPU for hardware acceleration", with an OpenAI-compatible API, Web Worker and Service Worker engines, and package `@mlc-ai/web-llm` 0.2.85 ([README](https://github.com/mlc-ai/web-llm), [package.json](https://github.com/mlc-ai/web-llm/blob/main/package.json)).
- **WebGPU is mandatory.** The engine throws `WebGPUNotAvailableError` and has no WASM CPU path. It checks for `shader-f16` and reads `maxStorageBufferBindingSize` from the device ([engine.ts](https://github.com/mlc-ai/web-llm/blob/main/src/engine.ts)).
- **Model format: MLC.** Each model is quantised weight shards plus a per-architecture compiled model library (`.wasm`). Prebuilt libs default to `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/` + `v0_2_84/base` ([config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)). Custom models must be compiled with MLC-LLM ([README](https://github.com/mlc-ai/web-llm)).
- **Prebuilt small models** (`vram_required_MB`, [config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)): SmolLM2-360M q4f16 376, Llama-3.2-1B q4f16 879, Qwen3-0.6B q4f16 1403, SmolLM2-1.7B q4f16 1774, gemma-2-2b q4f16 1895, Qwen3-1.7B q4f16 2037, Llama-3.2-3B q4f16 2264. Given the iOS evidence in §1.3, only the smallest are plausible on iPhone **(unverified per model)**.
- **Caching.** `AppConfig.cacheBackend` can be `"cache"` (Cache API, the default), `"indexeddb"`, `"opfs"` (with `opfsAccessMode` `"async"` / `"auto"` / `"sync"`), or `"cross-origin"` (experimental, needs a Chrome extension) ([README](https://github.com/mlc-ai/web-llm)).
  - The model-lib `.wasm` is cached in the `webllm/wasm` artifact cache when loaded from an absolute `http` URL. When the lib URL is same-origin and relative, WebLLM deliberately does **not** cache it and relies "on the normal caching strategy", so the app's own service worker must precache it ([engine.ts](https://github.com/mlc-ai/web-llm/blob/main/src/engine.ts)).
  - For offline use, either let WebLLM cache the GitHub-hosted lib or self-host it and precache it.
- **Service Worker engine.** WebLLM warns that the "Service Worker's life cycle is managed by the browser and can be killed any time" ([README](https://github.com/mlc-ai/web-llm)). A dedicated Web Worker is the simpler choice for a PWA.
- **Vite.** Not mentioned in the docs; the examples use Parcel ([README](https://github.com/mlc-ai/web-llm)). Use the standard Vite worker pattern (§3).

### 2.2 transformers.js (ONNX Runtime Web)

- **Package.** `@huggingface/transformers` 4.3.1, depending on `onnxruntime-web` 1.31.0-dev ([package.json](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/package.json)).
- **Backends.** "By default, when running in the browser, the model will be run on your CPU (via WASM)." Pass `device: 'webgpu'` for GPU. `dtype` can be `fp32` (the WebGPU default), `fp16`, `q8` (the WASM default) or `q4` ([README](https://github.com/huggingface/transformers.js)). The WebGPU guide notes Safari support "is version-dependent … support in recent iOS Safari" ([WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu)).
- **Format.** ONNX. Models over 2 GB use external data, because the protobuf limit is 2 GB, Chrome's `ArrayBuffer` max is about 2 GB, and wasm memory is limited to 4 GB ([ORT large models](https://onnxruntime.ai/docs/tutorials/web/large-models.html)). Example sizes from the HF API:
  - `onnx-community/Qwen3-0.6B-ONNX`: `model_q4f16.onnx` 570 MB, `model_q4.onnx` 919 MB.
  - `onnx-community/Llama-3.2-1B-Instruct-ONNX`: q4f16 about 1.09 GB external data.
- **Caching.**
  - `env.useBrowserCache` uses the Cache API, on by default, under cache key `transformers-cache`.
  - `env.useWasmCache` pre-caches the ORT `.wasm` and `.mjs` "and enables offline usage".
  - `env.useCustomCache` / `customCache` accept any object with `match`/`put`, which can be backed by OPFS.
  - `experimental_useCrossOriginStorage` is opt-in.
  - Sources: [env.js](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/env.js).
  - The ORT `.wasm` is loaded from jsDelivr by default. Set `env.backends.onnx.wasm.wasmPaths` to self-host ([README](https://github.com/huggingface/transformers.js)).
- **Workers.** ORT's `env.wasm.proxy` worker "cannot work with WebGPU EP" ([ORT env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)). Run the whole pipeline in your own module worker instead.
- **iOS risk.** v3 memory blow-up and crashes on iOS ([#1242](https://github.com/huggingface/transformers.js/issues/1242)), and the extra CPU-side copy of weights ([arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)). v4 status is **unverified**.

### 2.3 wllama (llama.cpp → WASM, plus WebGPU)

- **Package.** `@wllama/wllama` 3.9.0 ([package.json](https://github.com/ngxson/wllama/blob/master/package.json)). v3 rebuilt the library on llama.cpp's `server-context`, giving an OpenAI-compatible `createChatCompletion` with streaming and tool calling ([V3 guide](https://github.com/ngxson/wllama/blob/master/guides/intro-v3.md)).
- **Backends.**
  - WASM SIMD ("no backend or GPU is needed").
  - Automatic switch between single-thread and multi-thread builds based on browser support.
  - WebGPU, "enabled automatically" since v3.1, with `n_gpu_layers` for partial offload ([README](https://github.com/ngxson/wllama)).
- **Safari compat build.** The default build needs JSPI and Memory64. Without them, wllama falls back to a slower Asyncify, non-Memory64 build. Its compatibility table rates Safari as 🟡 "acceptable speed" in auto-compat mode with WebGPU support, and ❌ in non-compat mode. Compat assets come from jsDelivr by default; install `@wllama/wllama-compat` and call `setCompat()` with local URLs to self-host ([compat README](https://github.com/ngxson/wllama/blob/master/compat/README.md)).
  - Safari 27 adds JSPI, but iOS still lacks Memory64 (§1.2), so **iOS will stay on the compat build**.
- **Format.** GGUF. Each file can be at most 2 GB because of the `ArrayBuffer` limit, so larger models are split with `llama-gguf-split`. The README recommends "chunks of maximum 512MB" to allow parallel download and avoid some out-of-memory errors. Q4/Q5/Q6 are recommended and IQ quants are discouraged ([README](https://github.com/ngxson/wllama)).
- **Caching.**
  - `CacheManager` "defaults to OPFS". The default backend is a Cross-Origin-Storage backend that falls back to OPFS when `navigator.crossOriginStorage` is absent ([cache-manager.ts](https://github.com/ngxson/wllama/blob/master/src/cache-manager.ts), [storage/cos.ts](https://github.com/ngxson/wllama/blob/master/src/storage/cos.ts)).
  - Keys are `sha1(url)_filename` with ETag, size and sha256 metadata.
  - Writes go through a worker with an iOS-Safari-specific path ([storage/opfs.ts](https://github.com/ngxson/wllama/blob/master/src/storage/opfs.ts)).
- **Memory efficiency.** Weights stay on OPFS and are not copied into the WASM heap ([arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)). That paper's iPhone results were produced with this stack.
- **Vite.** The README shows passing explicit `.wasm` paths (`CONFIG_PATHS`). With Vite, import them with `?url` (§3). A CDN option exists but is "not recommended" ([README](https://github.com/ngxson/wllama)).

### 2.4 MediaPipe LLM Inference, and its successor LiteRT-LM JS

- **MediaPipe status.** "The MediaPipe LLM Inference API is in maintenance-only mode. We recommend migrating your Web projects to LiteRT-LM JavaScript API." It "requires a web browser with WebGPU compatibility". The package is `@mediapipe/tasks-genai` (0.10.29 on npm). Page last updated 2026-06-12 ([MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js), [npm registry](https://registry.npmjs.org/@mediapipe/tasks-genai/latest)).
- **MediaPipe models.** `.task` / `.bin` / `.litertlm`. "Models with '-Web' in the name are converted specifically for web usage." The page lists Gemma 3n E2B/E4B, Gemma 4 E2B/E4B and Gemma 3 variants ([MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js)).
  - Example: `litert-community/Gemma3-1B-IT` has `gemma3-1b-it-int4-web.task` at 700 MB. That repo is gated: an anonymous download returned HTTP 401 ([HF API](https://huggingface.co/api/models/litert-community/Gemma3-1B-IT), checked 2026-10-06). A public static app cannot fetch it without the user's HF token.
- **LiteRT-LM JS.** `@litert-lm/core` 0.18.0 is "an early preview that supports text-in / text-out running in WebGPU". It currently supports only `gemma-4-E2B-it-web.litertlm` and `gemma-4-E4B-it-web.litertlm`. The `model` option accepts a URL, a `ReadableStream` or a `Blob` ([LiteRT-LM JS README](https://github.com/google-ai-edge/LiteRT-LM/tree/main/js/packages/core), [npm registry](https://registry.npmjs.org/@litert-lm/core/latest)).
  - `gemma-4-E2B-it-web.litertlm` is 2,008,432,640 bytes and not gated ([HF tree](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/main)).
- **Caching.** Neither API documents built-in weight caching. The app must store the file itself (OPFS or Cache API) and pass a `Blob` or stream ([LiteRT-LM JS README](https://github.com/google-ai-edge/LiteRT-LM/tree/main/js/packages/core)). Whether MediaPipe's `modelAssetBuffer` accepts a stream is **unverified** in current docs.
- **Mobile.** Neither doc addresses iOS or Android browsers. A 2 GB model against the reported <500 MB iOS tab budget makes iPhone support unlikely **(unverified, inference)**.

## 3. Svelte + Vite integration notes

- **Run inference in a module Web Worker** so the Svelte UI stays responsive. Vite's recommended form is `new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' })`, with static string-literal options ([Vite features](https://vite.dev/guide/features.html)). All four runtimes support or document a worker setup: WebLLM has `WebWorkerMLCEngine`; wllama runs "inside a worker" internally; transformers.js and LiteRT-LM can be called from inside a worker **(the last two are not explicitly documented; standard practice)**.
- **WASM assets.** Use `import wasmUrl from '…/x.wasm?url'` to get a hashed asset URL, or `?init` for direct instantiation ([Vite features](https://vite.dev/guide/features.html)). For offline use, every runtime's default CDN fetch must be replaced by self-hosted files or cached:
  - transformers.js: `env.backends.onnx.wasm.wasmPaths`, or keep `useWasmCache`.
  - wllama: `CONFIG_PATHS` and `@wllama/wllama-compat` + `setCompat()`.
  - WebLLM: the model lib, either GitHub-hosted (cached by WebLLM) or self-hosted (you precache it).
  - MediaPipe: its fileset/wasm, which is hosted on jsDelivr by default.
- **PWA service worker** (for example vite-plugin-pwa / Workbox). Precache the app shell and runtime `.wasm`, but **never the model weights**. Workbox's `maximumFileSizeToCacheInBytes` defaults to 2 MiB "to prevent … inadvertently precaching very large files" ([workbox-build](https://developer.chrome.com/docs/workbox/modules/workbox-build)). Raise it only for the runtime wasm files. Leave weight caching to the runtime's own cache (or your OPFS code) so that download is an explicit user action.
- **GitHub Pages and cross-origin isolation.** Pages cannot set COOP/COEP. `coi-serviceworker` sets them from a service worker; it reloads the page once on first load, must be served from your own origin, and works only over HTTPS ([coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)).
  - On iOS only `require-corp` is possible (no `credentialless`, §1.2). Under `require-corp`, cross-origin fetches must be CORS-enabled.
  - Checked 2026-10-06: Hugging Face `resolve` returned `access-control-allow-origin` echoing the origin, and the Xet CDN redirect target returned `access-control-allow-origin: *` for a WebLLM shard.
  - Combining coi-serviceworker with the app's own PWA service worker (one scope, one SW) needs care **(unverified; design item)**.
  - Isolation is needed only for multithreaded WASM, not for WebGPU.
- **Storage UX hooks** for the "explicit download" step:
  - Call `navigator.storage.estimate()` before downloading.
  - Call `navigator.storage.persist()` after install.
  - Handle `QuotaExceededError`.
  - On iOS, tell users to install to the Home Screen first, then download.
  - Sources: [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/), [WebKit Tracking Prevention](https://webkit.org/tracking-prevention/).

## 4. Unverified or open points (need device testing)

1. The exact iOS Safari per-tab memory ceiling. The only source is the "<500 MB" figure from Levine et al. Apple publishes nothing. The ceiling may vary by device RAM and iOS version.
2. Whether WebGPU is enabled and behaves identically in an iOS 26/27 home-screen web app versus a Safari tab.
3. Which WebLLM prebuilt models (for example SmolLM2-360M, Qwen3-0.6B, Llama-3.2-1B q4f16) load on current iPhones. Only the 135M success and the 3B failure are documented.
4. Whether transformers.js v4 still has the iOS memory growth from #1242.
5. Whether LiteRT-LM JS has a working WASM/CPU fallback, and whether the 2 GB Gemma 4 E2B web model can run on any iPhone.
6. Android: the practical tab or renderer memory limits per device class, and whether any runtime uses Chrome's WebGPU compatibility mode on non-Vulkan devices.
7. How the coi-serviceworker and the app's own PWA service worker coexist.

## Sources

- WebKit: [Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/), [Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/), [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/), [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), [Tracking Prevention](https://webkit.org/tracking-prevention/), [HardwareCapabilities.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebGPU/WebGPU/HardwareCapabilities.mm)
- Chrome/web.dev: [WebGPU 121](https://developer.chrome.com/blog/new-in-webgpu-121), [WebGPU 139](https://developer.chrome.com/blog/new-in-webgpu-139), [WebGPU 146](https://developer.chrome.com/blog/new-in-webgpu-146), [WebGPU in major browsers](https://web.dev/blog/webgpu-supported-major-browsers), [Persistent storage](https://web.dev/articles/persistent-storage), [workbox-build](https://developer.chrome.com/docs/workbox/modules/workbox-build)
- Specs/compat: [W3C WebGPU](https://www.w3.org/TR/webgpu/), [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [MDN browser-compat-data 8.1.4](https://unpkg.com/@mdn/browser-compat-data/data.json)
- WebLLM: [README](https://github.com/mlc-ai/web-llm), [config.ts](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts), [engine.ts](https://github.com/mlc-ai/web-llm/blob/main/src/engine.ts), [issue #753](https://github.com/mlc-ai/web-llm/issues/753)
- transformers.js / ORT: [README](https://github.com/huggingface/transformers.js), [env.js](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/env.js), [WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu), [issue #1242](https://github.com/huggingface/transformers.js/issues/1242), [ORT large models](https://onnxruntime.ai/docs/tutorials/web/large-models.html), [ORT env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- wllama: [README](https://github.com/ngxson/wllama), [V3 guide](https://github.com/ngxson/wllama/blob/master/guides/intro-v3.md), [compat README](https://github.com/ngxson/wllama/blob/master/compat/README.md), [cache-manager.ts](https://github.com/ngxson/wllama/blob/master/src/cache-manager.ts)
- Google: [MediaPipe LLM Inference web](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js), [LiteRT-LM Web API](https://developers.google.com/edge/litert-lm/js), [LiteRT-LM JS README](https://github.com/google-ai-edge/LiteRT-LM/tree/main/js/packages/core)
- Research: [Levine et al., "Llamas on the Web", arXiv 2605.20706](https://arxiv.org/html/2605.20706v1)
- Tooling: [Vite features](https://vite.dev/guide/features.html), [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)

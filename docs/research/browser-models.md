# Small models for English complaint emails in browser runtimes

Research for [#3](https://github.com/kravlab/flex-claimer/issues/3) (child of map #1). Checked on 2026-10-06.

**Question.** Which small open-weight models can write a coherent, polite English complaint email from a short structured prompt? Which of them ship in the formats that browser runtimes use (MLC/WebLLM, ONNX/transformers.js, GGUF/wllama, MediaPipe/LiteRT-LM)? For each one we need parameter count, quantization, download size, approximate RAM or VRAM, licence, and runtimes.

**Method.** Only primary sources: Hugging Face model cards and file listings, the WebLLM `prebuiltAppConfig` source, official runtime docs, and licence texts. Each fact has a source in the sections below. Anything we could not confirm from a primary source is marked **(unverified)**. No primary source tests "complaint email" quality directly. Where model cards give instruction-following scores (IFEval) we quote them as a rough guide, but the real check is a bake-off with our own prompt (see [Open questions](#open-questions)).

Units: sizes are as shown on Hugging Face (decimal MB/GB). "VRAM" for WebLLM is the `vram_required_MB` value in its config. For the other runtimes no memory figure is published, so RAM is our estimate: about weights plus 20 to 50 % for KV cache and runtime overhead **(estimate, unverified)**.

## Comparison table

Tiers are a proposal for the "pick a model" list. "Download" is the q4 build for each runtime. A dash means we found no build in that runtime's official channel.

| Tier | Model | Params | Licence | WebLLM (MLC q4f16_1): download / VRAM | transformers.js (ONNX q4f16) download | wllama (GGUF Q4_K_M) download | MediaPipe / LiteRT-LM web | Notes |
|---|---|---|---|---|---|---|---|---|
| S | **Qwen3.5-0.8B** | 0.8B | Apache-2.0 | 447 MB / 1,629 MB | 469 MB (`-Text-ONNX`) | 533 MB | – | Feb 2026. No thinking by default. Card warns about "thinking loops". |
| S | Qwen3-0.6B | 0.6B | Apache-2.0 | 352 MB / 1,403 MB | 570 MB | 639 MB (Q8_0, official) | – | Thinking on by default: turn it off. |
| S | **Gemma 3 1B IT** | 1.0B | Gemma Terms of Use | 602 MB / 711 MB | 763 MB | 1 GB (QAT Q4_0, gated) | `.task`/`.litertlm` (gated repo) | Lowest VRAM of the 1B class. Licence has pass-through duties. Google repos are gated. |
| S | Llama 3.2 1B Instruct | 1.23B | Llama 3.2 Community | 705 MB / 879 MB | 1.09 GB | 808 MB | – | Requires "Built with Llama" notice. IFEval 59.5. |
| M | **Qwen3.5-2B** | 2B | Apache-2.0 | 1.08 GB / 2,245 MB | – (no official onnx-community build found) | 1.28 GB | – | No thinking by default. IFEval 61.2. |
| M | Qwen3-1.7B | 1.7B | Apache-2.0 | 984 MB / 2,037 MB | 1.43 GB | 1.11 GB | – | Thinking on by default. |
| M | SmolLM2-1.7B Instruct | 1.7B | Apache-2.0 | (not measured) / 1,774 MB | – | 1.06 GB | – | English-first. Older (2024). |
| M | Granite 4.0 1B | ~1.6B | Apache-2.0 | – | 1.25 GB (`-ONNX-web`) | – (not checked) | – | Oct 2025. |
| L | **Gemma 4 E2B IT** | 2.3B effective (5.1B with embeddings) | Apache-2.0 | – (not prebuilt yet; MLC support merged 2026-09-29) | 3.11 GB (text-only parts) | 2.84 GB (Q4_0, ggml-org) | **2.01 GB** `-web.litertlm`, ~1.8 GB GPU memory | Apache licence from Gemma 4 on. Officially supported by LiteRT-LM JS. |
| L | Llama 3.2 3B Instruct | 3.21B | Llama 3.2 Community | 1.82 GB / 2,264 MB | ~2.41 GB | 2.02 GB | – | IFEval 77.4. |
| L | Qwen3-4B | 4B | Apache-2.0 | 2.28 GB / 3,432 MB | ~2.84 GB | 2.5 GB (Instruct-2507) | – | |
| L | Qwen3.5-4B | 4B | Apache-2.0 (unverified for 4B) | 2.39 GB / 3,868 MB | – | 2.74 GB | – | |
| L | SmolLM3-3B | 3B | Apache-2.0 | – | 2.12 GB | – (not checked) | – | Thinking on by default (`/no_think`). |
| L | Phi-4-mini-instruct | 3.8B | MIT | 2.18 GB / 3,438 MB | – (not checked) | 2.49 GB | – | |
| L | Ministral 3 3B Instruct 2512 | 3.4B + 0.4B vision | Apache-2.0 | (not measured) / 2,864 MB | – | – (not checked) | – | |
| XL | Gemma 4 E4B IT | 4.5B effective (unverified) | Apache-2.0 | – | ~4.9 GB (text-only parts) | – (not checked) | **2.97 GB** web, ~3.3 GB GPU memory | Desktop or laptop class. |

### Draft "pick a model" list (plain device requirements)

This is a starting point only. Final thresholds need on-device testing (see [Open questions](#open-questions)).

- **Small (≈0.5 to 0.8 GB download).** Phones with about 4 GB RAM and WebGPU (Chrome on Android 12+, Safari on iOS 26+). Candidates: Qwen3.5-0.8B, Gemma 3 1B, Llama 3.2 1B.
- **Medium (≈1 to 1.3 GB).** Phones with about 6 GB RAM. Candidates: Qwen3.5-2B, Qwen3-1.7B.
- **Large (≈2 to 2.5 GB).** Recent high-end phones with 8 GB+ RAM, or laptops. Candidates: Gemma 4 E2B (LiteRT-LM web), Llama 3.2 3B, Qwen3-4B, Phi-4-mini.
- **Extra large (≈3 GB+).** Laptops or desktops with a discrete or Apple-silicon GPU. Candidate: Gemma 4 E4B.

## Runtime facts that shape the list

### WebLLM (MLC, WebGPU)

- The prebuilt model list lives in `src/config.ts`. For each model it records `vram_required_MB` ("amount of vram in MB required to run the model") and `low_resource_required` ("whether the model can run on limited devices (e.g. Android phone)"). Some q4f16 builds also declare `required_features: ["shader-f16"]`. The q4f32_1 builds are the fallback for GPUs without f16 and need more VRAM. Source: <https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts>
- Prebuilt models include Qwen3 (0.6/1.7/4/8B), Qwen3.5 (0.8/2/4/9B), Llama 3.2 (1B/3B), Gemma 3 1B, Gemma 2 2B, Phi-4-mini, Phi-3.5-mini, SmolLM2 (135M/360M/1.7B), Ministral 3 3B, OLMo-2 1B, Qwen2.5 and others. The prebuilt list has **no Gemma 4** (same source).
- Gemma 4 E2B support (text and audio) was merged into MLC-LLM on 2026-09-29. WebLLM is named as "the first consumer". <https://github.com/mlc-ai/mlc-llm/pull/3559>. The WebLLM request to add Gemma 4 as a built-in model is still open: <https://github.com/mlc-ai/web-llm/issues/810>
- Model libraries (WASM) are fetched from `raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/...`. Weights come from `huggingface.co/mlc-ai/...` (config.ts, above). Download sizes in the table are the HF repo totals and do not include the small WASM library.
- The `low_resource_required` flag is `true` for Qwen3.5-0.8B, Qwen3 0.6/1.7/4B, Llama 3.2 1B/3B, Gemma 3 1B, SmolLM2 and Ministral 3 3B. It is `false` for Qwen3.5-2B, Qwen3.5-4B and Phi-4-mini (config.ts).

### transformers.js (ONNX Runtime Web, WebGPU or WASM)

- v4.0.0 rewrote the WebGPU runtime and added Qwen3.5. v4.1.0 added Gemma 4. v4.3.0 says "Enable WebGPU for Safari 26 and above". Source: <https://github.com/huggingface/transformers.js/releases>. The release page as fetched showed year 2025 for these releases, but Gemma 4 came out in April 2026, so the year is most likely 2026 **(dates unverified)**.
- Qwen3.5 ONNX models "aren't currently supported by the text-generation pipeline" because the model also takes images. The text-only `onnx-community/Qwen3.5-0.8B-Text-ONNX` repo avoids this. <https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX>, <https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX>
- Gemma 4 E2B ONNX recommends `dtype: "q4f16"` and `device: "webgpu"`. It has separate decoder, embed_tokens, vision and audio files, so a text-only app needs only the decoder and embed_tokens files. <https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX>

### wllama (llama.cpp → WASM, GGUF)

- "Max file size is 2GB, due to size restriction of ArrayBuffer". The docs advise splitting models into chunks of 512 MB or less with `llama-gguf-split`. Multi-threading needs COOP/COEP headers. WebGPU support was added in v3. <https://github.com/ngxson/wllama>
- **GitHub Pages cannot set COOP/COEP headers** (GitHub Pages has no custom headers: unverified here). Without a workaround such as a service-worker header shim, wllama runs single-threaded **(unverified)**.
- wllama v3 needs WebAssembly Memory64, which Safari/iOS do not support. The optional `@wllama/wllama-compat` package adds Safari/iOS support "with lower performance" **(from search-result summary, not confirmed in the package README)**. <https://www.jsdelivr.com/package/npm/@wllama/wllama-compat>
- Latest release is 3.8.1 (Oct 2). The release notes do not mention Qwen3.5 or Gemma 4, so whether the bundled llama.cpp loads those architectures is **unverified**. <https://github.com/ngxson/wllama/releases>

### MediaPipe LLM Inference / LiteRT-LM JS

- The MediaPipe LLM Inference web API is in "maintenance-only mode". Google recommends moving to the LiteRT-LM JavaScript API. It "requires a web browser with WebGPU compatibility". Models with "-Web" in the name are converted for web use. <https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js>
- LiteRT-LM Web API (`@litert-lm/core`) is an early preview that does text in and text out on WebGPU. It lists the Gemma 4 E2B, E4B, 12B, 26B-A4B and 31B `.litertlm` files from `litert-community`. <https://developers.google.com/edge/litert-lm/js>
- `litert-community` also hosts Qwen3, Qwen2.5, SmolLM3, Phi-4-mini-reasoning and Ministral-3-3B conversions. A web variant is confirmed only for Gemma (`-web.task` / `-web.litertlm`). <https://huggingface.co/litert-community>

### Browser WebGPU availability (needed by WebLLM, MediaPipe/LiteRT-LM, and transformers.js GPU mode)

- Android: WebGPU is on by default from Chrome 121 on Android 12+ with Qualcomm and ARM GPUs. <https://developer.chrome.com/blog/new-in-webgpu-121>
- iOS: WebGPU shipped in Safari 26.0 (iOS 26 / iPadOS 26) and is on by default. <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>

## Model details

### Qwen3.5-0.8B and Qwen3.5-2B (Alibaba, Feb 2026)

- 0.8B and 2B parameters. Hybrid architecture (Gated DeltaNet plus gated attention). Context of 262,144 tokens. Apache-2.0. Both run **without thinking by default**. IFEval (non-thinking) is 52.1 for 0.8B and 61.2 for 2B. <https://huggingface.co/Qwen/Qwen3.5-0.8B>, <https://huggingface.co/Qwen/Qwen3.5-2B>
- Warning from the 0.8B card: it "is more prone to entering thinking loops compared to other Qwen3.5 models, which may prevent it from terminating generation properly". The card advises streaming plus checks for runaway output. (0.8B card, above)
- MLC: `Qwen3.5-0.8B-q4f16_1-MLC` is 447 MB (VRAM 1,629 MB). `Qwen3.5-2B-q4f16_1-MLC` is 1.08 GB (VRAM 2,245 MB). `Qwen3.5-4B-q4f16_1-MLC` is 2.39 GB (VRAM 3,868 MB). <https://huggingface.co/mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC/tree/main>, <https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/tree/main>, <https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC/tree/main>, config.ts
- ONNX: `onnx-community/Qwen3.5-0.8B-Text-ONNX` `model_q4f16.onnx_data` is 469 MB (q4 is 551 MB). <https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX/tree/main/onnx>. No onnx-community 2B build turned up in search; only third-party copies exist (e.g. `JasonYANG170/Qwen3.5-2B-ONNX`, unverified).
- GGUF (unsloth): 0.8B Q4_K_M is 533 MB. 2B Q4_K_M is 1.28 GB. 4B Q4_K_M is 2.74 GB. <https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/tree/main>, <https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/tree/main>, <https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/tree/main>
- Qwen3.6 exists only at 27B and 35B-A3B, which is too large. <https://unsloth.ai/docs/models/qwen3.6>

### Qwen3 0.6B / 1.7B / 4B (Alibaba, 2025)

- Qwen3-1.7B has 1.7B parameters (1.4B without embeddings), 32,768 context and an Apache-2.0 licence. **Thinking is on by default**. Turn it off with `enable_thinking=False` or `/no_think`. The card warns against greedy decoding. <https://huggingface.co/Qwen/Qwen3-1.7B>
- MLC sizes: 0.6B is 352 MB, 1.7B is 984 MB, 4B is 2.28 GB (VRAM 1,403 / 2,037 / 3,432 MB). <https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/tree/main>, <https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/tree/main>, <https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/tree/main>
- ONNX q4f16 sizes: 0.6B is 570 MB, 1.7B is 1.43 GB, 4B is 2.1 GB + 677 MB. <https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/tree/main/onnx>, <https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX/tree/main/onnx>, <https://huggingface.co/onnx-community/Qwen3-4B-ONNX/tree/main/onnx>
- GGUF: the official repos have Q8_0 only (0.6B is 639 MB, 1.7B is 1.83 GB). unsloth 1.7B Q4_K_M is 1.11 GB. unsloth 4B-Instruct-2507 (non-thinking) Q4_K_M is 2.5 GB. <https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/tree/main>, <https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/tree/main>, <https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/tree/main>, <https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/tree/main>

### Gemma 4 E2B / E4B (Google, Apr 2026)

- **Apache-2.0**, unlike earlier Gemma models. Google: "The release of Gemma 4 under the Apache 2.0 license", 2026-04-02. <https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html>
- E2B has "2.3B effective (5.1B with embeddings)" parameters through Per-Layer Embeddings and a 128K context. Thinking is off unless `<|think|>` is in the system prompt. The card reports MMLU Pro 60.0 and gives no IFEval score. <https://huggingface.co/google/gemma-4-E2B-it>
- LiteRT-LM (`litert-community`, not gated, Apache-2.0):
  - E2B: `gemma-4-E2B-it-web.litertlm` is 2.01 GB, `-web.task` is 2 GB. Web is text-only. On WebGPU (MacBook Pro M4 Max) it decodes at 73 tok/s with ~1,800 MB GPU memory. On iPhone 17 Pro GPU it decodes at 56.5 tok/s with 1,450 MB (native app, not the browser). <https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm>, <https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/main>
  - E4B: the web file is 2,969 MB. WebGPU on M4 Max decodes at 44 tok/s with ~3,300 MB GPU memory. Context up to 32k. <https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm>
- ONNX: text-only E2B q4f16 is decoder 1.52 GB + embed_tokens 1.59 GB = **3.11 GB**. E4B q4f16 is decoder 2.07 GB + 812 MB plus embed 2.02 GB (~4.9 GB). <https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/tree/main/onnx>, <https://huggingface.co/onnx-community/gemma-4-E4B-it-ONNX/tree/main/onnx>
- GGUF (ggml-org): E2B Q4_0 is 2.84 GB, Q8_0 is 4.97 GB. This is over wllama's 2 GB per-file limit, so the file must be split. <https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/tree/main>
- MLC: no prebuilt yet (see WebLLM section). A community build exists (`welcoma/gemma-4-E2B-it-q4f16_1-MLC`, unverified).
- The E4B "4.5B effective" parameter count comes from memory and was **not verified** on its card.

### Gemma 3 1B IT (Google, 2025)

- 1.0B parameters, 32K context, 140+ languages, **Gemma Terms of Use**. The Google repo is **gated** (login plus licence acceptance). <https://huggingface.co/google/gemma-3-1b-it>
- Gemma Terms (last modified 2026-04-01) allow distribution with these conditions:
  - the Section 3.2 use restrictions must be passed through as enforceable terms;
  - recipients must get a copy of the agreement;
  - a Notice must be included: "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms";
  - Google "reserves the right to restrict (remotely or otherwise) usage".
  <https://ai.google.dev/gemma/terms>
- Builds:
  - MLC `gemma3-1b-it-q4f16_1-MLC` is 602 MB, VRAM 711 MB, not gated. <https://huggingface.co/mlc-ai/gemma3-1b-it-q4f16_1-MLC/tree/main>
  - ONNX q4f16 is 763 MB, not gated. <https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX/tree/main/onnx>
  - GGUF QAT Q4_0 is 1 GB, **gated**. <https://huggingface.co/google/gemma-3-1b-it-qat-q4_0-gguf/tree/main>
  - LiteRT `.litertlm` int4 is 584 MB, **gated**. <https://huggingface.co/litert-community/Gemma3-1B-IT/tree/main>
- Gated files cannot be fetched anonymously by a browser app. They would have to be mirrored, which the licence allows when its conditions are met **(legal reading, unverified)**.
- The Gemma 3 1B card gives no IFEval score (benchmark table checked).

### Llama 3.2 1B / 3B Instruct (Meta, 2024)

- 1.23B / 3.21B parameters, 128k context, 8 officially supported languages (English among them). IFEval: 1B is 59.5, 3B is 77.4. <https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct>
- Llama 3.2 Community License:
  - show "Built with Llama" prominently;
  - include the licence and keep the copyright notice;
  - a separate licence is needed above 700M monthly active users;
  - the Acceptable Use Policy applies.
  <https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt>. Whether the AUP has an EU clause for multimodal models only (it would not affect 1B/3B text) is **unverified**: the AUP page needed a login.
- MLC: 1B is 705 MB (VRAM 879 MB), 3B is 1.82 GB (VRAM 2,264 MB). <https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/tree/main>, <https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC/tree/main>
- ONNX q4f16: 1B is 1.09 GB, 3B is 2.1 GB + 311 MB. <https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX/tree/main/onnx>, <https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct-ONNX/tree/main/onnx>
- GGUF Q4_K_M (hugging-quants): 1B is 808 MB, 3B is 2.02 GB. <https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF/tree/main>, <https://huggingface.co/hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF/tree/main>

### SmolLM2-1.7B Instruct and SmolLM3-3B (Hugging Face)

- SmolLM2-1.7B: Apache-2.0. "primarily understand and generate content in English". <https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct>. The GGUF Q4_K_M is 1.06 GB. <https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/tree/main>. WebLLM VRAM is 1,774 MB (config.ts).
- SmolLM3-3B: Apache-2.0, 6 main languages, 64k context (128k with YaRN). Extended thinking is **on by default**; turn it off with `/no_think` or `enable_thinking=False`. <https://huggingface.co/HuggingFaceTB/SmolLM3-3B>. ONNX q4f16 is 2.12 GB. <https://huggingface.co/HuggingFaceTB/SmolLM3-3B-ONNX/tree/main/onnx>

### Phi-4-mini-instruct (Microsoft, Feb 2025)

- 3.8B parameters, MIT licence, 128K context. <https://huggingface.co/microsoft/Phi-4-mini-instruct>
- MLC is 2.18 GB (VRAM 3,438 MB). GGUF Q4_K_M (unsloth) is 2.49 GB. <https://huggingface.co/mlc-ai/Phi-4-mini-instruct-q4f16_1-MLC/tree/main>, <https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/tree/main>

### Granite 4.0 1B (IBM, Oct 2025)

- Apache-2.0, 128K context, 12 languages. The card lists the 1B dense model as 1.6B parameters. ONNX-web q4f16 is 1.25 GB. <https://huggingface.co/onnx-community/granite-4.0-1b-ONNX-web>, <https://huggingface.co/onnx-community/granite-4.0-1b-ONNX-web/tree/main/onnx>

### Ministral 3 3B Instruct 2512 (Mistral, Dec 2025)

- 3.4B language model plus a 0.4B vision encoder, Apache-2.0, 256k context. <https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512>. WebLLM VRAM is 2,864 MB for q4f16 (config.ts).

### Considered and set aside

- **LFM2 / LFM2.5 (Liquid AI).** ONNX builds exist (`onnx-community/LFM2-1.2B-ONNX`), but the licence is the "LFM Open License v1.0", not OSI. Its commercial terms were not shown on the card. <https://huggingface.co/LiquidAI/LFM2-1.2B>. Leave it out unless the licence is reviewed.
- **Sub-0.5B models** (SmolLM2-135M/360M, Gemma 3 270M, Granite 4.0 350M) are available, but we found no primary evidence that they write coherent multi-paragraph emails **(quality unverified; likely too weak)**.
- **7B+ models** (Qwen3-8B, Llama 3.1 8B and others) need about 5 to 6 GB VRAM in WebLLM (config.ts). That is outside phone budgets.

## Open questions

1. **Quality.** No primary source measures complaint-email writing. We need a small bake-off: the same structured prompt across tier candidates, judged for politeness, coherence and faithfulness to the given facts (no invented details).
2. **iOS memory ceiling.** Safari's per-tab memory limit, and its storage quota for multi-GB Cache/IndexedDB downloads, are **unverified**. This decides whether Large-tier models can work on iPhone at all.
3. **shader-f16 on mobile.** Which Android and iOS GPUs expose `shader-f16` decides between q4f16 and q4f32 builds; **unverified**.
4. **wllama.** COOP/COEP on GitHub Pages, Safari compat performance, and support for the Qwen3.5 / Gemma 4 architectures are all **unverified**.
5. **Exact transformers.js release dates** (see the transformers.js section).

## Sources (index)

- WebLLM prebuilt config: <https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts>
- MLC Gemma 4 PR: <https://github.com/mlc-ai/mlc-llm/pull/3559>. WebLLM Gemma 4 issue: <https://github.com/mlc-ai/web-llm/issues/810>
- transformers.js releases: <https://github.com/huggingface/transformers.js/releases>
- wllama: <https://github.com/ngxson/wllama>, <https://github.com/ngxson/wllama/releases>, <https://www.jsdelivr.com/package/npm/@wllama/wllama-compat>
- MediaPipe web guide: <https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js>. LiteRT-LM JS: <https://developers.google.com/edge/litert-lm/js>. litert-community: <https://huggingface.co/litert-community>
- WebGPU: <https://developer.chrome.com/blog/new-in-webgpu-121>, <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>
- Licences: <https://ai.google.dev/gemma/terms>, <https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html>, <https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt>
- Model cards and file listings: linked inline above.

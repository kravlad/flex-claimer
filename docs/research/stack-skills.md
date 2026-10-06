# `npx skills` candidates for Svelte + TypeScript + Vite PWA (+ in-browser LLM)

Research for issue #6 (child of map #1). Researched 2026-10-06. Nothing was installed;
`npx` was not run (Node is not in the dev container). Install commands come from the
`skills` CLI README and source (see [How install commands were derived](#how-install-commands-were-derived)).

Install counts are from the skills.sh search endpoint on 2026-10-06 and change daily.
"Last change" is the date of the latest commit touching that skill's folder, taken from the
GitHub commits API.

## Candidate table

| # | Skill | Source repo (path) | Covers | Owner / trust | Last change to the skill | skills.sh installs | Install command (project scope) |
|---|-------|--------------------|--------|---------------|--------------------------|-------------------|--------------------------------|
| 1 | `svelte-code-writer` | [sveltejs/ai-tools](https://github.com/sveltejs/ai-tools) (`plugins/claude/svelte/skills/svelte-code-writer`) | Svelte 5 docs lookup and `svelte-autofixer` through `npx @sveltejs/mcp` | Official Svelte org, MIT, 330 stars | 2026-10-03 (synced from svelte.dev) | 11,555 | `npx skills add sveltejs/ai-tools --skill svelte-code-writer` |
| 2 | `svelte-core-bestpractices` | sveltejs/ai-tools (`plugins/claude/svelte/skills/svelte-core-bestpractices`) | Runes, `$derived` vs `$effect`, snippets, keyed each, styling, context | Official Svelte org | 2026-10-03 | 9,610 | `npx skills add sveltejs/ai-tools --skill svelte-core-bestpractices` |
| 3 | `vite` | [antfu/skills](https://github.com/antfu/skills) (`skills/vite`) | Vite config, plugin API, env, HMR, build and library mode, Vite 8/Rolldown migration (generated from vitejs/vite docs, based on Vite v8.3.1) | Anthony Fu (Vite core team), MIT, ~5.9k stars | 2026-09-28 | 37,218 | `npx skills add antfu/skills --skill vite` |
| 4 | `vitest` | antfu/skills (`skills/vitest`) | Vitest config, mocking, snapshots, coverage, browser and type tests (generated from vitest-dev/vitest docs) | Anthony Fu | 2026-09-28 (same batch) | 39,169 | `npx skills add antfu/skills --skill vitest` |
| 5 | `transformers-js` | [huggingface/skills](https://github.com/huggingface/skills) (`skills/transformers-js`) | Transformers.js v4: pipelines, WebGPU/WASM, quantization, text generation, browser caching | Official Hugging Face, Apache-2.0, ~11.1k stars | 2026-04-10 ("updated to transformers.js v4") | 1,914 | `npx skills add huggingface/skills --skill transformers-js` |
| 5b | `transformers-js` (in-library copy) | [huggingface/transformers.js](https://github.com/huggingface/transformers.js) (`.ai/skills/transformers-js`) | Same topic. Generated from the library's own docs | Official Hugging Face, ~16.3k stars | 2026-09-15 | not listed | `npx skills add https://github.com/huggingface/transformers.js/tree/main/.ai/skills/transformers-js` (see caveat) |
| 6 | `pwa-development` | [jwynia/agent-skills](https://github.com/jwynia/agent-skills) (`skills/tech/frontend/pwa/pwa-development`) | Manifest, service worker, caching strategies, offline, install prompt, Workbox / vite-pwa. States it targets **React and Svelte, Vite** | Individual, 165 stars | 2026-02-15 | 429 | `npx skills add jwynia/agent-skills --skill pwa-development` |
| 7 | `pwa-development` | [alinaqi/maggy](https://github.com/alinaqi/maggy) (`skills/pwa-development`) | Generic PWA: manifest, SW patterns, caching strategies, Workbox (incl. `vite-plugin-pwa`), offline, testing, checklist | Individual, 707 stars | 2026-04-07 | 3,754 | `npx skills add alinaqi/maggy --skill pwa-development` |
| 8 | `svelte5-best-practices` | [ejirocodes/agent-skills](https://github.com/ejirocodes/agent-skills) (`svelte/skills/svelte5-best-practices`) | Svelte 5 runes, snippets, TS props typing, migration, SvelteKit | Individual, 6 stars | 2026-03-03 | 13,045 | `npx skills add ejirocodes/agent-skills --skill svelte5-best-practices` |
| 9 | `typescript-advanced-types` | [wshobson/agents](https://github.com/wshobson/agents) (`plugins/javascript-typescript/skills/typescript-advanced-types`) | Generic advanced TS types (generics, conditional, mapped types) | Individual, ~40k stars | 2026-05-22 | 83,919 | `npx skills add wshobson/agents --skill typescript-advanced-types` |
| 10 | `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`skills/web-design-guidelines`) | Framework-agnostic UI, UX and accessibility review | Vercel, ~32k stars | 2026-01-16 | 701,563 | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` |
| 11 | `accessibility`, `performance`, `core-web-vitals`, `best-practices`, `web-quality-audit` | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) (`skills/*`) | Lighthouse-style web quality audits | Addy Osmani, ~2.9k stars | repo pushed 2026-08-24 | 29,454 (`web-quality-audit`) | `npx skills add addyosmani/web-quality-skills --skill web-quality-audit` |

**No skill found** for WebLLM (`mlc-ai/web-llm`), wllama (`ngxson/wllama`) or MediaPipe LLM Inference for Web.
See [In-browser LLM runtimes](#in-browser-llm-runtimes).

### Shortlist (suggestion for the install ticket)

- **Core, low risk:** #1 `svelte-code-writer`, #2 `svelte-core-bestpractices` (official Svelte) and #3 `vite` (antfu, generated from Vite docs). Recently maintained, from trusted sources.
- **Conditional:** #4 `vitest` if Vitest is the test runner. #5 or #5b `transformers-js` only if transformers.js is the chosen LLM runtime.
- **PWA:** no official or high-trust PWA skill exists. #6 (jwynia) is the only one that names Svelte + Vite. #7 (maggy) has more installs but contains an error (see below). Review either one by hand before installing, or skip and rely on the vite-pwa docs.
- **Probably skip:** #8 (overlaps with the official Svelte skills, and the repo has very few stars for its install count), #9 (generic), #10 and #11 (generic web quality; optional).

## Details

### 1-2. sveltejs/ai-tools: `svelte-code-writer`, `svelte-core-bestpractices`

- Official Svelte repo. Its description calls it "the official Svelte MCP server" and the repo also hosts the MCP server, a Claude Code plugin, a Cursor plugin and an OpenCode plugin. MIT, 330 stars, not archived, pushed 2026-10-06 ([repo](https://github.com/sveltejs/ai-tools), [API](https://api.github.com/repos/sveltejs/ai-tools)).
- Recent commits: 2026-10-05 "fix: set correct version for mcp cli (#284)", 2026-10-03 "chore: sync skills from svelte.dev (#280)" ([commits](https://github.com/sveltejs/ai-tools/commits/main)). The skills are synced from the svelte.dev docs ([svelte.dev/docs/ai/skills](https://svelte.dev/docs/ai/skills)).
- skills.sh lists exactly these two skills for the repo ([skills.sh/sveltejs/ai-tools](https://www.skills.sh/sveltejs/ai-tools)).
- `svelte-code-writer`: "CLI tools for Svelte 5 documentation lookup and code analysis. MUST be used whenever creating, editing or analyzing any Svelte component (.svelte) or Svelte module (.svelte.ts/.svelte.js)." It runs `npx @sveltejs/mcp list-sections | get-documentation | svelte-autofixer`, so it **needs Node/npx at agent run time and network access** to fetch docs ([SKILL.md](https://github.com/sveltejs/ai-tools/blob/main/plugins/claude/svelte/skills/svelte-code-writer/SKILL.md)).
- `svelte-core-bestpractices`: guidance on `$state` (only for reactive values; `$state.raw` for large unmutated data), `$derived` over `$effect`, effects as an escape hatch, `{@attach}`, keyed `#each`, snippets/`{@render}`, CSS custom properties, `createContext` ([SKILL.md](https://github.com/sveltejs/ai-tools/blob/main/plugins/claude/svelte/skills/svelte-core-bestpractices/SKILL.md)).
- Repo layout: identical copies of the two skills exist under `plugins/claude/svelte/skills/`, `plugins/cursor/svelte/skills/`, `packages/opencode/skills/` and `tools/skills/`. `.agents/skills/` holds two repo-internal skills (`writing-great-skills`, `writing-opencode-plugins`) marked `metadata.internal: true`. The CLI hides internal skills by default ([repo tree](https://api.github.com/repos/sveltejs/ai-tools/git/trees/HEAD?recursive=1), [CLI README](https://github.com/vercel-labs/skills#skill-discovery)).
- Expected `skillPath` in `skills-lock.json`: `plugins/claude/svelte/skills/<name>/SKILL.md`. **Inferred, not verified by running the CLI.** None of the copies sit in a standard discovery container. The repo has `.claude-plugin/marketplace.json` with plugin source `./plugins/claude/svelte` and no `skills` array, and the CLI then always searches `<pluginBase>/skills` ([marketplace.json](https://github.com/sveltejs/ai-tools/blob/main/.claude-plugin/marketplace.json), [plugin-manifest.ts](https://github.com/vercel-labs/skills/blob/main/src/plugin-manifest.ts)).
- Related but not an `npx skills` install, so it does not go into `skills-lock.json`: `npx sv add ai-tools`, which sets up the Svelte MCP/AI tooling per client ([svelte.dev/docs/cli/ai-tools](https://svelte.dev/docs/cli/ai-tools)).

### 3-4. antfu/skills: `vite`, `vitest`

- MIT, ~5.9k stars, not archived, pushed 2026-09-30 ([repo](https://github.com/antfu/skills)). It mixes hand-maintained opinionated skills (`antfu`, `antfu-create-pr`) with skills generated from official docs (vite from vitejs/vite, vitest from vitest-dev/vitest, and others), using git submodules ([README](https://github.com/antfu/skills)).
- `vite` frontmatter: "Vite build tool configuration, plugin API, SSR, and Vite 8 Rolldown migration…", version 2026.9.25, "Based on Vite v8.3.1 (Rolldown-powered), generated 2026-09-25" ([SKILL.md](https://github.com/antfu/skills/blob/main/skills/vite/SKILL.md)). Latest commit on `skills/vite`: 2026-09-28 "feat: upgrade generated skills to latest upstream docs (#40)".
- `vitest`: version 2026.9.25, generated from vitest-dev/vitest. Covers config, CLI, mocking, snapshots, coverage, fixtures, type tests and projects ([SKILL.md](https://github.com/antfu/skills/blob/main/skills/vitest/SKILL.md)).
- Current SKILL.md files in the repo: `antfu, antfu-create-pr, nitro, nuxt, pinia, pnpm, unocss, vite, vitepress, vitest, vue`. On 2026-09-25 "chore!: remove vendored skills (#39)" removed vendored skills such as `web-design-guidelines` (`skills/web-design-guidelines/SKILL.md` now returns 404), even though skills.sh still lists them ([commits](https://github.com/antfu/skills/commits/main), [skills.sh/antfu/skills](https://www.skills.sh/antfu/skills)).
- Caveat: this is a personal repo, not a vitejs org repo. No official vitejs skill was found (search: [skills.sh API `q=vite`](https://skills.sh/api/search?q=vite)).

### 5 / 5b. `transformers-js` (two official sources)

- **huggingface/skills** (Apache-2.0, ~11.1k stars, pushed 2026-10-01): `skills/transformers-js/SKILL.md`. Frontmatter version 4.x, compatibility Node 18+/browsers. Covers pipelines, WebGPU with WASM fallback, CDN import, streaming text generation, and `pipe.dispose()` ([repo](https://github.com/huggingface/skills), [SKILL.md](https://github.com/huggingface/skills/blob/main/skills/transformers-js/SKILL.md)). Last commit to the folder: 2026-04-10 "updated to transformers.js v4". skills.sh lists it ([search](https://skills.sh/api/search?q=transformers)).
- **huggingface/transformers.js** (~16.3k stars, pushed 2026-10-06): `.ai/skills/transformers-js/SKILL.md`. Generated from the library's docs ("automatic skills generation" in PR #1766, 2026-09-15). Compatibility Node 20+ or a modern browser. Covers 24+ tasks, dtype quantization (fp32…q4f16), browser Cache API model caching, and KV-cache reuse ([SKILL.md](https://github.com/huggingface/transformers.js/blob/main/.ai/skills/transformers-js/SKILL.md)).
- Caveat for 5b: `.ai/skills/` is **not** in the CLI's standard discovery list. The CLI falls back to a recursive search only "if no skills are found in standard locations" ([README](https://github.com/vercel-labs/skills#skill-discovery)). The repo has no other SKILL.md, so `npx skills add huggingface/transformers.js` probably finds it through that fallback, and the tree URL form targets it directly. **Unverified**: not run.
- Which one: 5b follows the library more closely (it is regenerated with the code). 5 is the one listed and counted on skills.sh. Only relevant if transformers.js wins the runtime comparison.

### 6-7. PWA skills (community only)

- **jwynia/agent-skills `pwa-development`**: description "Implement Progressive Web App features for React and Svelte projects… Keywords: PWA, service worker, offline, manifest, caching, installable, Workbox, vite-pwa." Compatibility "Works with React, Svelte/SvelteKit, Vite, Next.js." MIT, v1.0 ([SKILL.md](https://github.com/jwynia/agent-skills/blob/main/skills/tech/frontend/pwa/pwa-development/SKILL.md)). Repo: 165 stars, pushed 2026-02-24. Last change to the PWA folder: 2026-02-15. A sibling `react-pwa` skill exists in the same folder.
- **alinaqi/maggy `pwa-development`**: "Progressive Web Apps - service workers, caching strategies, offline, Workbox". Includes a "Workbox with Vite" section using `VitePWA` from `vite-plugin-pwa` ([SKILL.md](https://github.com/alinaqi/maggy/blob/main/skills/pwa-development/SKILL.md)). Repo: 707 stars, pushed 2026-09-24. Folder last changed 2026-04-07. **Quality flag:** line 341 says `npm install @vite-pwa/vite-plugin`, while line 919 of the same file says `vite-plugin-pwa`. The plugin's npm name is `vite-plugin-pwa`, so line 341 is wrong (the npm name is from general knowledge and was not re-checked here). The frontmatter also uses non-standard keys (`when-to-use`, `paths`, `effort`).
- Other PWA hits on skills.sh all have under 600 installs and unknown authors (e.g. `curiositech/some_claude_skills/pwa-expert` 520, `agents-inc/skills/web-pwa-service-workers` 86) and were not reviewed ([search pwa](https://skills.sh/api/search?q=pwa), [search vite-pwa](https://skills.sh/api/search?q=vite-pwa)).

### 8-11. Optional / generic

- `ejirocodes/agent-skills` `svelte5-best-practices` has 13,045 installs on skills.sh, but its repo has 6 stars and its last change was 2026-03-03 ([SKILL.md](https://github.com/ejirocodes/agent-skills/blob/main/svelte/skills/svelte5-best-practices/SKILL.md)). It overlaps with the official #1-2. Other Svelte community kits exist, e.g. `spences10/svelte-skills-kit` (93 stars, ~950 installs per skill, mostly SvelteKit) ([search svelte](https://skills.sh/api/search?q=svelte)).
- `wshobson/agents` `typescript-advanced-types` is a generic TS-types skill ([SKILL.md](https://github.com/wshobson/agents/blob/main/plugins/javascript-typescript/skills/typescript-advanced-types/SKILL.md)). No official TypeScript-team skill was found ([search typescript](https://skills.sh/api/search?q=typescript)).
- `vercel-labs/agent-skills` `web-design-guidelines` reviews UI for Web Interface Guidelines compliance ([SKILL.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)). `addyosmani/web-quality-skills` provides accessibility, performance, core-web-vitals, best-practices, seo and web-quality-audit skills, with no PWA skill ([repo](https://github.com/addyosmani/web-quality-skills)). `anthropics/skills` `frontend-design` covers visual design direction ([SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)).

## In-browser LLM runtimes

| Runtime | Skill found? | Evidence |
|---------|--------------|----------|
| transformers.js | Yes: #5 / #5b (official) | see above |
| WebLLM (`mlc-ai/web-llm`) | No | No SKILL.md in the repo tree (424 entries, not truncated) ([tree](https://api.github.com/repos/mlc-ai/web-llm/git/trees/HEAD?recursive=1)). skills.sh `web-llm` hits are unrelated or have under 3 installs (`jonatronblah/skillz/web-llm` 2, `farukerdem34/web-mlc-llm-skills` 1) ([search](https://skills.sh/api/search?q=web-llm)). A third-party directory claims `npx skills add mlc-ai/web-llm-chat`, but that repo is a chat app with no SKILL.md ([tree](https://api.github.com/repos/mlc-ai/web-llm-chat/git/trees/HEAD?recursive=1)). |
| wllama (`ngxson/wllama`) | No | No SKILL.md in the repo tree ([tree](https://api.github.com/repos/ngxson/wllama/git/trees/HEAD?recursive=1)), no skills.sh hit ([search](https://skills.sh/api/search?q=wllama)). `huggingface/skills` `huggingface-local-models` covers llama.cpp/GGUF on CPU/Metal/CUDA servers, not the browser ([SKILL.md](https://github.com/huggingface/skills/blob/main/skills/huggingface-local-models/SKILL.md)). |
| MediaPipe LLM Inference (Web) | No | No SKILL.md in `google-ai-edge/mediapipe-samples`. Google marks the Web API "maintenance-only mode" and recommends migrating to the LiteRT-LM JavaScript API ([guide](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js)). Google's `google-ai-edge/litert-samples` `litert-lm` skill (updated 2026-09-30) targets the **Android Kotlin** API only ([SKILL.md](https://github.com/google-ai-edge/litert-samples/blob/main/skills/litert-lm/SKILL.md)). |

## How install commands were derived

- Source: [vercel-labs/skills README](https://github.com/vercel-labs/skills/blob/main/README.md) (`package.json` version 1.7.0; latest commit 2026-10-05). Syntax: `npx skills add <source> [--skill <name>...] [-a <agent>] [-g] [-y] [--list]`. Project scope is the default, and `-g` installs globally. Accepted sources: `owner/repo`, full GitHub URL, `…/tree/<branch>/<path>` URL, git URL, local path. The source parser also accepts `owner/repo@skill-name` ([source-parser.ts](https://github.com/vercel-labs/skills/blob/main/src/source-parser.ts)). skills.sh shows the shorthand `npx skills add sveltejs/ai-tools/svelte-code-writer`.
- Lock file: project installs record to `skills-lock.json` (`LOCAL_LOCK_FILE = 'skills-lock.json'`, version 1). Entries contain `source`, `sourceType`, optional `ref`/`sourceUrl`, `skillPath` and `computedHash` (a SHA-256 of the skill folder's files) ([local-lock.ts](https://github.com/vercel-labs/skills/blob/main/src/local-lock.ts)). This matches the repo's existing entries (e.g. `mattpocock/skills`, `skills/engineering/code-review/SKILL.md`). So the commands above must run **without `-g`** to land in `skills-lock.json`.
- Discovery: standard containers (`skills/`, `.agents/skills/`, `.claude/skills/`, …, three levels deep) plus `.claude-plugin/marketplace.json`/`plugin.json` manifests. Recursive search happens only if none are found ([README § Skill Discovery](https://github.com/vercel-labs/skills#skill-discovery)).
- Before installing, it is worth running `npx skills add <source> --list` to confirm the skill names. `npx skills find <query>` is the CLI's own search ([README](https://github.com/vercel-labs/skills#skills-find)).

## Unverified points

- No command was executed, so the exact `skillPath` the CLI writes for sveltejs/ai-tools (expected `plugins/claude/svelte/skills/<name>/SKILL.md`) is inferred from the source.
- Whether `npx skills add huggingface/transformers.js` discovers `.ai/skills/transformers-js` through the recursive fallback is also untested.
- Install counts come from `https://skills.sh/api/search`. It is the endpoint the skills.sh site uses, but it is not documented in the CLI README. The counts are a snapshot from 2026-10-06.
- The PWA skills (#6, #7) were skimmed, not fully reviewed. The `vite-plugin-pwa` npm name in the #7 quality flag was not re-checked against npm.

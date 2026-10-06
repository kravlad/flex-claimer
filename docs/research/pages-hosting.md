# GitHub Pages hosting for the PWA and model weights

Research for [#5](https://github.com/kravlab/flex-claimer/issues/5) (child of map #1). Researched 2026-10-06.

**Question.** How do we host a PWA on GitHub Pages (project site under `/<repo>/`) and where can model weights be served from? Covers Pages size/bandwidth limits, service-worker scope and caching on a sub-path, Vite PWA plugin support, Hugging Face (CORS, rate limits, terms) or another free CDN, and whether GitHub Releases/LFS can be used for in-browser downloads.

CORS checks were run with `curl -sI -H 'Origin: https://kravlab.github.io' <url>` on 2026-10-06. The headers shown are what came back. Points that could not be confirmed from a primary source are marked **[unverified]**.

## Summary

| Topic | Finding | Verdict for Flex Claimer |
|---|---|---|
| Pages published site size | At most 1 GB per site [1] | App shell is fine. No room for weights beyond one tiny model |
| Pages bandwidth | *Soft* limit of 100 GB/month. GitHub may email you and suggest a CDN or Releases [1] | Fine for the app (a few MB per visit). About 100 downloads of a 1 GB model would use it all, so **don't serve weights from Pages** |
| Pages source repo / files | Repo: 1 GB recommended. Git blocks files over 100 MiB [1][2]. **Git LFS cannot be used with Pages** [3] | Weights can't be committed into the Pages source |
| Pages deploy | Custom Actions workflow (`upload-pages-artifact` + `deploy-pages`). Artifact tar under 10 GB. 10-minute deploy timeout. The build limit of 10/hour doesn't apply to custom workflows [1][4] | Use the workflow from the Vite docs [5] |
| Custom HTTP headers on Pages | Not supported. GitHub staff said so in 2023 and again in 2024 [6]. Pages sends `access-control-allow-origin: *` and `cache-control: max-age=600` (observed) | Can't set COOP/COEP. If a runtime needs `SharedArrayBuffer` (e.g. multithreaded wasm), add a COI service-worker shim [7][8] |
| SW scope on `/flex-claimer/` | By default the scope is the directory that holds the SW script. It can't be wider without a `Service-Worker-Allowed` header [9][10] | `/flex-claimer/sw.js` with scope `/flex-claimer/` works with no headers. That is the default setup |
| Vite + vite-plugin-pwa | Vite: set `base: '/<REPO>/'` [5]. vite-plugin-pwa 2.0.0 (peer `vite ^3…^8`) takes `base`, `scope` and manifest `start_url`/`scope` from Vite `base` [11][12] | Supported. Set `base: '/flex-claimer/'` and the plugin handles the rest |
| Precaching weights with Workbox | `maximumFileSizeToCacheInBytes` defaults to 2 MiB [13] | Don't precache weights. Download them at runtime when the user asks, into Cache API/OPFS (the runtime's own cache) |
| Hugging Face Hub `/resolve/` | CORS echoes our origin on huggingface.co. The xet CDN hop sends `access-control-allow-origin: *` (observed). Anonymous limit is **3,000 resolver requests per 5 min per IP** [14] | **Recommended source for weights.** Works from the browser without a token |
| HF terms / gating | ToS keeps the model's own license in force [15]. Gated models need an authenticated user [16]. Public storage on Free is "best-effort" [17] | Use only ungated, permissively licensed models. Pin a revision (commit SHA). Optionally mirror into a `kravlab` HF repo |
| GitHub Releases | Up to 1000 assets, each under 2 GiB, and GitHub doesn't limit release bandwidth [18][2] | **Not usable in the browser.** Neither the `github.com/.../releases/download/...` 302 nor the `release-assets.githubusercontent.com` 200 sends any `Access-Control-Allow-Origin` (observed) |
| Git LFS | Free plan: 10 GiB storage and 10 GiB bandwidth per month. Over the bandwidth quota, LFS is turned off until next month [19]. Not usable with Pages [3] | Not suitable |
| jsDelivr | CORS `*`, no bandwidth limits, but packages over 150 MB or GitHub files over 20 MB are "not supported by default" [20] | Not suitable for weights. Fine for small static files |
| Cloudflare R2 | Free tier: 10 GB-month storage and free egress [21]. `r2.dev` URLs are rate-limited and meant for development only [22] | Possible fallback, but production use needs a custom domain on Cloudflare **[unverified for our setup]** |
| Storage on device | Chrome: up to 60% of disk. Safari 17+: origin quota up to 60% [23][24]. Safari deletes script-writable storage after 7 days without interaction, **except** for home-screen web apps [25] | Call `navigator.storage.persist()` and nudge iOS users to install to the Home Screen |

**Recommendation.**
- **App shell**: GitHub Pages project site, built by Vite with `base: '/flex-claimer/'` and vite-plugin-pwa (`generateSW`, default glob `**/*.{js,css,html}` plus icons), deployed by the official Actions workflow.
- **Weights**: fetched at runtime from the Hugging Face Hub `/resolve/<sha>/` URLs, from existing ungated repos (e.g. `mlc-ai/*` for WebLLM) or from our own mirror repo. Cached by the runtime in Cache API/IndexedDB/OPFS. Never served from Pages, Releases or LFS.

---

## 1. GitHub Pages limits

From *GitHub Pages limits* [1] (doc source checked in `github/docs`):

- "Published GitHub Pages sites may be no larger than 1 GB."
- "GitHub Pages source repositories have a recommended limit of 1 GB."
- "GitHub Pages deployments will timeout if they take longer than 10 minutes."
- "GitHub Pages sites have a *soft* bandwidth limit of 100 GB per month."
- "*soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow."
- Rate limiting may return HTTP `429`.
- If quotas are exceeded, "we may not be able to serve your site, or you may receive a polite email ... suggesting strategies ... including putting a third-party content distribution network (CDN) in front of your site, making use of other GitHub features such as releases, or moving to a different hosting service."
- Usage policy: Pages "is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS)." Flex Claimer is a free, non-commercial tool, so this should not apply. Keep it that way.

GitHub's Acceptable Use Policies §9 also allow GitHub to "suspend your Account, throttle your file hosting, or otherwise limit your activity" when bandwidth is "significantly excessive in relation to other users" [26].

Git file limits [2]: Git warns above 50 MiB and "GitHub blocks files larger than 100 MiB". Browser uploads are capped at 25 MiB. Git LFS docs state plainly: "Git LFS cannot be used with GitHub Pages sites." [3]

How much this matters: one small quantized model (e.g. Qwen2.5-0.5B q4f16 in MLC format is about 280 MB in roughly 68 MB shards **[unverified total; one shard measured at 68,067,328 bytes]**) would technically fit under 1 GB. But the 100 GB/month soft bandwidth cap would cover only about 350 downloads. Weights don't belong on Pages.

### Deployment

Custom workflow [4]: `actions/configure-pages` → `actions/upload-pages-artifact` → `actions/deploy-pages`. The deploy job needs `pages: write` and `id-token: write`. The artifact is a gzip of one tar file, which "must be under 10GB in size" and has no symlinks or hard links. Vite's static-deploy guide ships a ready workflow for this (Node LTS, `npm ci`, `npm run build`, upload `./dist`) [5]. A per-file size limit inside the Pages artifact is not documented **[unverified]**.

### Headers

GitHub Pages doesn't let you set custom response headers. GitHub staff in community discussion #54257 said (2023-05-02): "We don't support this feature today so a `meta` tag unfortunately is the only way", and (2024-07-10): "This is not an area that is being prioritized at the moment" [6].

Observed on `https://pages.github.com/`: `access-control-allow-origin: *`, `cache-control: max-age=600`.

Effect on a local LLM: `SharedArrayBuffer` (and shared `WebAssembly.Memory`) needs the page to be cross-origin isolated through COOP and COEP headers [7]. Pages can't send them. The known workaround is a service worker that adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` to responses (e.g. `coi-serviceworker`). It needs one reload on first visit, and cross-origin resources must be CORS/CORP-enabled [8]. HF already sends CORS headers. This matters for multithreaded wasm runtimes such as wllama/llama.cpp-wasm. It doesn't matter for WebGPU-only paths **[runtime-specific requirement unverified; check in the runtime ticket]**. The COI shim has to be merged into our single PWA service worker, because only one SW can control a scope.

## 2. Service-worker scope and caching on a sub-path

- MDN [9]: "The default `scope` for a service worker registration is the directory where the service worker script is located." Also: "A service worker can't have a scope broader than its own location, unless the server specifies a broader maximum scope in a `Service-Worker-Allowed` header."
- W3C Service Workers spec [10]: "Servers can remove the path restriction by setting a Service-Worker-Allowed header on the service worker script." We can't set headers on Pages, so the SW must live at `/flex-claimer/sw.js` with scope `/flex-claimer/`. That is exactly what we want. Other project sites under `kravlab.github.io/*` share the origin but are outside our scope.
- **Shared origin caveat**: all `kravlab.github.io/<repo>/` project sites share one origin. That means Cache API, IndexedDB, OPFS, localStorage and the storage quota are shared with any other kravlab project site. Only the SW scope is per-path (follows from origin-scoped storage [23]). Use distinctive cache/DB names (e.g. prefix `flex-claimer-`). Workbox's `cleanupOutdatedCaches` only deletes Workbox precaches.
- SW updates and Pages' `max-age=600`: the spec's default `updateViaCache` is `"imports"` [10]. MDN says that with `'imports'` "the main script will always be updated from the network" [9]. So the 10-minute HTTP cache on `sw.js` does not delay update checks. vite-plugin-pwa's deployment guide warns against `immutable`/long caching on `/sw.js` [27], which Pages doesn't do anyway.
- SPA routing: Pages only offers a custom `404.html` [28] and has no rewrites. With the SW in place, Workbox `navigateFallback: 'index.html'` (the plugin default [12]) serves navigations offline. For the very first visit, use hash routing or a `404.html` copy of `index.html` **[the 404.html trick is common practice, not documented by GitHub]**.

## 3. Vite and vite-plugin-pwa

- Vite [5]: for `https://<USERNAME>.github.io/<REPO>/`, "set `base` to `'/<REPO>/'`". Latest Vite on npm on 2026-10-06 was 8.3.3 [29].
- vite-plugin-pwa [11][12]: latest npm version is 2.0.0. `peerDependencies`: `vite ^3.1.0 || … || ^8.0.0`, `workbox-build ^7.4.1`, `workbox-window ^7.4.1`. The docs list Svelte and SvelteKit integrations [11].
- Sub-path handling, from source `src/options.ts` [12]:
  - `base = viteConfig.base`
  - `scope = options.scope || basePath`
  - the default manifest has `start_url: basePath` and `scope`
  - `navigateFallback: 'index.html'`
  - `cleanupOutdatedCaches: true`
- The generated `registerSW.js` calls `navigator.serviceWorker.register('${buildBase}${filename}', { scope: '${scope}' })` (`src/html.ts`). With `base: '/flex-claimer/'` this becomes `register('/flex-claimer/sw.js', { scope: '/flex-claimer/' })`, so no extra config is needed.
- Precache defaults: glob `**/*.{js,css,html}`. If you override `globPatterns` you "MUST include all your assets patterns" [30]. Workbox `maximumFileSizeToCacheInBytes` defaults to 2,097,152 bytes [13]. That is a good guard: weights must **not** go in the precache manifest (it would also force them to download at install time, which breaks the "explicit user action" rule). Fetch weights on demand instead, and let the LLM runtime cache them (WebLLM: `cacheBackend` `"cache" | "indexeddb" | "cross-origin" | "opfs"` [31]; transformers.js: `useBrowserCache` uses the Cache API [32]). Any runtime-cached weights must be excluded from SW runtime-caching rules so they aren't stored twice.

## 4. Where to serve weights from

### 4.1 Hugging Face Hub (recommended)

**CORS, observed on 2026-10-06.**

`HEAD https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json` returned `307` with:

```
access-control-allow-origin: https://kravlab.github.io
access-control-expose-headers: X-Repo-Commit,X-Request-Id,X-Error-Code,X-Error-Message,X-Total-Count,ETag,Link,Accept-Ranges,Content-Range,X-Linked-Size,X-Linked-ETag,X-Xet-Hash
access-control-max-age: 86400
ratelimit: "resolvers";r=2999;t=3
ratelimit-policy: "fixed window";"resolvers";q=3000;w=300
x-hf-warning: unauthenticated; ...
```

A large weight shard (`params_shard_0.bin`) returned `302` to `https://us.aws.cdn.hf.co/xet-bridge-us/...` (signed URL). That final hop returned `200`, `content-length: 68067328`, `access-control-allow-origin: *`, `access-control-expose-headers: *`. So a cross-origin `fetch()` from our Pages origin works across the whole redirect chain. `Range` with a single byte range is a CORS-safelisted header, so resumable downloads need no preflight [33]. **[Browser fetch not run in a real browser; inferred from headers.]**

**Rate limits** [14]. The windows are 5-minute fixed windows. Resolvers (any `/resolve/` URL) allow:

- anonymous: 3,000 per IP
- free user: 5,000
- PRO: 12,000

Anonymous/Free values are "subject to change over time depending on platform health". Going over returns `429` plus IETF `RateLimit`/`RateLimit-Policy` headers. A WebLLM model is a few dozen to about 100 files, so one user is far below 3,000 per 5 minutes. Users behind a shared NAT/CGNAT IP share the anonymous bucket **[impact unverified]**. Our code should honour `429` and the `t=` seconds-until-reset value.

**Terms** [15] (ToS last updated 2022-09-15, per the fetched page):
- Content under a "reasonable and customary license" stays under that license, so we must follow each model's license.
- HF may "suspend or terminate" access at its discretion.
- Nothing found that forbids browsers downloading public files directly. The Hub's own JS libraries do exactly this: transformers.js defaults to `remoteHost: 'https://huggingface.co/'` with `remotePathTemplate: '{model}/resolve/{revision}/'` [32], and WebLLM's prebuilt configs point to `huggingface.co` model repos [31].

**Gated models** [16]: "To download files from a gated model you'll need to be authenticated". Users must also have asked for access while logged in. A no-backend PWA can't do that cleanly, so **use only ungated models** (e.g. Llama/Gemma official repos are gated; check each candidate).

**Our own mirror**: free public storage is "best-effort" and should offer "genuine value" beyond the first few GB [17]. The hard file limit is 500 GB and the recommended chunk size is under 200 GB [17]. A `kravlab/…` repo holding our chosen quantized model is feasible and protects us if an upstream repo is deleted or changed. Pin URLs to a commit SHA (`/resolve/<sha>/`), not `main`.

**Runtime support**:
- transformers.js: host is configurable via `env.remoteHost`/`remotePathTemplate`, and `allowLocalModels` defaults to `false` in browsers [32].
- WebLLM: weights come from HF, but compiled model **libraries** (`.wasm`) come from `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/` (`modelLibURLPrefix`, `modelVersion = "v0_2_84/base"`) [31]. `raw.githubusercontent.com` returned `access-control-allow-origin: *` (observed). Those wasm files are small enough (a few MB) to self-host on Pages too.

### 4.2 GitHub Releases (not usable in the browser)

Docs [18]: "Up to 1000 release assets may be associated with a single release. Each file included in a release must be under 2 GiB." From [2]: "We don't limit the total size of the binary files in the release or the bandwidth used to deliver them."

**CORS, observed**: `GET https://github.com/cli/cli/releases/download/v2.60.0/gh_2.60.0_checksums.txt` with `Origin: https://kravlab.github.io` returned:

- `302` from `server: github.com` with **no** `Access-Control-Allow-Origin`
- then `200` from `release-assets.githubusercontent.com` (`server: Windows-Azure-Blob/1.0`) with **no** `Access-Control-Allow-Origin`

A browser `fetch()` will fail CORS. `mode: 'no-cors'` gives an opaque response whose body can't be read, so a runtime can't load it. Releases would only work through a proxy, and we have no backend. Whether the `api.github.com/.../releases/assets/{id}` octet-stream path behaves differently is **[unverified]**; it redirects to the same asset host, so it is expected to fail the same way.

### 4.3 Git LFS (not suitable)

- Not usable with Pages [3].
- Free plan quota is 10 GiB storage and 10 GiB bandwidth. On bandwidth overage "Git LFS support is disabled on your account until the next month" [19]. Ten 1 GB downloads would exhaust it.
- CORS on `media.githubusercontent.com` was not tested (the test URL 404'd; it returned `access-control-allow-origin: *` on the 404) **[unverified for real LFS objects]**. The quota alone rules LFS out.

### 4.4 jsDelivr (not suitable for weights)

The README says "There are no bandwidth limits", but "Packages larger than 150 MB or single files larger than 20 MB (in the case of GitHub) are not supported by default" (a higher limit is possible by opening an issue) [20]. Observed on `cdn.jsdelivr.net/gh/...`: `access-control-allow-origin: *` and `cache-control: public, max-age=604800`. It's useful for small files only.

### 4.5 Cloudflare R2 (fallback)

Free tier: 10 GB-month storage, 1M Class A and 10M Class B ops per month, free egress [21]. However: "Public access through `r2.dev` subdomains is rate-limited and should only be used for development purposes" [22]. Production use needs a custom domain added to Cloudflare, which needs a domain we don't have. CORS is set per bucket **[not researched in detail]**. It's an option if HF becomes unusable.

## 5. On-device storage for downloaded weights

- Chrome/Chromium: "Up to 60% of total disk size" in both best-effort and persistent modes [23].
- Safari (iOS 17+): browser apps get an origin quota "up to 60% of the total disk space". Home Screen web apps get "the same origin quota" [24].
- Safari ITP: "all of a website's script-writable storage" (IndexedDB, LocalStorage, Service Worker registrations, etc.) is deleted after seven days of Safari use without interaction. But "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use" [25]. So iOS users who want weights to persist should install the PWA.
- `navigator.storage.persist()`: Chrome/Edge/Safari approve or deny automatically based on engagement, with no prompt. Firefox shows a prompt [23]. Eviction under storage pressure deletes all of an origin's data at once (LRU over best-effort origins) [23].

## Unverified points

1. No per-file size limit inside a Pages Actions artifact is documented. Only the site's 1 GB and the artifact's 10 GB are.
2. Total size of the example MLC model. Only one shard size was measured.
3. No real-browser `fetch()` test of the HF redirect chain; the conclusion is inferred from headers.
4. Effect of the anonymous HF rate limit on users who share one IP (CGNAT).
5. `api.github.com` release-asset download path CORS, and LFS `media.githubusercontent.com` CORS for real objects.
6. Which candidate runtimes need `SharedArrayBuffer`/COOP+COEP. Defer to the runtime ticket.
7. The SPA `404.html` fallback trick isn't documented by GitHub.
8. R2 custom-domain and CORS setup details.

## Sources

1. GitHub Pages limits — https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (source: https://github.com/github/docs/blob/main/content/pages/getting-started-with-github-pages/github-pages-limits.md)
2. About large files on GitHub — https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
3. About Git Large File Storage — https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage
4. Using custom workflows with GitHub Pages — https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
5. Vite: Deploying a static site (GitHub Pages) — https://vite.dev/guide/static-deploy.html
6. GitHub community discussion #54257 (staff replies 2023-05-02, 2024-07-10) — https://github.com/orgs/community/discussions/54257
7. MDN SharedArrayBuffer security requirements — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
8. T. Steiner, "Setting the COOP and COEP headers on static hosting like GitHub Pages" (2025-03-08) — https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/ (secondary; describes `coi-serviceworker`)
9. MDN ServiceWorkerContainer.register() — https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
10. W3C Service Workers spec — https://w3c.github.io/ServiceWorker/ (`updateViaCache = "imports"` default; `Service-Worker-Allowed`)
11. vite-plugin-pwa guide — https://vite-pwa-org.netlify.app/guide/
12. vite-plugin-pwa source — https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/options.ts , https://github.com/vite-pwa/vite-plugin-pwa/blob/main/src/html.ts , https://github.com/vite-pwa/vite-plugin-pwa/blob/main/package.json ; npm https://registry.npmjs.org/vite-plugin-pwa/latest
13. Workbox `workbox-build` options (`maximumFileSizeToCacheInBytes`) — https://developer.chrome.com/docs/workbox/modules/workbox-build
14. Hugging Face Hub rate limits — https://huggingface.co/docs/hub/rate-limits
15. Hugging Face Terms of Service — https://huggingface.co/terms-of-service
16. Hugging Face gated models — https://huggingface.co/docs/hub/models-gated
17. Hugging Face storage limits — https://huggingface.co/docs/hub/storage-limits
18. About releases — https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
19. Git LFS billing — https://docs.github.com/en/billing/concepts/product-billing/git-lfs
20. jsDelivr README (Restrictions) — https://github.com/jsdelivr/jsdelivr#restrictions
21. Cloudflare R2 pricing — https://developers.cloudflare.com/r2/pricing/
22. Cloudflare R2 public buckets — https://developers.cloudflare.com/r2/buckets/public-buckets/
23. MDN Storage quotas and eviction criteria — https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
24. WebKit, "Updates to Storage Policy" — https://webkit.org/blog/14403/updates-to-storage-policy/
25. WebKit, "Full Third-Party Cookie Blocking and More" (7-day cap, home-screen exemption) — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
26. GitHub Acceptable Use Policies §9 — https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies
27. vite-plugin-pwa deployment — https://vite-pwa-org.netlify.app/deployment/
28. Custom 404 page for GitHub Pages — https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site
29. npm registry, vite latest — https://registry.npmjs.org/vite/latest
30. vite-plugin-pwa static assets — https://vite-pwa-org.netlify.app/guide/static-assets.html
31. WebLLM `src/config.ts` — https://github.com/mlc-ai/web-llm/blob/main/src/config.ts
32. transformers.js `env.js` — https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/env.js
33. MDN Range header (CORS-safelisted for a single range) — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Range

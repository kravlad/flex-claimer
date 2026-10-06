# Research: `mailto:` handoff limits on Android and iOS (issue #4)

Researched 2026-10-06 for [#4](https://github.com/kravlab/flex-claimer/issues/4) (child of map #1).

Question: what are the practical limits of handing a generated complaint to the user's mail client via `mailto:` from a PWA (Android Chrome, iOS Safari, installed home-screen PWAs), and is the Web Share API a viable alternative?

Trust labels used below:

- **[primary]**: spec, platform documentation, or browser/OS source code.
- **[community]**: forum posts, bug threads, blogs. Lower trust; often old and/or desktop-only.
- **[inference]**: my reasoning from primary sources, not tested on a device.
- **[unverified]**: no source found; needs a device test.

## Summary

| Topic | Finding | Trust |
|---|---|---|
| Fields defined by the standard | `to` (path + `to=`), `cc`, `bcc`, `subject`, `body` are all expressible; RFC 6068 only says `subject` and `body` are "safe and useful in the general case". Clients must ignore `From`, routing and MIME headers. | primary |
| iOS Mail fields | Apple documents `to`, `cc`, `bcc`, `subject`, `body`; `from` is ignored. | primary (archived doc) |
| Android fields | Chrome turns `mailto:` into `ACTION_VIEW` with the whole URI as intent data. Each mail app parses the URI itself, so field support is per app. | primary (Chromium source) |
| Gmail / Outlook / Samsung Email field support | No first-party docs. Outlook Android had a 2019 regression that dropped subject/body. Nothing reliable found for Samsung Email. | community / unverified |
| Hard URL length cap, Android | Chrome caps URLs at 2 MB. The Android Binder buffer is 1 MB, shared by the whole process. In practice the cap is set by the receiving app, not by the platform. | primary (caps); inference (practical cap) |
| Hard URL length cap, iOS | No published limit for Safari/WebKit or for Mail's `mailto:` parsing. | unverified |
| Real-world length guidance | All the numbers found are old desktop figures: about 2,000 chars (Outlook/IE), 2,083 (Apple Mail + Safari), about 1,620 to 4,096 (Gmail **web**). A 2025 project hit failures above about 4k chars with Gmail web. No mobile numbers were found. | community |
| Newlines | RFC 6068 requires `%0D%0A`. iOS 14.6 Mail turned `%0D%0A` into literal `<BR>`. Apple says it fixed this in an iOS 15 beta, but reports of the bug continue into iOS 15.6.1 (2022). Plain-text bodies only: rich/HTML bodies were removed in iOS 14.6. | primary (RFC); community (iOS) |
| Unicode | UTF-8, then percent-encode every byte (`encodeURIComponent` does this). Don't use `+` for spaces. | primary |
| User gesture | Start the handoff from a click/tap. Without transient activation, Chrome Android shows a prompt instead of launching the app, and the HTML spec says UAs should not launch external software without confirmation. | primary |
| Installed PWA, Android | WebAPKs and the Chrome tab use the same `ExternalNavigationHandler`, so `mailto:` launches the default mail app (or a chooser). | primary (source) + inference |
| Installed PWA, iOS | Broken in iOS 12 standalone mode, working since iOS 13 per community reports. No current WebKit bug found. Use same-window navigation (`location.href` or a plain `<a href>`), not `window.open`. | community |
| Web Share API as replacement | **Not a full replacement.** It cannot set To/CC/BCC. The user picks the target app in the share sheet. Android maps `title` to `EXTRA_SUBJECT` and `text` to `EXTRA_TEXT`. iOS (WebKit) passes **no subject**: `title` becomes link-preview metadata only when a `url` is shared. Good as a fallback for long bodies, together with "copy to clipboard". | primary (Chromium + WebKit source, W3C spec) |

**Recommendation for Flex Claimer (inference):** use `mailto:` with To, CC, subject and body, fired from a user tap with a same-window navigation. Build it with `encodeURIComponent` after normalising newlines to `\r\n`. Keep the **whole encoded URL** under a conservative budget, about 2,000 characters. If the encoded URL goes over that budget, or as an option at any time, offer "Copy body" plus a short `mailto:` (recipients + subject only). Offer `navigator.share({ text })` as an extra option, never as the main path, since it loses the recipients. Test on real devices with each target client before choosing the final budget (see "Open questions").

## 1. What the standard says (RFC 6068)

Source: [RFC 6068](https://www.rfc-editor.org/rfc/rfc6068) **[primary]**

- Syntax: `mailto:addr1,addr2?hfname=hfvalue&...`. Any header field name may appear, plus the special `body`.
- §3: originator fields (`From`, `Date`), routing/trace fields and MIME header fields "MUST be ignored" when present in the URI.
- §4: "Only a limited set of header fields such as Subject and Keywords, as well as Body, are believed to be both safe and useful in the general case." `cc` and `bcc` are defined header fields but are not singled out as "safe". In practice the major clients document or support them (see §2).
- §5: "line breaks in the body of a message MUST be encoded with `%0D%0A`". Implementations may add a final line break.
- §2: non-ASCII characters "MUST first be encoded according to UTF-8, and then each octet ... MUST be percent-encoded."
- §7: clients "SHOULD NOT send a message based on a 'mailto' URI without first disclosing and showing to the user the full message". In other words, `mailto:` always opens a compose screen and never sends silently. That suits our "user reviews and sends" flow.
- The RFC states **no length limit**.

## 2. Supported fields per platform/client

### iOS

- Apple's (archived) URL scheme reference lists `to`, `cc`, `bcc`, `subject`, `body`, and notes that "`from` is ignored". Example: `mailto:foo@example.com?cc=bar@example.com&subject=...&body=...` ([Apple: Mail Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MailLinks/MailLinks.html)) **[primary, archived/old]**.
- Since iOS 14 users can choose a default mail app. iOS then opens `mailto:` links in that app (Gmail, Outlook, ...). Apple's `com.apple.developer.mail-client` entitlement says "The system launches the default mail client in iOS whenever a user opens a `mailto:` link". Its criteria cover sending and receiving mail, but **say nothing about parsing cc/subject/body** ([Apple: com.apple.developer.mail-client](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.mail-client)) **[primary]**. Field support in Gmail iOS and Outlook iOS therefore depends on the app. A Microsoft Q&A thread from 2019 says Outlook iOS handled subject/body correctly at that time ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4528039/android-outlook-app-version-3-0-34-mailto-links-do?forum=msoffice-msoffice_outlook-mso_amobile-mso_mobapps)) **[community]**.
- Gmail iOS / Outlook iOS cc/bcc support today: **[unverified]**.

### Android

- Chrome for Android's `ExternalNavigationHandler.shouldOverrideUrlLoading` builds `new Intent(Intent.ACTION_VIEW)` and calls `setData(Uri.parse(url.getSpec()))` for non-`intent:` external schemes. The **entire `mailto:` URI is handed to the mail app**, and the mail app parses the fields itself ([Chromium ExternalNavigationHandler.java](https://chromium.googlesource.com/chromium/src/+/HEAD/components/external_intents/android/java/src/org/chromium/components/external_intents/ExternalNavigationHandler.java)) **[primary]**.
- For comparison, Android's native API for composing mail uses `ACTION_SENDTO` + `mailto:` with `EXTRA_EMAIL`, `EXTRA_CC`, `EXTRA_BCC`, `EXTRA_SUBJECT`, `EXTRA_TEXT` ([Android: Common intents, Email](https://developer.android.com/guide/components/intents-common#Email)) **[primary]**. A web page cannot set these extras through a `mailto:` link. Its only channel is the URI query string.
- **Gmail Android:** no first-party documentation of `mailto:` query parsing. Community guides say cc/bcc and long bodies are the common failure modes on mobile and advise keeping bodies short ([MailSlurp mailto guide](https://www.mailslurp.com/blog/mailto-links-explained/)) **[community, vague]**. Exact support: **[unverified]**.
- **Outlook Android:** versions 3.0.34 and 3.0.40 (March 2019) stopped filling subject/body (and in some reports `to`) from `mailto:`. Users called it a regression. There was no confirmed fix date in the thread ([Microsoft Q&A, 2019](https://learn.microsoft.com/en-us/answers/questions/4528039/android-outlook-app-version-3-0-34-mailto-links-do?forum=msoffice-msoffice_outlook-mso_amobile-mso_mobapps)) **[community]**. Current behaviour: **[unverified]**.
- **Samsung Email:** no primary or credible community source found on `mailto:` field handling. **[unverified]**
- Thunderbird/K-9 (not a target, but the same pattern): HTML in `body` is shown as literal text ([thunderbird-android#4151](https://github.com/thunderbird/thunderbird-android/issues/4151)) **[community]**. Treat `body` as plain text everywhere.

## 3. Length limits

### Hard platform caps [primary]

- **Chrome:** "Chrome limits URLs to a maximum length of 2MB for practical reasons and to avoid causing denial-of-service problems in inter-process communication" ([Chromium URL display guidelines](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/security/url_display_guidelines/url_display_guidelines.md)). Constant `url::kMaxURLChars = 2 * 1024 * 1024`.
- **Android Binder:** "The Binder transaction buffer has a limited fixed size, currently 1MB, which is shared by all transactions in progress for the process" ([AOSP TransactionTooLargeException.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/os/TransactionTooLargeException.java)). The intent data URI travels through Binder. Strings in a Parcel are UTF-16, so the effective ceiling is roughly ≤ 500k URI characters, minus overhead **[inference]**. Far above anything a complaint needs.
- **iOS / WebKit:** no documented URL length cap for `mailto:` handoff found. **[unverified]**

### Practical (client) limits [community, mostly desktop and old]

- 2013 tests: Outlook + IE9/Firefox/Chrome 2,046 chars; Windows 8 Mail 2,083; **Apple Mail + Safari 2,083**; Gmail (web) + Firefox about 1,620 "usually worked". The author notes "there is not one single limitation ... the character limit differs from browser and mail client". No mobile clients were tested ([superruub, 2013](https://superruub.wordpress.com/2013/05/30/mailto-protocol-character-limit/)).
- 2012: "approximately 2000 characters" across platforms, tested on Outlook ([Growing with the Web, 2012](https://www.growingwiththeweb.com/2012/07/getting-around-mailto-character-limit.html)).
- 2025: the MAPLE project saw failures with long `mailto:` bodies. It cites about 4,096 chars for Gmail (whole encoded URL including recipients and subject) and an HTTP 400 at about 8,000 chars, and planned a warning at 2,500 body chars ([codeforboston/maple#1964](https://github.com/codeforboston/maple/issues/1964)). The HTTP 400 means this was **Gmail web** (the `mailto:` turned into an HTTPS GET to Google's servers), not the Gmail Android/iOS app **[inference]**.
- **No mobile-app-specific numbers found** for Gmail, Outlook or Samsung Email on Android, or for Mail, Gmail or Outlook on iOS. **[unverified]**

Takeaway **[inference]**: the platform caps are huge. Mail apps, and Gmail web (relevant if a user's browser forwards `mailto:` to webmail), are the real limit, and none of them publish a number. About 2,000 encoded characters is the only budget the old evidence supports across clients. Each UTF-8 byte of non-ASCII text becomes 3 URL chars (e.g. `é` → `%C3%A9` = 6 chars; `—` → 9 chars), and spaces and newlines also expand to 3 or 6 chars, so measure the **encoded** length. Our complaint is English, which helps.

## 4. Encoding

- **Newlines.** The RFC requires `%0D%0A` ([RFC 6068 §5](https://www.rfc-editor.org/rfc/rfc6068)) **[primary]**. `encodeURIComponent("\n")` gives `%0A`, so normalise with `body.replace(/\r?\n/g, "\r\n")` before encoding.
  - iOS 14.6 Mail: `%0D%0A` showed up as a literal `<BR>`. An Apple engineer said "Support for rich content, such as HTML, has been removed for mailto links from iOS 14.6+". Workarounds reported: `%0A` only; using Outlook/Gmail. Apple later told one reporter that build 19A5318f (an iOS 15 beta) resolved it (FB9383355). Others still saw the bug in iOS 15 and 15.6.1, as late as Sept 2022 ([Apple Developer Forums thread 681023](https://developer.apple.com/forums/thread/681023), [page 2](https://developer.apple.com/forums/thread/681023?page=2)) **[community, includes Apple staff replies]**.
  - Current iOS (18 to 27) behaviour with `%0D%0A` vs `%0A`: **[unverified]**. Device test needed. If `%0D%0A` misbehaves, fall back to `%0A` on iOS.
- **Unicode.** UTF-8, then percent-encode each octet ([RFC 6068 §2](https://www.rfc-editor.org/rfc/rfc6068)) **[primary]**. `encodeURIComponent` does exactly this and also escapes `&`, `=`, `?`, `#` and `+`. Never use `URLSearchParams`/form encoding: it turns spaces into `+`, which RFC 6068 doesn't decode as a space **[inference from RFC 6068 percent-encoding rules]**.
- **Addresses.** Multiple `to`/`cc` addresses are comma-separated. Apple's example puts `cc=` in the query string ([Apple: Mail Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MailLinks/MailLinks.html)) **[primary]**.
- **Body format.** Plain text only. iOS 14.6+ removed HTML support ([Apple Forums 681023](https://developer.apple.com/forums/thread/681023)), and K-9/Thunderbird show HTML as literal text ([#4151](https://github.com/thunderbird/thunderbird-android/issues/4151)).

## 5. Behaviour from a page vs an installed PWA

### User activation (both platforms)

- HTML Standard, "hand-off to external software": "if hasTransientActivation is false, then the user agent should not invoke the external software package without prior user confirmation". Sandboxed iframes need `allow-popups`/`allow-top-navigation*` flags ([WHATWG HTML §7.4.2.3.4](https://html.spec.whatwg.org/multipage/browsing-the-web.html#hand-off-to-external-software)) **[primary]**.
- Chrome Android: a renderer-initiated navigation chain with no user gesture returns `REQUIRES_PROMPT` (the user sees a confirmation instead of the app launching). Chains expire after `NAVIGATION_CHAIN_TIMEOUT_MILLIS = 15000` ms, and subframes without a gesture are blocked ([ExternalNavigationHandler.java](https://chromium.googlesource.com/chromium/src/+/HEAD/components/external_intents/android/java/src/org/chromium/components/external_intents/ExternalNavigationHandler.java), [RedirectHandler.java](https://chromium.googlesource.com/chromium/src/+/HEAD/components/external_intents/android/java/src/org/chromium/components/external_intents/RedirectHandler.java), [external_intents README](https://chromium.googlesource.com/chromium/src/+/HEAD/components/external_intents/README.md)) **[primary]**.
- **Implication:** fire the `mailto:` navigation directly in the tap handler. Don't fire it after the LLM finishes generating (that can take many seconds, well past the 15 s chain timeout and outside the activation window). Show a "Open in mail app" button once the text is ready **[inference]**.

### Android installed PWA (WebAPK)

- WebAPKs run in Chrome and use the same `external_intents` component. `mailto:` resolves through `ACTION_VIEW` to the default mail app, or shows the system chooser **[inference from source; device test recommended]**.

### iOS home-screen web app

- iOS 12: in standalone mode `<a href="mailto:">` did nothing; the workaround was `window.location.href = "mailto:..."` in a click handler. Reported "works correctly" on iOS 13+ ([PWA-POLICE/pwa-bugs#15](https://github.com/PWA-POLICE/pwa-bugs/issues/15)) **[community]**.
- iOS 17.4 beta (EU) briefly opened home-screen apps in Safari tabs instead of standalone. Fixed in the 17.4 release ([WebKit bug 268643](https://bugs.webkit.org/show_bug.cgi?id=268643)) **[primary bug tracker]**. This affected standalone mode in general, not `mailto:`.
- Community reports say `window.open` / `target=_blank` from standalone apps is unreliable on iOS ([Apple Forums 691529](https://developer.apple.com/forums/thread/691529)) **[community]**. Use same-window navigation for `mailto:`.
- If no Mail app is installed, iOS shows a warning ([Apple: Mail Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MailLinks/MailLinks.html)) **[primary]**. The user can also pick another default mail app (iOS 14+).
- Current iOS standalone `mailto:` behaviour: no open WebKit bug found. **[unverified, needs device test]**

## 6. Web Share API as an alternative

Spec: [W3C Web Share API](https://w3c.github.io/web-share/) **[primary]**

- `ShareData` has `title`, `text`, `url`, `files`. **There is no way to set recipients.** The UA shows a picker and the user chooses the target. `title` "May be ignored by the target".
- Requires a secure context and transient activation (otherwise `NotAllowedError`). Gated by the `web-share` permissions policy (default `self`) ([MDN: Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)).
- Support: Chrome Android 61+, Safari iOS 12.2+ ([MDN browser-compat-data](https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Navigator.share.json)) **[primary]**.

What the mail app receives:

- **Android (Chrome):** `ShareHelper.getShareIntent` sends `ACTION_SEND` with `EXTRA_TEXT = text + url` and `EXTRA_SUBJECT = title` (when it differs from the text). It never sets `EXTRA_EMAIL` or `EXTRA_CC` ([Chromium ShareHelper.java](https://chromium.googlesource.com/chromium/src/+/HEAD/components/browser_ui/share/android/java/src/org/chromium/components/browser_ui/share/ShareHelper.java)) **[primary]**. Gmail is therefore likely to prefill subject + body with empty recipients **[inference]**. The extras go through Binder (1 MB buffer), so body length is effectively unlimited for our use.
- **iOS (WebKit):** `WKShareSheet presentWithParameters` adds `text` as an `NSString` activity item. It adds `url` with `title` only as `LPLinkMetadata` (link preview). `title` is added as plain text only when there's no text and no url. There is **no `subjectForActivityType:`**, so Mail gets no explicit subject ([WebKit WKShareSheet.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Cocoa/WKShareSheet.mm)) **[primary]**. web.dev's "title might become the email subject" ([web.dev: Web Share](https://web.dev/articles/web-share)) is therefore **not** something to rely on for iOS. Whether Mail uses link-metadata title as subject when a `url` is shared: **[unverified]**.

Verdict **[inference]**: Web Share can't do a "full email" handoff, because it loses To/CC and the subject on iOS and needs extra taps in the share sheet. It does carry long text reliably. Use it as an optional fallback ("Share text…") next to "Copy to clipboard", for when the `mailto:` URL is over budget or the user's mail app drops fields.

## 7. Open questions / need device testing

All **[unverified]**. They should become a short manual test matrix (one long ASCII body of about 1k/2k/4k/8k encoded chars, with To + 2×CC + subject + multi-paragraph body, plus a smart quote and an em dash):

1. Gmail, Outlook and Samsung Email on Android: do `cc`/`bcc` populate, and at what encoded length does the body truncate or the launch fail?
2. Mail, Gmail and Outlook on iOS (as default mail app): the same questions, plus `%0D%0A` vs `%0A` rendering on current iOS.
3. iOS home-screen PWA: does a same-window `location.href = mailto:` from a tap open Mail and keep the PWA state?
4. iOS Web Share to Mail with `{title, text}`: is the subject filled?
5. Behaviour when Chrome/Android routes `mailto:` to Gmail **web** (no mail app installed). That path inherits the about 4k URL / HTTP 400 limit.

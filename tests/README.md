# Tests

From the repository root, with Node 22:

```sh
node --test
```

This runs the template rendering, field visibility, and required field detection tests using the
vendored Handlebars library, without installing npm dependencies.

Browser checks use Python 3 and Playwright. Install Playwright in a virtual
environment (`python -m pip install playwright`) and provide Chromium: the runner
uses system `chromium` or `chromium-browser` when available, otherwise install
Playwright's browser with `python -m playwright install chromium`.

Build the current sources before each browser run:

```sh
node scripts/build.mjs
python3 tests/optional-fields.browser.py
```

The browser suite loads the built HTML through a local Playwright route; it needs
no server or external network access. Each test gets fresh browser storage. It
checks default templates, template editing/reset/persistence, conditions and
comments, required field validation, hidden values, manual drafts, time field
layout, and the Russian mobile form. Template syntax is documented in
[template-fields.md](../docs/template-fields.md). It generates no email and sends nothing.

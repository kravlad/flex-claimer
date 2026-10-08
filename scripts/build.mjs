// Builds dist/index.html (run with `mise run build`): src/index.html with every <script src> inlined, and the
// data from config.json, translations/ru.json and templates/*.md inlined in place of data.js. The result is
// one self-contained file, so it works from a server, from disk, and in sandboxed browsers that can open
// only the file itself (a Flatpak browser gets the file through the document portal, without its folder).
//
// config.json
//   recipients.support / recipients.jeff — fixed recipient: `address`, and `checked` (selected when the page opens).
//   issueTypes — issue type keys in the order shown in the "Issue type" list; each one is templates/<key>.md.
//   emailText — text the page adds around the template:
//     missingDate       substituted for {{date}} / {{block}} when no date is entered
//     overnight         appended to {{block}} as " (…)" when the end time is earlier than the start time
//     endingAt          appended to {{block}} as " (… <end time>)" when only the end time is entered
//     stationLabel      appended as "<stationLabel> <station>" when the template has no {{station}}
//     detailsLabel      appended above the details when the template has no {{details}}
//     unknownStartTime  appended when the block start time is not entered
//     signoff           appended (followed by the name) when the template has no {{name}}
//
// translations/ru.json — Russian UI translations. English is the default language; keys are the English UI strings.
//
// templates/<key>.md — front matter with one `key: value` per line, then the email body:
//   ---
//   label: Issue type name shown in the list
//   hint: Help text shown under the list
//   subject: Email subject template
//   ---
//   Email body template…
// Front matter values are taken as is (no YAML quoting). label and hint are UI text: add their
// translations to translations/ru.json. Template syntax is described in src/templating.js.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = path.join(root, 'templates');
const sourceFile = path.join(root, 'src', 'index.html');
const outputFile = path.join(root, 'dist', 'index.html');
const fields = ['label', 'hint', 'subject'];
const emailTextKeys = ['missingDate', 'overnight', 'endingAt', 'stationLabel', 'detailsLabel', 'unknownStartTime', 'signoff'];

// Load the same scripts the page uses, so templates are checked by the page's own rules.
const context = vm.createContext({});
context.window = context;
for (const file of ['vendor/handlebars.min.js', 'src/templating.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
}
const {check} = context.FlexTemplating;

const errors = [];
const warnings = [];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return null;
  }
}

function checkConfig(config) {
  for (const key of ['support', 'jeff']) {
    const recipient = config.recipients?.[key];
    if (typeof recipient?.address !== 'string' || !recipient.address) errors.push(`config.json: recipients.${key}.address must be a non-empty string`);
    if (typeof recipient?.checked !== 'boolean') errors.push(`config.json: recipients.${key}.checked must be true or false`);
  }
  if (!Array.isArray(config.issueTypes) || !config.issueTypes.length || !config.issueTypes.every(key => typeof key === 'string')) {
    errors.push('config.json: issueTypes must be a non-empty list of strings');
    config.issueTypes = [];
  }
  for (const key of emailTextKeys) {
    if (typeof config.emailText?.[key] !== 'string' || !config.emailText[key]) errors.push(`config.json: emailText.${key} must be a non-empty string`);
  }
}

function checkTranslations(ru) {
  if (!ru || typeof ru !== 'object' || Array.isArray(ru)) errors.push('translations/ru.json: must be an object of "English": "Russian" strings');
  else for (const [key, value] of Object.entries(ru)) {
    if (typeof value !== 'string') errors.push(`translations/ru.json: the translation of "${key}" must be a string`);
  }
}

function parseTemplate(file, ru) {
  const text = fs.readFileSync(path.join(templatesDir, file), 'utf8').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    errors.push(`${file}: expected front matter between two "---" lines at the top of the file`);
    return null;
  }
  const template = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const field = line.match(/^(\w+):(.*)$/);
    if (!field) errors.push(`${file}: front matter line is not "key: value": ${line}`);
    else if (!fields.includes(field[1])) errors.push(`${file}: unknown front matter key "${field[1]}" (expected ${fields.join(', ')})`);
    else template[field[1]] = field[2].trim();
  }
  for (const key of fields) if (!template[key]) errors.push(`${file}: "${key}" is missing or empty`);
  template.body = match[2].trim();
  if (!template.body) errors.push(`${file}: the email body is empty`);
  for (const key of ['subject', 'body']) {
    const problem = template[key] && check(template[key]);
    if (problem) errors.push(`${file}: ${key}: ${problem.message}${problem.detail}`);
  }
  for (const key of ['label', 'hint']) {
    if (template[key] && ru && !(template[key] in ru)) warnings.push(`${file}: ${key} has no Russian translation in translations/ru.json`);
  }
  return template;
}

const config = readJson('config.json');
const ru = readJson('translations/ru.json');
if (config) checkConfig(config);
if (ru) checkTranslations(ru);

const templates = {};
if (config) {
  const files = fs.readdirSync(templatesDir).filter(file => file.endsWith('.md'));
  for (const file of files) {
    if (!config.issueTypes.includes(file.slice(0, -3))) errors.push(`${file}: not listed in issueTypes in config.json`);
  }
  for (const key of config.issueTypes) {
    if (!files.includes(`${key}.md`)) errors.push(`templates/${key}.md: missing (listed in issueTypes in config.json)`);
    else templates[key] = parseTemplate(`${key}.md`, ru);
  }
}

// Replaces each <script src="…"></script> in src/index.html with an inline script. "data.js" is the
// generated data; other paths are files relative to src/. `<` in the data is written as <, so no
// template text can close the script element; a script file that contains "</script" or "<!--" is an error.
function inlineScripts(html, data) {
  let count = 0;
  const output = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    count++;
    if (src === 'data.js') {
      const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
      return `<script>\n// Generated by scripts/build.mjs from config.json, translations/ru.json and templates/*.md.\nwindow.FLEX_CLAIMER_DATA = ${json};\n</script>`;
    }
    const file = path.join(root, 'src', src);
    if (!fs.existsSync(file)) {
      errors.push(`src/index.html: script "${src}" not found`);
      return '';
    }
    const code = fs.readFileSync(file, 'utf8');
    if (/<\/script|<!--/i.test(code)) errors.push(`src/index.html: script "${src}" contains "</script" or "<!--" and cannot be inlined`);
    return `<script>\n// ${path.relative(root, file)}\n${code.trimEnd()}\n</script>`;
  });
  if (!count) errors.push('src/index.html: no <script src="…"></script> found');
  return output;
}

const page = errors.length ? '' : inlineScripts(fs.readFileSync(sourceFile, 'utf8'), {config, translations: {ru}, templates});

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(outputFile), {recursive: true});
fs.writeFileSync(outputFile, page.replace(/<!-- `mise run build` inlines[\s\S]*?-->\n\s*/,
  '<!-- Generated by scripts/build.mjs from src/index.html: edit the sources and run `mise run build`. -->\n  '));
console.log(`dist/index.html: ${Object.keys(ru).length} translations, ${config.issueTypes.length} templates, scripts inlined`);

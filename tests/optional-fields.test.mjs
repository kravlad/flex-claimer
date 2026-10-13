import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const context = vm.createContext({});
context.window = context;
for (const file of ['vendor/handlebars.min.js', 'src/templating.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
}

const cases = [
  ['no optional variables', 'Request for {{date}}', 'Hello support.', []],
  ['start only', '{{start}}', 'Hello support.', ['start']],
  ['end only', 'Request', '{{end}}', ['end']],
  ['station only', 'Request', '{{station}}', ['station']],
  ['name only', '{{name}}', 'Hello support.', ['name']],
  ['details only', 'Request', '{{details}}', ['details']],
  ['block includes both times', 'Request', '{{block}}', ['start', 'end']],
  ['subject and body are combined without duplicates', '{{name}} {{start}}', '{{name}} {{station}}', ['start', 'station', 'name']],
  ['conditional variable without interpolation', 'Request', '{{#unless start}}Time unknown.{{/unless}}', ['start']],
  ['nested conditions and both branches', 'Request', '{{#if station}}{{#unless name}}{{end}}{{else}}{{details}}{{/unless}}{{else}}{{start}}{{/if}}', ['start', 'end', 'station', 'name', 'details']],
  ['conditional block includes both times', '{{#if block}}Request{{/if}}', 'Hello support.', ['start', 'end']],
  ['comments are ignored', '{{! Ignore {{start}} }}', '{{!-- {{station}} {{block}} --}}', []],
  ['escaped expressions are literal text', 'Request', '\\{{station}}', []],
  ['whitespace and unescaped interpolation', 'Request', '{{ name }} {{{details}}}', ['name', 'details']],
];
for (const [name, subject, body, expected] of cases) {
  test(name, () => {
    assert.equal(typeof context.FlexTemplating.optionalFields, 'function', 'Optional field detection is not implemented');
    assert.deepEqual(Array.from(context.FlexTemplating.optionalFields(subject, body)), expected);
  });
}

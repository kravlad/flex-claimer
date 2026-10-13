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
  ['no variables', 'Request', 'Hello support.', [], []],
  ['optional date', 'Request for {{date}}', 'Hello support.', ['date'], []],
  ['start only', '{{start}}', 'Hello support.', ['start'], []],
  ['end only', 'Request', '{{end}}', ['end'], []],
  ['station only', 'Request', '{{station}}', ['station'], []],
  ['name only', '{{name}}', 'Hello support.', ['name'], []],
  ['details only', 'Request', '{{details}}', ['details'], []],
  ['block includes date and both times', 'Request', '{{block}}', ['date', 'start', 'end'], []],
  ['subject and body are combined without duplicates', '{{name}} {{start}}', '{{name}} {{station}}', ['start', 'station', 'name'], []],
  ['conditional variable without interpolation', 'Request', '{{#unless start}}Time unknown.{{/unless}}', ['start'], []],
  ['nested conditions and both branches', 'Request', '{{#if station}}{{#unless name}}{{end}}{{else}}{{details}}{{/unless}}{{else}}{{start}}{{/if}}', ['start', 'end', 'station', 'name', 'details'], []],
  ['conditional block includes date and both times', '{{#if block}}Request{{/if}}', 'Hello support.', ['date', 'start', 'end'], []],
  ['comments are ignored', '{{! Ignore {{req:date}} }}', '{{!-- {{station}} {{req:block}} --}}', [], []],
  ['escaped expressions are literal text', 'Request', '\\{{req:station}}', [], []],
  ['whitespace and unescaped interpolation', 'Request', '{{ name }} {{{details}}}', ['name', 'details'], []],
  ['required date', '{{req:date}}', 'Hello support.', ['date'], ['date']],
  ['required block requires all its fields', 'Request', '{{req:block}}', ['date', 'start', 'end'], ['date', 'start', 'end']],
  ['required wins across subject and body', '{{date}}', '{{req:date}} {{date}}', ['date'], ['date']],
  ['one required time leaves other block fields optional', '{{req:start}}', '{{block}}', ['date', 'start', 'end'], ['start']],
  ['required condition parameter', 'Request', '{{#if req:station}}Known station.{{/if}}', ['station'], ['station']],
  ['required marker in an inverse branch', 'Request', '{{#if name}}{{name}}{{else}}{{req:details}}{{/if}}', ['name', 'details'], ['details']],
];
for (const [name, subject, body, visible, required] of cases) {
  test(name, () => {
    assert.equal(typeof context.FlexTemplating.fields, 'function', 'Template field rules are not implemented');
    const actual = context.FlexTemplating.fields(subject, body);
    assert.deepEqual(Array.from(actual.visible), visible);
    assert.deepEqual(Array.from(actual.required), required);
  });
}

const data = {date: 'October 1, 2026', start: '9:00 AM', end: '1:00 PM',
  block: 'October 1, 2026, 9:00 AM–1:00 PM', station: 'TEST1', name: 'Test Driver', details: 'A & B'};
for (const key of context.FlexTemplating.variables) {
  test(`required ${key} is accepted and renders the same value as the plain variable`, () => {
    const source = `{{${key}}} | {{req:${key}}}`;
    assert.equal(context.FlexTemplating.check(source), null);
    assert.equal(context.FlexTemplating.render(source, data), `${data[key]} | ${data[key]}`);
  });
}
test('required variables work in conditions without changing truthiness', () => {
  const source = '{{#if req:station}}{{req:station}}{{else}}Unknown{{/if}} {{#unless req:name}}Anonymous{{/unless}}';
  assert.equal(context.FlexTemplating.check(source), null);
  assert.equal(context.FlexTemplating.render(source, {...data, station: '', name: ''}), 'Unknown Anonymous');
  assert.equal(context.FlexTemplating.render(source, data), 'TEST1 ');
});
for (const source of ['{{req:unknown}}', '{{req:}}', '{{req:req:date}}', '{{other:date}}', '{{#if req:unknown}}Text{{/if}}']) {
  test(`unsupported variable remains invalid: ${source}`, () => {
    assert.ok(context.FlexTemplating.check(source));
  });
}

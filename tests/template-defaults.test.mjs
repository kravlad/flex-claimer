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
const templating = context.FlexTemplating;
const validDefaults = [
  ['weekday', 'Monday morning', '{{weekday "Monday morning"}}', false],
  ['station', 'DAX5', '{{req:station "DAX5"}}', true],
  ['start', '09:00', '{{start "09:00"}}', false],
  ['end', '23:59', '{{req:end "23:59"}}', true],
  ['date', '2024-02-29', '{{date "2024-02-29"}}', false],
  ['name', 'Jane "JJ" Doe', String.raw`{{name "Jane \"JJ\" Doe"}}`, false],
  ['details', 'A & B', "{{details 'A & B'}}", false],
  ['weekday', '', '{{weekday ""}}', false],
];
for (const [key, value, source, required] of validDefaults) {
  test(`default metadata is accepted and extracted: ${source}`, () => {
    assert.equal(templating.check(source), null);
    const fields = templating.fields(source);
    assert.deepEqual(Object.fromEntries(Object.entries(fields.defaults)), {[key]: value});
    assert.deepEqual(Array.from(fields.visible), [key]);
    assert.deepEqual(Array.from(fields.required), required ? [key] : []);
  });
  test(`rendering uses the field value instead of default metadata: ${source}`, () => {
    assert.equal(templating.check(source), null);
    assert.equal(templating.render(source, {[key]: 'USER VALUE'}), 'USER VALUE');
    assert.equal(templating.render(source, {[key]: ''}), '');
  });
}
for (const source of [
  '{{weekday Monday}}', '{{weekday 123}}', '{{weekday "Monday" "Tuesday"}}', '{{weekday default="Monday"}}',
  '{{block "Monday"}}', '{{req:block "Monday"}}',
  '{{date "2026-02-30"}}', '{{date "2025-02-29"}}', '{{date "2026-13-01"}}', '{{date "0000-01-01"}}', '{{date "2026-1-1"}}',
  '{{start "24:00"}}', '{{start "9:00"}}', '{{end "12:60"}}', '{{end "09:00:01"}}',
]) {
  test(`invalid default syntax or value is rejected: ${source}`, () => {
    assert.ok(templating.check(source));
  });
}
test('identical defaults on repeated fields are accepted across subject and body', () => {
  const subject = '{{weekday "Monday"}}';
  const body = '{{req:weekday "Monday"}} {{weekday}}';
  assert.equal(templating.check(subject, body), null);
  const fields = templating.fields(subject, body);
  assert.deepEqual(Object.fromEntries(Object.entries(fields.defaults)), {weekday: 'Monday'});
  assert.deepEqual(Array.from(fields.required), ['weekday']);
});
test('conflicting defaults in one source are rejected', () => {
  assert.ok(templating.check('{{weekday "Monday"}} {{weekday "Tuesday"}}'));
});
test('conflicting defaults across subject and body are rejected', () => {
  assert.ok(templating.check('{{weekday "Monday"}}', '{{req:weekday "Tuesday"}}'));
});
test('defaults are collected from both branches and ignore comments', () => {
  const source = '{{!-- {{ignored "No"}} --}}{{#if weekday}}{{weekday "Monday"}}{{else}}{{route_id "ROUTE1"}}{{/if}}';
  assert.equal(templating.check(source), null);
  const fields = templating.fields(source);
  assert.deepEqual(Object.fromEntries(Object.entries(fields.defaults)), {weekday: 'Monday', route_id: 'ROUTE1'});
  assert.equal(templating.render(source, {weekday: '', route_id: 'ROUTE2'}), 'ROUTE2');
});
test('missing start time comma removal supports defaults without refilling the cleared value', () => {
  const source = '{{date}}, {{start "09:00"}}';
  assert.equal(templating.check(source), null);
  assert.equal(templating.render(source, {date: 'October 13, 2026', start: ''}, {omitEmptyStartComma: true}), 'October 13, 2026');
  assert.equal(templating.render(source, {date: 'October 13, 2026', start: '10:00 AM'}, {omitEmptyStartComma: true}), 'October 13, 2026, 10:00 AM');
});
test('interpolation detection recognizes defaults and req: while ignoring comments and conditions', () => {
  assert.equal(typeof templating.interpolates, 'function');
  assert.equal(templating.interpolates('{{req:name "John"}}', 'name'), true);
  assert.equal(templating.interpolates('{{!-- {{name "John"}} --}}', 'name'), false);
  assert.equal(templating.interpolates('{{#if name}}Known name{{/if}}', 'name'), false);
});

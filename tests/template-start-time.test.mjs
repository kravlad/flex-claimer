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
const explanation = 'Please do not ask me for the block start time, as I do not know it.';
const data = {
  date: 'October 1, 2026', start: '', end: '', block: 'October 1, 2026',
  station: 'TEST1', name: 'Test Driver', details: 'Delivery details',
};
const templatesDir = path.join(root, 'templates');
const files = fs.readdirSync(templatesDir, {recursive: true}).filter(file => file.endsWith('.md')).sort();

for (const file of files) {
  const source = fs.readFileSync(path.join(templatesDir, file), 'utf8');
  const [, frontMatter, body] = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const usesStartTime = /\{\{\s*start\s*\}\}/.test(frontMatter);
  test(`${file}: missing-time explanation is controlled by the template`, () => {
    assert.equal(context.FlexTemplating.check(body), null);
    const withoutStart = context.FlexTemplating.render(body, data);
    assert.equal(withoutStart.split(explanation).length - 1, usesStartTime ? 1 : 0);
    const withStart = context.FlexTemplating.render(body, {...data, start: '9:00 AM'});
    assert.ok(!withStart.includes(explanation));
    assert.ok(!withoutStart.includes('{{'));
    assert.ok(!withStart.includes('{{'));
  });
}

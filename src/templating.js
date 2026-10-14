// Email template checking and rendering with Handlebars, shared by the page and build.
// Standard/custom variables support req: and one quoted default, e.g. {{weekday "Monday"}}.
// req:block requires date, start and end; set defaults on those individual fields.
(root => {
  'use strict';
  const variables = ['date', 'start', 'end', 'block', 'station', 'name', 'details'];
  const blockHelpers = ['if', 'unless'];
  const baseVariable = name => name.startsWith('req:') ? name.slice(4) : name;
  const reservedNames = new Set(['this', 'true', 'false', 'null', 'undefined', 'prototype', ...Object.getOwnPropertyNames(Object.prototype), ...Object.keys(root.Handlebars.helpers)]);
  const validVariable = name => /^[A-Za-z][A-Za-z0-9_]*$/.test(baseVariable(name)) && !reservedNames.has(baseVariable(name));

  // Visit statements in source order, including both branches of conditions.
  function* statements(program) {
    for (let index = 0; index < program.body.length; index++) {
      const node = program.body[index];
      yield {node, body: program.body, index};
      if (node.program) yield* statements(node.program);
      if (node.inverse) yield* statements(node.inverse);
    }
  }

  function validDefault(key, value) {
    if (key === 'block') return false;
    if (value === '') return true;
    if (key === 'start' || key === 'end') return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (key === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
      const date = new Date(`${value}T12:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    return true;
  }

  // Returns null for valid sources, or {message, detail} for the first problem.
  // Checking the subject and body together also detects conflicting defaults.
  function check(...sources) {
    const defaults = new Map();
    for (const source of sources) {
      let ast;
      try {
        ast = root.Handlebars.parse(source);
      } catch (error) {
        const lines = error.message.split('\n');
        return {message: 'Template error: ', detail: [lines[0], lines[lines.length - 1]].join(' ')};
      }
      const lineStarts = [0];
      for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) lineStarts.push(i + 1);
      const opening = node => {
        const start = lineStarts[node.loc.start.line - 1] + node.loc.start.column;
        return source.slice(start, source.indexOf('}}', start) + 2);
      };
      for (const {node} of statements(ast)) {
        if (node.type === 'ContentStatement' || node.type === 'CommentStatement') continue;
        if (node.type === 'MustacheStatement' && node.path.type === 'PathExpression' && !node.hash &&
            (!node.params.length || (node.params.length === 1 && node.params[0].type === 'StringLiteral'))) {
          if (!validVariable(node.path.original)) return {message: 'Invalid variable name: ', detail: opening(node)};
          if (node.params.length) {
            const key = baseVariable(node.path.original), value = node.params[0].value;
            if (!validDefault(key, value)) return {message: 'Invalid default value: ', detail: opening(node)};
            if (defaults.has(key) && defaults.get(key) !== value) return {message: 'Conflicting default values: ', detail: key};
            defaults.set(key, value);
          }
          continue;
        }
        if (node.type === 'BlockStatement' && blockHelpers.includes(node.path.original) && node.params.length === 1 && !node.hash && node.params[0].type === 'PathExpression') {
          if (!validVariable(node.params[0].original)) return {message: 'Invalid variable name: ', detail: opening(node)};
          continue;
        }
        return {message: 'Template error: ', detail: opening(node)};
      }
    }
    return null;
  }

  // Defaults initialize form fields; they never replace an explicitly empty value.
  function render(source, data, {omitEmptyStartComma = false} = {}) {
    const ast = root.Handlebars.parse(source);
    for (const {node, body, index} of statements(ast)) {
      if (node.type !== 'MustacheStatement') continue;
      node.params = [];
      if (omitEmptyStartComma && !data.start && baseVariable(node.path.original) === 'start') {
        const previous = body[index - 1];
        if (previous?.type === 'ContentStatement') {
          previous.value = previous.value.replace(/,\s*$/, '');
          previous.original = previous.value;
        }
      }
    }
    const values = {...data};
    for (const [key, value] of Object.entries(data)) values[`req:${key}`] = value;
    return root.Handlebars.compile(ast, {noEscape: true})(values);
  }

  function interpolates(source, key) {
    for (const {node} of statements(root.Handlebars.parse(source))) {
      if (node.type === 'MustacheStatement' && baseVariable(node.path.original) === key) return true;
    }
    return false;
  }

  // Inspect validated sources, including conditions but excluding comments.
  function fields(...sources) {
    const used = new Set(), required = new Set(), defaults = Object.create(null);
    const add = name => {
      const key = baseVariable(name);
      for (const field of key === 'block' ? ['date', 'start', 'end'] : [key]) {
        used.add(field);
        if (name.startsWith('req:')) required.add(field);
      }
    };
    for (const source of sources) {
      for (const {node} of statements(root.Handlebars.parse(source))) {
        if (node.type === 'MustacheStatement') {
          add(node.path.original);
          if (node.params.length) defaults[baseVariable(node.path.original)] = node.params[0].value;
        }
        if (node.type === 'BlockStatement') for (const param of node.params) add(param.original);
      }
    }
    const keys = [...variables.filter(key => key !== 'block'), ...[...used].filter(key => !variables.includes(key))];
    return {visible: keys.filter(key => used.has(key)), required: keys.filter(key => required.has(key)), defaults};
  }

  root.FlexTemplating = {variables, check, render, fields, interpolates};
})(window);

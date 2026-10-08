// Email template checking and rendering with Handlebars, shared by src/index.html and scripts/build.mjs.
// Templates may use the variables below and {{#if var}}…{{else}}…{{/if}} / {{#unless var}}…{{/unless}}.
(root => {
  'use strict';
  const variables = ['date', 'start', 'end', 'block', 'station', 'name', 'details'];
  const blockHelpers = ['if', 'unless'];

  // Returns null for a valid template, or {message, detail} for the first problem found.
  // `message` is a UI string (translated by the page), `detail` is the offending template text.
  function check(source) {
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
    const pending = [...ast.body];
    while (pending.length) {
      const node = pending.shift();
      if (node.type === 'ContentStatement' || node.type === 'CommentStatement') continue;
      if (node.type === 'MustacheStatement' && node.path.type === 'PathExpression' && !node.params.length && !node.hash) {
        if (!variables.includes(node.path.original)) return {message: 'Unknown variable: ', detail: opening(node)};
        continue;
      }
      if (node.type === 'BlockStatement' && blockHelpers.includes(node.path.original) && node.params.length === 1 && !node.hash && node.params[0].type === 'PathExpression') {
        if (!variables.includes(node.params[0].original)) return {message: 'Unknown variable: ', detail: opening(node)};
        pending.push(...node.program.body, ...(node.inverse ? node.inverse.body : []));
        continue;
      }
      return {message: 'Template error: ', detail: opening(node)};
    }
    return null;
  }

  // Plain-text output: Handlebars' HTML escaping is turned off.
  function render(source, data) {
    return root.Handlebars.compile(source, {noEscape: true})(data);
  }

  root.FlexTemplating = {variables, check, render};
})(window);

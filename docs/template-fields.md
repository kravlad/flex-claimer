# Template fields

Fields appear when referenced in the active template's subject or body, including
`if`/`unless` conditions. Comments and escaped expressions do not activate fields.

A plain variable is optional; the `req:` prefix makes its field required:

```handlebars
Date (optional): {{date}}
Date (required): {{req:date}}
Station (required): {{req:station}}
```

The standard variables are `date`, `start`, `end`, `station`, `name`, `details`,
and `block`. You can also add your own text variables:

```handlebars
Day (optional): {{weekday}}
Route (required): {{req:route_id}}
```

After applying the template, each custom variable gets one text input labelled
with its name. Repeated references share the same field. Names are case-sensitive,
start with a Latin letter, and can contain letters, digits, and underscores.
Nested paths are not supported; names such as `this`, `true`, `if`, `lookup`,
and `constructor` are reserved.

The `req:` prefix works with standard and custom variables. If the same field has
both plain and required references, it is required.

`{{block}}` shows the date, start time, and end time as optional fields.
`{{req:block}}` requires all three. To require only the date while keeping the
times optional, use `{{req:date}}` in the subject and `{{block}}` in the body.

The prefix affects validation, not the inserted value. Required text fields must
contain something other than whitespace. Hidden fields preserve their inputs but
do not contribute to the generated email or block submission. An empty optional
date adds no placeholder text.

Edit the references in a Markdown template or the browser's template editor.
Applying, restoring, and switching templates updates both field visibility and
required status. Browser-saved templates retain their own references and recreate custom fields
when selected after a reload. Values are kept while switching or editing templates
in the current page; custom input values are not stored across page reloads.
Restoring the default template loads the current repository version.

## Default values

Add one quoted value after a variable to prefill its input:

```handlebars
Day: {{weekday "Monday"}}
Station (required): {{req:station "DAX5"}}
Date: {{date "2026-10-13"}}
Start: {{start "09:00"}}
```

Defaults work with standard and custom fields, with or without `req:`. Use a
valid `YYYY-MM-DD` date and `HH:mm` time. For `block`, set defaults on `date`,
`start`, and `end` separately. Dates and times keep their usual email formatting.

Applying or switching templates updates untouched inputs to the template's
defaults. Once you edit or clear a field, your input takes priority for the rest
of the current page session, even after switching templates. Clearing a default
leaves the field empty; a required field then needs a new value.

Default values are saved as part of the template and applied again after a
reload. Your saved name takes priority over a template default. Repeated
references share one input and may omit the default or repeat the same value;
different defaults for the same field in the subject or body are rejected.

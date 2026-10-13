---
label: Custom template
hint: Open “Edit template” and enter your text. Variables in double braces will be replaced with your block details.
subject: Block review request — {{req:date}}, {{start}}
---
Hello Amazon Flex Support,

I am writing about my block on {{block}}.

Please review the issue described below and let me know the outcome.

{{#unless start}}
Please do not ask me for the block start time, as I do not know it. The app shows only the date of the issue, not the time of the block in which it occurred. I cannot determine which specific block the issue occurred in. If I knew the block time, I would have included it.
{{/unless}}

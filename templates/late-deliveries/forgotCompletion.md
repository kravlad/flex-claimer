---
label: Delivered on time — forgot to confirm in app
group: Late deliveries
hint: For a package delivered on time but marked late because you forgot to complete the delivery in the app. Add the package ID, actual delivery time, and any supporting details if available.
subject: Remove late-delivery standing entry — delayed app confirmation — {{req:date}}, {{start}}
---
Hello Amazon Flex Support,

I am requesting a review and removal of a late-delivery entry from my standing for a package I delivered during my block on {{date}}{{#if start}}, starting at {{start}}{{/if}}.

I delivered the package to the customer before the applicable delivery deadline, but I forgot to complete the delivery in the app at that time. I marked it as completed later, and the delivery is now shown as late in my standing.

I acknowledge that I should have completed the delivery in the app immediately. However, the delay was in recording the completion in the app; the package itself was delivered on time.

Please review the available delivery records and any supporting information to verify the actual delivery time. I request that you remove this late-delivery entry from my delivery history and correct my standing to reflect that the customer received the package on time.

{{#if details}}
Additional delivery information:
{{details}}

{{/if}}
Please let me know if you need any further information to review this delivery, and confirm the outcome of your review.

{{#unless start}}
Please do not ask me for the block start time, as I do not know it. The app shows only the date of the issue, not the time of the block in which it occurred. I cannot determine which specific block the issue occurred in. If I knew the block time, I would have included it.
{{/unless}}

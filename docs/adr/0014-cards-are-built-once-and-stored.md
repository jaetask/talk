# 14. A call's card is built once and stored with the call

## Context

The chat shows a card for what a tool call returned. App data changes, and the model is given a shortened copy of each result to save context.

## Decision

- `src/apps/cards.ts` builds the card once, when the call finishes. `src/ext/apps.ts` stores it with the call, so a chat reopened days later draws exactly the same card.
- The model's copy and the card's copy differ. The model gets a short result; the card shows the full list, up to 200 tickets where the model gets 40 (`src/apps/compact.ts`).
- Account or card-like numbers of eight or more digits, spaced or dashed too, are hidden except the last four digits. This applies to the money app's results, both the model's copy and the card's (`src/apps/compact.ts`, `src/apps/registry.ts`).

## Consequences

Do not rebuild cards from live app data when a chat is reopened. Do not send the card's full copy to the model. Keep number masking on both copies.

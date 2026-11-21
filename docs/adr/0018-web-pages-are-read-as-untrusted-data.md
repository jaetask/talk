# 18. Web pages are read from public addresses only and handed over as untrusted data

## Context

Talk can search the web and read a page for the model. A page address can point into the local network, a redirect can lead there, and page text can contain instructions aimed at the model.

## Decision

In `src/web/read.ts`:

- Search goes through a self-hosted SearXNG, so only the query leaves the machine.
- Only http and https pages at public addresses are read. Every address a host resolves to must be public.
- Redirects are followed by hand and checked hop by hop.
- Pages are capped in size, nothing is executed, and page text is always handed over marked as untrusted data, with any instructions in it to be ignored.

In `src/ext/web.ts` and `src/web/research.ts`:

- Research hands a topic to a subagent that searches and reads, then checks what it wrote against the pages.
- The research subagent has only the search and read tools, so it has nothing else to reach for.
- Citations to sources that do not exist are dropped, and so is any sentence that quotes words not found word for word in a source.

## Consequences

Do not let the fetch follow redirects automatically. Do not skip the address check for cached or redirected addresses. Do not give the research subagent app tools. Do not present page text to the model without the untrusted marker.

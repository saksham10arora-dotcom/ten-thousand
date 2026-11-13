# Ten Thousand

A dark night city that folds shut when 10,000 people have stood in it. Every visitor lights one window and bends the streets a little further.

Live: https://saksham.digital/ten-thousand/

- `index.html`: the whole page, three.js r128, no build step.
- `worker/`: a Cloudflare Worker with one Durable Object that hands out the shared count.

Add `?sim=3412` to the URL to preview any count without touching the real one.

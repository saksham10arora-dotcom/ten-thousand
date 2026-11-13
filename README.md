# Full House

A 3D stadium with 10,000 seats. Everyone who has the page open right now fills one seat. If every seat is full at the same moment, the lights go out and the crowd performs a card stunt: each seat is one pixel of a picture nobody has seen.

Live: https://saksham.digital/ten-thousand/

- `index.html`: the whole page, three.js r128, no build step.
- `worker/`: a Cloudflare Worker with one Durable Object holding every visitor's WebSocket. The card stunt message is a Worker secret, released only once the house has been full.

Add `?sim=2500` to preview a crowd size without joining the real count (`?sim=10000` plays the stunt with a placeholder picture).

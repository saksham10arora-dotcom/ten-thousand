// Full House: a live count of people who have the page open right now.
// One Durable Object holds every WebSocket (hibernation API), hands each
// connection the lowest free seat rank, and broadcasts the count at most
// once every 1.2 seconds. When 10,000 sockets are open at the same moment
// the house is marked full for good and the card stunt image is released.
const GOAL = 10000;
const ORIGINS = ["https://saksham.digital", "http://localhost:4340"];
const PER_IP = 4; // a household or a lab can share an address

/* 5x7 font for the card stunt. The message itself is a Worker secret
   (STUNT, lines split by "|"), so nobody can read it before the house is full. */
const F = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"], D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"], F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."], H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"], J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"], L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"], N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"], R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."], T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"], X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."], Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."], 1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"], 3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  4: ["#...#", "#...#", "#...#", "#####", "....#", "....#", "....#"], 5: ["#####", "#....", "#....", "####.", "....#", "....#", "####."],
  6: [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."], 7: ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."], 9: [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."], "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."], ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
  "<": [".....", ".#.#.", "#####", "#####", ".###.", "..#..", "....."],
};
const IW = 70, IH = 50;
function render(text) {
  const lines = String(text || "FULL|HOUSE").toUpperCase().split("|").slice(0, 3);
  const widest = Math.max(...lines.map((l) => l.length * 6 - 1));
  const s = widest * 2 <= IW && lines.length * 16 - 2 <= IH ? 2 : 1;
  const grid = Array.from({ length: IH }, () => Array(IW).fill(0));
  const blockH = lines.length * (7 * s + 2 * s) - 2 * s;
  let y0 = Math.floor((IH - blockH) / 2);
  for (const line of lines) {
    const w = (line.length * 6 - 1) * s;
    let x0 = Math.floor((IW - w) / 2);
    for (const ch of line) {
      const g = F[ch] || F[" "];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === "#")
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          const y = y0 + r * s + dy, x = x0 + c * s + dx;
          if (y >= 0 && y < IH && x >= 0 && x < IW) grid[y][x] = 1;
        }
      x0 += 6 * s;
    }
    y0 += 9 * s;
  }
  return { w: IW, h: IH, rows: grid.map((r) => r.join("")) };
}

const cors = (req) => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};
const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req) } });

export class City {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.used = null; // rebuilt from socket attachments after hibernation
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  ranks() {
    if (!this.used) {
      this.used = new Set();
      for (const ws of this.state.getWebSockets()) {
        const a = ws.deserializeAttachment();
        if (a) this.used.add(a.r);
      }
    }
    return this.used;
  }
  async snap(live) {
    const st = this.state.storage;
    let peak = (await st.get("peak")) || 0, done = (await st.get("done")) || 0;
    if (live > peak) { peak = live; await st.put("peak", peak); }
    if (live >= GOAL && !done) { done = Date.now(); await st.put("done", done); }
    return { live, peak, done, goal: GOAL };
  }
  async kick() {
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 1200);
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") === "websocket") {
      const k = url.searchParams.get("k") || "x";
      if (this.state.getWebSockets(k).length >= PER_IP) return new Response("too many from this address", { status: 429 });
      const used = this.ranks();
      let r = 0;
      while (used.has(r)) r++;
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server, [k]);
      server.serializeAttachment({ r });
      used.add(r);
      server.send(JSON.stringify({ you: r, ...(await this.snap(this.state.getWebSockets().length)) }));
      await this.kick();
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith("/stunt")) {
      const done = await this.state.storage.get("done");
      if (!done) return json(req, { error: "the house has not been full yet" }, 404);
      return json(req, render(this.env.STUNT));
    }
    return json(req, await this.snap(this.state.getWebSockets().length));
  }
  async alarm() {
    const socks = this.state.getWebSockets();
    const open = socks.filter((ws) => ws.readyState === 1);
    const msg = JSON.stringify(await this.snap(open.length));
    for (const ws of open) { try { ws.send(msg); } catch {} }
  }
  async gone(ws) {
    const a = ws.deserializeAttachment();
    if (a && this.used) this.used.delete(a.r);
    try { ws.close(1000, "bye"); } catch {}
    await this.kick();
  }
  async webSocketClose(ws) { await this.gone(ws); }
  async webSocketError(ws) { await this.gone(ws); }
  async webSocketMessage() {}
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const ws = url.pathname === "/v1/live" && req.headers.get("Upgrade") === "websocket";
    const state = url.pathname === "/v1/live" && req.method === "GET" && !ws;
    const stunt = url.pathname === "/v1/stunt" && req.method === "GET";
    if (!ws && !state && !stunt) return json(req, { error: "not found" }, 404);
    if (ws && !ORIGINS.includes(req.headers.get("Origin") || "")) return new Response("forbidden", { status: 403 });

    // the address is only ever held as a salted daily hash, as the socket's tag
    const day = new Date().toISOString().slice(0, 10);
    const ip = req.headers.get("CF-Connecting-IP") || "0";
    const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(day + "|" + ip + "|full-house"));
    const k = [...new Uint8Array(dig)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    const stub = env.CITY.get(env.CITY.idFromName("full-house-launch"));
    const u = new URL("https://house" + url.pathname);
    u.searchParams.set("k", k);
    return stub.fetch(new Request(u, req));
  },
};

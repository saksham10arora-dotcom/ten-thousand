// Ten Thousand: one shared count. A Durable Object is single-threaded, so
// handing out the next number is atomic without any locking.
const GOAL = 10000;
const ORIGINS = ["https://saksham.digital", "http://localhost:4340"];
const PER_IP_PER_DAY = 6; // a household or a lab can share an address

const cors = (req) => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};
const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req) } });

export class City {
  constructor(state) {
    this.s = state.storage;
  }
  async fetch(req) {
    const url = new URL(req.url);
    const count = (await this.s.get("count")) || 0;
    if (req.method === "GET") return json(req, { count, goal: GOAL });

    let id = "";
    try {
      id = String((await req.json()).id || "").slice(0, 64);
    } catch {}
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return json(req, { count, goal: GOAL });

    const had = await this.s.get("id:" + id);
    if (had) return json(req, { n: had, count, goal: GOAL });

    const ipKey = "ip:" + url.searchParams.get("k");
    const used = (await this.s.get(ipKey)) || 0;
    if (used >= PER_IP_PER_DAY) return json(req, { count, goal: GOAL });

    const n = count + 1;
    await this.s.put({ count: n, ["id:" + id]: n, [ipKey]: used + 1 });
    return json(req, { n, count: n, goal: GOAL });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const isState = url.pathname === "/v1/city" && req.method === "GET";
    const isJoin = url.pathname === "/v1/city/join" && req.method === "POST";
    if (!isState && !isJoin) return json(req, { error: "not found" }, 404);

    // the address is only ever stored as a salted daily hash
    const day = new Date().toISOString().slice(0, 10);
    const ip = req.headers.get("CF-Connecting-IP") || "0";
    const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(day + "|" + ip + "|ten-thousand"));
    const k = [...new Uint8Array(dig)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    const stub = env.CITY.get(env.CITY.idFromName("city-launch"));
    return stub.fetch(new Request("https://city/?k=" + day + k, req));
  },
};

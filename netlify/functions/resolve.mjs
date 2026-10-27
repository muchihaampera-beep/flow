
import dns from "node:dns/promises";
import net from "node:net";

function private4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    p[0] >= 224;
}

function private6(ip) {
  const s = ip.toLowerCase();
  return s === "::" || s === "::1" || s.startsWith("fc") ||
    s.startsWith("fd") || /^fe[89ab]/.test(s) ||
    s.startsWith("::ffff:127.") ||
    s.startsWith("::ffff:10.") ||
    s.startsWith("::ffff:192.168.");
}

async function checkURL(raw) {
  let u;
  try { u = new URL(raw); }
  catch { throw Error("URL tidak valid."); }

  if (!["http:", "https:"].includes(u.protocol) ||
      u.username || u.password)
    throw Error("URL tidak didukung.");

  const host = u.hostname.replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local"))
    throw Error("Alamat lokal tidak diizinkan.");

  if (net.isIP(host) === 4 && private4(host))
    throw Error("IP privat tidak diizinkan.");

  if (net.isIP(host) === 6 && private6(host))
    throw Error("IP privat tidak diizinkan.");

  if (!net.isIP(host)) {
    const records = await dns.lookup(host, { all: true });
    if (!records.length || records.some(r =>
      net.isIP(r.address) === 4
        ? private4(r.address)
        : private6(r.address)))
      throw Error("Domain menuju alamat privat/tidak aman.");
  }

  return u;
}

export default async (request) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };

  try {
    const incoming = new URL(request.url);
    let current = incoming.searchParams.get("url") || "";

    if (!current || current.length > 2048)
      throw Error("Link kosong atau terlalu panjang.");

    let hops = 0;

    for (; hops < 8; hops++) {
      const u = await checkURL(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      let response;
      try {
        response = await fetch(u.href, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
          headers: { "user-agent": "LinkFlow/1.0" }
        });

        if (response.status === 405 ||
            response.status === 501) {
          await response.body?.cancel();
          response = await fetch(u.href, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              "user-agent": "LinkFlow/1.0",
              "range": "bytes=0-0"
            }
          });
        }
      } finally {
        clearTimeout(timer);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) break;
        current = new URL(location, u).href;
        continue;
      }

      await response.body?.cancel();
      return new Response(JSON.stringify({
        url: u.href,
        hops,
        status: response.status
      }), { status: 200, headers });
    }

    return new Response(JSON.stringify({
      url: current,
      hops,
      note: "Batas pengalihan tercapai."
    }), { status: 200, headers });

  } catch (error) {
    const message = error.name === "AbortError"
      ? "Situs terlalu lama merespons."
      : error.message || "Gagal memproses link.";

    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers
    });
  }
};

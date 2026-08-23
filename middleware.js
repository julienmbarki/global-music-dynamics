// Vercel Edge Middleware (framework-agnostic — this is a Vite app, not
// Next.js, so it uses the standard Request/Response API, not next/server).
//
// Deters casual scraping of /data/network.json: blocks requests that don't
// carry a Referer from this site, and known bot/scraper User-Agents.
// NOTE: this is a deterrent, not real access control — a determined
// scraper can trivially spoof both headers. It stops naive bots and
// direct-URL scraping, nothing more.

export const config = {
  matcher: "/data/:path*",
};

const BOT_UA_PATTERN =
  /bot|crawl|spider|scrape|curl|wget|python-requests|axios|httpclient/i;

export default function middleware(request) {
  const referer = request.headers.get("referer") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const host = request.headers.get("host") || "";

  const refererIsSelf = referer.includes(host);
  const looksLikeBot = BOT_UA_PATTERN.test(userAgent) || !userAgent;

  if (!refererIsSelf || looksLikeBot) {
    return new Response("Not found", { status: 404 });
  }

  // Returning nothing lets the request continue through to the static
  // file as normal — Edge Middleware runs before static asset resolution.
}

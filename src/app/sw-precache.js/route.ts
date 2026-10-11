import { TOOLS } from '@/lib/utils/tools-config';

export const dynamic = 'force-static';

// Emitted as /sw-precache.js by the static export and loaded by public/sw.js
// through importScripts, so the precache list always comes from the same
// registry, and the same build, as the tool routes themselves.
export function GET() {
  const routes = TOOLS.map((tool) => `/tools/${tool.id}`).sort();
  const body = `// Generated at build time from the tool registry. Do not edit.
self.__precacheRoutes = ${JSON.stringify(routes, null, 2)};
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}

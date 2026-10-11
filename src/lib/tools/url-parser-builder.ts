/**
 * Splitting a URL into editable parts and putting the parts back together.
 *
 * `parseUrl` never throws: whatever is typed, complete or not, comes back as
 * parts. A well-formed address is read with the platform `URL` class; a
 * relative reference (`/api/search?q=1`, `?page=2`, `#top`) or something the
 * platform rejects is split by hand. `buildUrl` is the reverse and writes the
 * query in `application/x-www-form-urlencoded` form.
 *
 * Everything here is pure and runs in Node.
 */

export interface UrlParam {
  key: string;
  value: string;
  /** A disabled parameter is kept in the list but left out of the URL. Default true. */
  enabled?: boolean;
}

export interface UrlParts {
  /** The scheme with its colon, `https:`. Empty when the input has none. */
  protocol: string;
  /** Host with port and, when present, `user:password@` in front. */
  host: string;
  path: string;
  /** The fragment with its leading `#`, or empty. */
  hash: string;
  /** Query parameters, decoded, in order. */
  params: UrlParam[];
}

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
// A reference to resolve against the current page: it has no host of its own.
const RELATIVE = /^(?:\/(?!\/)|[?#]|\.{1,2}(?:\/|$))/;
// Schemes that are meaningless without a host.
const NEEDS_HOST = /^(?:https?|wss?|ftp):?(?:\/\/)?$/i;

function parseQuery(query: string): UrlParam[] {
  // URLSearchParams never throws: a stray "%" is kept as it is.
  return Array.from(new URLSearchParams(query), ([key, value]) => ({ key, value }));
}

// Splits on the first "#" and "?" and, unless the reference is relative,
// takes everything up to the next "/" as the host.
function splitByHand(working: string, relative: boolean): UrlParts {
  const hashAt = working.indexOf('#');
  const fragment = hashAt === -1 ? '' : working.slice(hashAt);
  const beforeHash = hashAt === -1 ? working : working.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);
  let rest = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);

  let protocol = '';
  let host = '';
  if (!relative) {
    const scheme = SCHEME.exec(rest);
    if (scheme) {
      protocol = scheme[0].slice(0, -2);
      rest = rest.slice(scheme[0].length);
    } else if (rest.startsWith('//')) {
      rest = rest.slice(2);
    }
    const slashAt = rest.indexOf('/');
    host = slashAt === -1 ? rest : rest.slice(0, slashAt);
    rest = slashAt === -1 ? '' : rest.slice(slashAt);
  }

  return {
    protocol,
    host,
    path: rest,
    hash: fragment.length > 1 ? fragment : '',
    params: parseQuery(query),
  };
}

/**
 * The parts of a URL. Accepts absolute URLs, addresses without a scheme
 * (`example.com/a?b=1`), protocol-relative ones (`//cdn.example.com/x`) and
 * relative references. A host always gets at least `/` as its path.
 */
export function parseUrl(input: string): UrlParts {
  const working = input.trim();
  if (!working) return { protocol: '', host: '', path: '', hash: '', params: [] };

  let parts: UrlParts;
  if (RELATIVE.test(working)) {
    parts = splitByHand(working, true);
  } else {
    const hasScheme = SCHEME.test(working);
    // The URL class needs a scheme; a borrowed one is not reported back.
    const candidate = hasScheme ? working : `https:${working.startsWith('//') ? '' : '//'}${working}`;
    try {
      const url = new URL(candidate);
      const credentials = url.username ? `${url.username}${url.password ? `:${url.password}` : ''}@` : '';
      parts = {
        protocol: hasScheme ? url.protocol : '',
        host: credentials + url.host,
        path: url.pathname,
        hash: url.hash,
        params: Array.from(url.searchParams, ([key, value]) => ({ key, value })),
      };
    } catch {
      parts = splitByHand(working, false);
    }
  }

  return { ...parts, path: parts.path || (parts.host ? '/' : '') };
}

/**
 * The URL made of the given parts. Parameters that are disabled or have a
 * blank key are skipped. Without a host the result is a relative reference,
 * unless the scheme is one like `file:` that works without a host.
 */
export function buildUrl(parts: UrlParts): string {
  const { protocol, host, hash, params } = parts;
  // "example.com" + "search" must not run together.
  const path = host && parts.path && !parts.path.startsWith('/') ? `/${parts.path}` : parts.path;

  let result = '';
  if (protocol && (host || (path && !NEEDS_HOST.test(protocol)))) {
    result += protocol.endsWith('//') ? protocol : protocol.endsWith(':') ? `${protocol}//` : `${protocol}://`;
  } else if (host) {
    result += 'https://';
  }

  result += host + path;

  const active = params.filter((param) => param.enabled !== false && param.key.trim() !== '');
  if (active.length > 0) {
    const search = new URLSearchParams();
    active.forEach((param) => search.append(param.key, param.value));
    result += `?${search.toString()}`;
  }

  if (hash) {
    result += hash.startsWith('#') ? hash : `#${hash}`;
  }

  return result;
}

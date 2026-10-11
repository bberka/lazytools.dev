// The HTTP status code table: the codes in the IANA HTTP Status Code Registry
// (https://www.iana.org/assignments/http-status-codes) plus 418, which RFC 9110
// reserves. 104 (Upload Resumption Supported) is left out because its
// registration is temporary. The class of each code is derived from the number
// in `http-status-codes.ts`, so it is not repeated here.

export interface StatusCodeEntry {
  code: number;
  /** The reason phrase as the registry and RFC 9110 spell it. */
  phrase: string;
  /** What the code means, in a sentence or two. */
  description: string;
  /** The document that defines the code. */
  spec: string;
  /** When the code shows up, or what commonly causes it. */
  usage: string;
}

export const STATUS_CODE_ENTRIES: readonly StatusCodeEntry[] = [
  // 1xx: Informational
  {
    code: 100,
    phrase: 'Continue',
    description:
      'The initial part of the request has been received and not rejected, so the client should carry on and send the rest.',
    spec: 'RFC 9110, Section 15.2.1',
    usage:
      'Sent in reply to a request with Expect: 100-continue, so a client can check that the headers are acceptable before uploading a large body.',
  },
  {
    code: 101,
    phrase: 'Switching Protocols',
    description:
      "The server agrees to switch this connection to the protocol named in the request's Upgrade header.",
    spec: 'RFC 9110, Section 15.2.2',
    usage: 'Seen when a WebSocket handshake succeeds or a connection is upgraded to another protocol.',
  },
  {
    code: 102,
    phrase: 'Processing',
    description:
      'An interim WebDAV response saying the server has received the request and is still working on it, with no final response yet.',
    spec: 'RFC 2518',
    usage:
      'Meant to stop clients timing out on slow WebDAV operations. It was dropped from RFC 4918, so new code should not rely on it.',
  },
  {
    code: 103,
    phrase: 'Early Hints',
    description:
      'An interim response that lets the server send Link headers before the final response, so the client can start preloading resources.',
    spec: 'RFC 8297',
    usage:
      'Used by servers and CDNs to hint at stylesheets or scripts to preload while the main response is still being prepared.',
  },

  // 2xx: Successful
  {
    code: 200,
    phrase: 'OK',
    description:
      'The request succeeded. What the response carries depends on the method: a representation for GET, the result of the action for POST.',
    spec: 'RFC 9110, Section 15.3.1',
    usage: 'The default success response for most requests.',
  },
  {
    code: 201,
    phrase: 'Created',
    description:
      'The request succeeded and created one or more new resources. The new resource is usually identified by a Location header.',
    spec: 'RFC 9110, Section 15.3.2',
    usage: 'The usual reply to a POST or PUT that creates a record in a REST API.',
  },
  {
    code: 202,
    phrase: 'Accepted',
    description:
      'The request has been accepted for processing, but the processing has not finished and may still fail.',
    spec: 'RFC 9110, Section 15.3.3',
    usage: 'Used for queued or asynchronous work, such as a background job whose result is available later.',
  },
  {
    code: 203,
    phrase: 'Non-Authoritative Information',
    description:
      "The request succeeded, but a transforming proxy has modified the payload from the origin server's 200 response.",
    spec: 'RFC 9110, Section 15.3.4',
    usage: 'Rare. A proxy may send it when it rewrites or injects content on the way through.',
  },
  {
    code: 204,
    phrase: 'No Content',
    description:
      'The server handled the request successfully and has no content to send in the response body.',
    spec: 'RFC 9110, Section 15.3.5',
    usage:
      'The usual reply to a DELETE, or to a PUT or PATCH with nothing to return. Also common for CORS preflight responses.',
  },
  {
    code: 205,
    phrase: 'Reset Content',
    description:
      'The request succeeded and the client should reset the view that sent it, such as clearing a form.',
    spec: 'RFC 9110, Section 15.3.6',
    usage: 'Rarely used. Meant for data-entry pages that should be cleared ready for the next input.',
  },
  {
    code: 206,
    phrase: 'Partial Content',
    description:
      'The server is delivering only the part of the resource that the client asked for with a Range header.',
    spec: 'RFC 9110, Section 15.3.7',
    usage: 'Used for resumable downloads and for seeking within video or audio.',
  },
  {
    code: 207,
    phrase: 'Multi-Status',
    description:
      'A WebDAV response whose XML body carries separate status codes for several independent operations.',
    spec: 'RFC 4918, Section 11.1',
    usage:
      'Returned by WebDAV methods such as PROPFIND when a request touches several resources. Some batch APIs borrow it too.',
  },
  {
    code: 208,
    phrase: 'Already Reported',
    description:
      'A WebDAV status used inside a Multi-Status body to say the members of a binding were already listed earlier in the same response.',
    spec: 'RFC 5842',
    usage:
      'Appears with the WebDAV bindings extension, to avoid listing the same resource twice when a request uses Depth: infinity.',
  },
  {
    code: 226,
    phrase: 'IM Used',
    description:
      'The server fulfilled a GET request and the response is the result of applying one or more instance manipulations to the current instance.',
    spec: 'RFC 3229',
    usage: 'Part of delta encoding in HTTP (the A-IM header), which is rarely deployed.',
  },

  // 3xx: Redirection
  {
    code: 300,
    phrase: 'Multiple Choices',
    description:
      'The target resource has more than one representation and the client can choose between them.',
    spec: 'RFC 9110, Section 15.4.1',
    usage:
      'Rarely used in practice. A server may list the choices in the body and name a preferred one in a Location header.',
  },
  {
    code: 301,
    phrase: 'Moved Permanently',
    description:
      'The resource has a new permanent URI and future requests should use it. A client may change POST to GET when it follows the redirect.',
    spec: 'RFC 9110, Section 15.4.2',
    usage:
      'Used for permanent moves such as a changed URL or a switch to HTTPS, and search engines transfer ranking to the new address. Use 308 to keep the method.',
  },
  {
    code: 302,
    phrase: 'Found',
    description:
      'The resource is temporarily at a different URI, given in the Location header. A client may change POST to GET when it follows the redirect.',
    spec: 'RFC 9110, Section 15.4.3',
    usage:
      'The common default for temporary redirects, such as sending a visitor to a login page. Use 307 to keep the method.',
  },
  {
    code: 303,
    phrase: 'See Other',
    description:
      'The server is redirecting the client to a different resource, to be fetched with GET, that may describe the result of the original request.',
    spec: 'RFC 9110, Section 15.4.4',
    usage: 'Used after a POST to send the client to a result page (the Post/Redirect/Get pattern).',
  },
  {
    code: 304,
    phrase: 'Not Modified',
    description:
      'A conditional GET or HEAD found that the resource has not changed since the version the client already has, so no body is sent.',
    spec: 'RFC 9110, Section 15.4.5',
    usage:
      'Returned when If-None-Match or If-Modified-Since still matches, which lets a browser reuse its cached copy.',
  },
  {
    code: 305,
    phrase: 'Use Proxy',
    description:
      'Defined in an earlier version of HTTP to tell the client to repeat the request through the proxy named in the Location header. Now deprecated.',
    spec: 'RFC 9110, Section 15.4.6',
    usage: 'Deprecated, partly because of security concerns. Servers should not send it and clients should not act on it.',
  },
  {
    code: 306,
    phrase: '(Unused)',
    description:
      'Defined in an earlier version of HTTP and no longer used, but the number stays reserved.',
    spec: 'RFC 9110, Section 15.4.7',
    usage: 'You should never see it. It is listed so the gap between 305 and 307 is explained.',
  },
  {
    code: 307,
    phrase: 'Temporary Redirect',
    description:
      'The resource is temporarily at another URI. Unlike 302, the client must repeat the request with the same method and body.',
    spec: 'RFC 9110, Section 15.4.8',
    usage:
      'Use it when a temporary redirect must not turn a POST into a GET. Browsers also report it for internal HSTS upgrades from http to https.',
  },
  {
    code: 308,
    phrase: 'Permanent Redirect',
    description:
      'The resource has permanently moved to the URI in the Location header. Unlike 301, the client must repeat the request with the same method and body.',
    spec: 'RFC 9110, Section 15.4.9',
    usage: 'Use it instead of 301 for permanent moves of endpoints that receive POST, PUT or DELETE.',
  },

  // 4xx: Client Error
  {
    code: 400,
    phrase: 'Bad Request',
    description:
      'The server cannot or will not process the request because of something it takes to be a client error, such as malformed syntax or invalid framing.',
    spec: 'RFC 9110, Section 15.5.1',
    usage:
      'Common causes: invalid JSON, missing or malformed parameters, an oversized cookie header or a failed validation.',
  },
  {
    code: 401,
    phrase: 'Unauthorized',
    description:
      'The request lacks valid authentication credentials for the target resource. The response includes a WWW-Authenticate header saying how to authenticate.',
    spec: 'RFC 9110, Section 15.5.2',
    usage:
      'Common causes: a missing, expired or wrong token, API key or password. The client is not identified yet; compare 403.',
  },
  {
    code: 402,
    phrase: 'Payment Required',
    description:
      'Reserved for future use. It was meant for digital payment schemes but has no standard meaning.',
    spec: 'RFC 9110, Section 15.5.3',
    usage:
      'Some APIs use it for billing problems, such as an expired subscription or an exhausted paid quota.',
  },
  {
    code: 403,
    phrase: 'Forbidden',
    description:
      'The server understood the request but refuses to fulfil it. Sending different credentials may or may not help.',
    spec: 'RFC 9110, Section 15.5.4',
    usage:
      'Common causes: the signed-in user lacks permission, an IP or region block, or a failed CSRF check. Some servers answer 404 instead to hide that a resource exists.',
  },
  {
    code: 404,
    phrase: 'Not Found',
    description:
      'The server did not find a current representation for the target resource, or does not want to say that one exists.',
    spec: 'RFC 9110, Section 15.5.5',
    usage:
      'Common causes: a mistyped URL, a deleted or moved page, or a wrong route or base path. It does not say whether the condition is permanent; 410 does.',
  },
  {
    code: 405,
    phrase: 'Method Not Allowed',
    description:
      'The method in the request is known to the server but not supported by the target resource. The response includes an Allow header listing the methods that are.',
    spec: 'RFC 9110, Section 15.5.6',
    usage:
      'Common causes: a POST to a read-only endpoint, or no route handler for the method, such as DELETE.',
  },
  {
    code: 406,
    phrase: 'Not Acceptable',
    description:
      'The server cannot produce a response that matches the content negotiation headers in the request, such as Accept or Accept-Language.',
    spec: 'RFC 9110, Section 15.5.7',
    usage:
      'Common cause: an Accept header asking for a format the endpoint does not offer. Many servers ignore Accept and send a default instead.',
  },
  {
    code: 407,
    phrase: 'Proxy Authentication Required',
    description:
      'Like 401, but the client must first authenticate with a proxy. The response includes a Proxy-Authenticate header.',
    spec: 'RFC 9110, Section 15.5.8',
    usage: 'Seen behind corporate proxies when the proxy credentials are missing or wrong.',
  },
  {
    code: 408,
    phrase: 'Request Timeout',
    description:
      'The server did not receive a complete request in the time it was prepared to wait, so it is closing the connection.',
    spec: 'RFC 9110, Section 15.5.9',
    usage:
      'Common causes: a stalled upload, an idle keep-alive connection or a flaky network. The client may repeat the request on a new connection.',
  },
  {
    code: 409,
    phrase: 'Conflict',
    description:
      'The request conflicts with the current state of the target resource, so the server cannot complete it.',
    spec: 'RFC 9110, Section 15.5.10',
    usage:
      'Typical for edit conflicts, a duplicate of a unique value such as an existing username, or a version mismatch on update.',
  },
  {
    code: 410,
    phrase: 'Gone',
    description:
      'The target resource is no longer available at the origin server and this condition is likely to be permanent.',
    spec: 'RFC 9110, Section 15.5.11',
    usage:
      'Use it instead of 404 when a page was removed on purpose, so clients and crawlers can drop the URL.',
  },
  {
    code: 411,
    phrase: 'Length Required',
    description: 'The server refuses to accept the request without a defined Content-Length.',
    spec: 'RFC 9110, Section 15.5.12',
    usage:
      'Seen when a client sends a body without a length, for example with chunked encoding, to a server that needs it up front.',
  },
  {
    code: 412,
    phrase: 'Precondition Failed',
    description:
      'One or more conditions in the request headers, such as If-Match or If-Unmodified-Since, evaluated to false on the server.',
    spec: 'RFC 9110, Section 15.5.13',
    usage:
      'Used for optimistic concurrency: an update that carries a stale ETag in If-Match is rejected.',
  },
  {
    code: 413,
    phrase: 'Content Too Large',
    description:
      'The request content is larger than the server is willing or able to process. Formerly named Payload Too Large and Request Entity Too Large.',
    spec: 'RFC 9110, Section 15.5.14',
    usage:
      'Common cause: a file upload over a size limit set in the web server, proxy or framework, such as nginx client_max_body_size.',
  },
  {
    code: 414,
    phrase: 'URI Too Long',
    description: 'The request target is longer than the server is willing to interpret.',
    spec: 'RFC 9110, Section 15.5.15',
    usage:
      'Common causes: a very long query string, a form that should have been a POST, or a redirect loop that keeps growing the URL.',
  },
  {
    code: 415,
    phrase: 'Unsupported Media Type',
    description:
      'The server refuses the request because its content format or content encoding is not supported by the target resource for this method.',
    spec: 'RFC 9110, Section 15.5.16',
    usage:
      'Common cause: a wrong or missing Content-Type, such as form data sent to an endpoint that expects application/json.',
  },
  {
    code: 416,
    phrase: 'Range Not Satisfiable',
    description:
      "None of the ranges in the request's Range header overlap the current extent of the resource, or the ranges were invalid.",
    spec: 'RFC 9110, Section 15.5.17',
    usage:
      'Seen when a download is resumed past the end of a file that has since changed. The response carries a Content-Range header with the real size.',
  },
  {
    code: 417,
    phrase: 'Expectation Failed',
    description:
      "The expectation in the request's Expect header could not be met by the server or by an intermediary.",
    spec: 'RFC 9110, Section 15.5.18',
    usage: 'Rare. Mostly comes from servers or proxies that do not support Expect: 100-continue.',
  },
  {
    code: 418,
    phrase: "I'm a teapot",
    description:
      "A joke code from the April Fools' Hyper Text Coffee Pot Control Protocol: a teapot refuses to brew coffee. RFC 9110 keeps the number reserved.",
    spec: 'RFC 2324 (reserved by RFC 9110, Section 15.5.19)',
    usage:
      'Not for real errors. Servers return it as an Easter egg or to turn away unwanted requests, and it is reserved so nothing else can claim it.',
  },
  {
    code: 421,
    phrase: 'Misdirected Request',
    description:
      'The request was sent to a server that cannot produce a response for the combination of scheme and authority in the request URI.',
    spec: 'RFC 9110, Section 15.5.20',
    usage:
      'Seen when an HTTP/2 connection is reused for a host the server is not set up to answer. The client can retry on a new connection.',
  },
  {
    code: 422,
    phrase: 'Unprocessable Content',
    description:
      'The server understands the content type and syntax of the request but cannot process the instructions it contains. Formerly named Unprocessable Entity.',
    spec: 'RFC 9110, Section 15.5.21',
    usage:
      'Widely used by APIs for validation errors, such as a well-formed JSON body with invalid field values.',
  },
  {
    code: 423,
    phrase: 'Locked',
    description: 'A WebDAV status: the source or destination resource of the method is locked.',
    spec: 'RFC 4918, Section 11.3',
    usage: 'Seen when changing a WebDAV resource that another user or process has locked.',
  },
  {
    code: 424,
    phrase: 'Failed Dependency',
    description:
      'A WebDAV status: the method could not be performed because it depended on another action that failed.',
    spec: 'RFC 4918, Section 11.4',
    usage:
      'Appears in Multi-Status responses for an operation that was skipped because an earlier one failed.',
  },
  {
    code: 425,
    phrase: 'Too Early',
    description:
      'The server is unwilling to risk processing a request that might be replayed, such as one sent in TLS 1.3 early data.',
    spec: 'RFC 8470',
    usage:
      'Sent by servers that accept TLS 1.3 0-RTT data. The client should retry once the handshake has completed.',
  },
  {
    code: 426,
    phrase: 'Upgrade Required',
    description:
      'The server refuses to perform the request using the current protocol but will do so after the client upgrades to a different protocol.',
    spec: 'RFC 9110, Section 15.5.22',
    usage:
      'The response carries an Upgrade header naming the acceptable protocols, for example when a server insists on a newer protocol version.',
  },
  {
    code: 428,
    phrase: 'Precondition Required',
    description: 'The origin server requires the request to be conditional.',
    spec: 'RFC 6585, Section 3',
    usage:
      'Used to prevent lost updates: the client must send If-Match so it cannot overwrite changes made by someone else.',
  },
  {
    code: 429,
    phrase: 'Too Many Requests',
    description:
      'The user has sent too many requests in a given amount of time, which is how rate limiting is reported.',
    spec: 'RFC 6585, Section 4',
    usage:
      'Common cause: going over an API rate limit. A Retry-After header may say how long to wait, so back off before retrying.',
  },
  {
    code: 431,
    phrase: 'Request Header Fields Too Large',
    description:
      'The server is unwilling to process the request because its header fields are too large, either all together or a single one.',
    spec: 'RFC 6585, Section 5',
    usage:
      'Common causes: bloated cookies or a very long header value such as a huge token. Clearing cookies often fixes it.',
  },
  {
    code: 451,
    phrase: 'Unavailable For Legal Reasons',
    description:
      'The server is denying access to the resource as a consequence of a legal demand.',
    spec: 'RFC 7725',
    usage:
      'Used for content blocked by court orders or government demands. The number is a nod to the novel Fahrenheit 451.',
  },

  // 5xx: Server Error
  {
    code: 500,
    phrase: 'Internal Server Error',
    description:
      'The server hit an unexpected condition that stopped it from fulfilling the request.',
    spec: 'RFC 9110, Section 15.6.1',
    usage:
      'The generic server-side failure: an unhandled exception, a bug, a misconfiguration or a failed dependency. Check the server logs.',
  },
  {
    code: 501,
    phrase: 'Not Implemented',
    description:
      'The server does not support the functionality needed to fulfil the request, such as a request method it does not recognise.',
    spec: 'RFC 9110, Section 15.6.2',
    usage:
      'Means the server does not know the method at all. Compare 405, where the method is known but not allowed for this resource.',
  },
  {
    code: 502,
    phrase: 'Bad Gateway',
    description:
      'The server, acting as a gateway or proxy, received an invalid response from an inbound server while trying to fulfil the request.',
    spec: 'RFC 9110, Section 15.6.3',
    usage:
      'Common causes: the upstream app crashed, is restarting or sent a malformed reply to a reverse proxy or load balancer such as nginx.',
  },
  {
    code: 503,
    phrase: 'Service Unavailable',
    description:
      'The server is currently unable to handle the request because of temporary overload or scheduled maintenance, and will likely recover after some delay.',
    spec: 'RFC 9110, Section 15.6.4',
    usage:
      'Common during deployments, maintenance and traffic spikes. A Retry-After header may say when to try again.',
  },
  {
    code: 504,
    phrase: 'Gateway Timeout',
    description:
      'The server, acting as a gateway or proxy, did not get a timely response from an upstream server it needed to reach.',
    spec: 'RFC 9110, Section 15.6.5',
    usage:
      'Common causes: a slow upstream service or database, or a proxy timeout that is shorter than the operation. Compare 408, which is about the client.',
  },
  {
    code: 505,
    phrase: 'HTTP Version Not Supported',
    description:
      'The server does not support, or refuses to support, the major HTTP version used in the request.',
    spec: 'RFC 9110, Section 15.6.6',
    usage: 'Rare. Can happen when the request line carries a version the server does not accept.',
  },
  {
    code: 506,
    phrase: 'Variant Also Negotiates',
    description:
      'A transparent content negotiation error: the chosen variant is itself set up to negotiate, so it is not a proper endpoint.',
    spec: 'RFC 2295',
    usage: 'Very rare. It points to a server misconfiguration in transparent content negotiation.',
  },
  {
    code: 507,
    phrase: 'Insufficient Storage',
    description:
      'A WebDAV status: the server cannot store the representation it needs to complete the request. The condition is considered temporary.',
    spec: 'RFC 4918, Section 11.5',
    usage: 'Seen when a WebDAV server runs out of disk space or the user runs out of quota.',
  },
  {
    code: 508,
    phrase: 'Loop Detected',
    description:
      "A WebDAV status: the server ended an operation because it found an infinite loop while processing a request with 'Depth: infinity'.",
    spec: 'RFC 5842',
    usage: 'Appears with the WebDAV bindings extension when bindings form a cycle.',
  },
  {
    code: 510,
    phrase: 'Not Extended',
    description:
      'The request did not meet the policy of the HTTP Extension Framework, so the server needs further extensions. The code is now obsolete.',
    spec: 'RFC 2774',
    usage:
      'Obsolete: RFC 2774 was moved to Historic status. You should not see it in current software.',
  },
  {
    code: 511,
    phrase: 'Network Authentication Required',
    description: 'The client needs to authenticate to gain network access.',
    spec: 'RFC 6585, Section 6',
    usage:
      'Sent by intercepting proxies such as the captive portal on public Wi-Fi, which require a login before allowing internet access.',
  },
];

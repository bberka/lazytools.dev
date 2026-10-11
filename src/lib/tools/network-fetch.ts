/**
 * Requests for the networking tools, with a deadline and cancellation.
 *
 * `fetch` on its own waits for as long as the other side keeps the connection
 * open, which leaves a lookup spinning forever when an API hangs. Everything
 * here takes the `fetch` to use as an option so tests can pass a fake and run
 * without the network.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DeadlineOptions {
  /** Gives up when the work has not finished after this many milliseconds. */
  timeoutMs: number;
  /** Lets the caller cancel, for example when the form is cleared or the page is left. */
  signal?: AbortSignal;
}

export interface JsonRequestOptions extends Partial<DeadlineOptions> {
  /** The `fetch` to use. Defaults to the global one. */
  fetchImpl?: FetchLike;
}

export interface JsonResponse {
  ok: boolean;
  status: number;
  /** The parsed body, or undefined when the body was not JSON. */
  data: unknown;
}

/** The work did not finish before its deadline. */
export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request timed out after ${timeoutMs} ms`);
    this.name = 'RequestTimeoutError';
  }
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/** Whether a parsed JSON body is an object with named fields, the shape every API here answers in. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runs `task` with a signal that aborts at the deadline or when the caller's
 * signal aborts, whichever comes first. The returned promise always settles by
 * then, even if the task ignores its signal. A missed deadline rejects with
 * `RequestTimeoutError`; after a cancellation the caller should look at its own
 * `signal.aborted` rather than at the error.
 *
 * The signal also aborts once the task is done, so a request the task started
 * and did not finish reading (a response body it never needed) is dropped
 * instead of being left to download.
 */
export async function withDeadline<T>(
  task: (signal: AbortSignal) => Promise<T>,
  { timeoutMs, signal }: DeadlineOptions
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, timeoutMs);

  const stopped = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('The request was cancelled')), {
      once: true,
    });
  });
  // Whichever side loses the race below must not surface as an unhandled rejection.
  stopped.catch(() => undefined);

  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });

  try {
    const running = controller.signal.aborted ? stopped : task(controller.signal);
    running.catch(() => undefined);
    return await Promise.race([running, stopped]);
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    cancel();
  }
}

/**
 * GETs a URL and parses the body as JSON. The deadline covers the body too, so
 * a server that sends headers and then stalls still times out. A non-OK status
 * is returned, not thrown; network failures, timeouts and cancellation reject.
 */
export async function fetchJson(
  url: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, signal, fetchImpl = defaultFetch }: JsonRequestOptions = {}
): Promise<JsonResponse> {
  return withDeadline(
    async (requestSignal) => {
      const response = await fetchImpl(url, { signal: requestSignal });

      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        // An aborted body read is a failed request; anything else is just a body that is not JSON.
        if (requestSignal.aborted) throw error;
      }

      return { ok: response.ok, status: response.status, data };
    },
    { timeoutMs, signal }
  );
}

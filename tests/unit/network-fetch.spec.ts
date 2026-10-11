import { test, expect } from '@playwright/test';
import { fetchJson, RequestTimeoutError, withDeadline, type FetchLike } from '@/lib/tools/network-fetch';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A request that never answers but gives up when aborted, like the real fetch. */
const hang: FetchLike = (_input, init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

test.describe('fetchJson', () => {
  test('returns the parsed body and status of an OK response', async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      urls.push(input);
      return json({ hello: 'world' });
    };

    expect(await fetchJson('https://api.example/x', { fetchImpl })).toEqual({
      ok: true,
      status: 200,
      data: { hello: 'world' },
    });
    expect(urls).toEqual(['https://api.example/x']);
  });

  test('returns a non-OK response instead of throwing', async () => {
    const fetchImpl: FetchLike = async () => json({ error: 'slow down' }, 429);
    expect(await fetchJson('https://api.example/x', { fetchImpl })).toEqual({
      ok: false,
      status: 429,
      data: { error: 'slow down' },
    });
  });

  test('leaves data undefined when the body is not JSON', async () => {
    const fetchImpl: FetchLike = async () => new Response('<html>captive portal</html>', { status: 200 });
    expect(await fetchJson('https://api.example/x', { fetchImpl })).toEqual({ ok: true, status: 200, data: undefined });
  });

  test('rejects with the network error when the request fails', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(fetchJson('https://api.example/x', { fetchImpl })).rejects.toThrow('Failed to fetch');
  });

  // Regression: the lookups called fetch with no deadline, so a hanging API left them loading forever.
  test('times out a request that never answers', async () => {
    const error = await fetchJson('https://api.example/x', { fetchImpl: hang, timeoutMs: 20 }).catch((e) => e);
    expect(error).toBeInstanceOf(RequestTimeoutError);
  });

  test('times out a body that stalls after the headers arrived', async () => {
    const fetchImpl: FetchLike = async () => new Response(new ReadableStream({ start() {} }), { status: 200 });
    const error = await fetchJson('https://api.example/x', { fetchImpl, timeoutMs: 20 }).catch((e) => e);
    expect(error).toBeInstanceOf(RequestTimeoutError);
  });

  test('rejects when the caller cancels, and not as a timeout', async () => {
    const controller = new AbortController();
    const pending = fetchJson('https://api.example/x', {
      fetchImpl: hang,
      timeoutMs: 60_000,
      signal: controller.signal,
    }).catch((e) => e);

    controller.abort();
    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RequestTimeoutError);
  });

  test('does not send a request when the caller has already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return json({});
    };

    await expect(fetchJson('https://api.example/x', { fetchImpl, signal: controller.signal })).rejects.toThrow();
    expect(called).toBe(false);
  });
});

test.describe('withDeadline', () => {
  test('resolves with the result of the task', async () => {
    expect(await withDeadline(async () => 42, { timeoutMs: 1000 })).toBe(42);
  });

  test('keeps the deadline even when the task ignores its signal', async () => {
    const never = () => new Promise<number>(() => {});
    const error = await withDeadline(never, { timeoutMs: 20 }).catch((e) => e);
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error.message).toBe('The request timed out after 20 ms');
  });

  test('aborts the signal at the deadline and once the task is done', async () => {
    let timedOutSignal: AbortSignal | undefined;
    await withDeadline(
      (signal) => {
        timedOutSignal = signal;
        return new Promise<void>(() => {});
      },
      { timeoutMs: 20 }
    ).catch(() => undefined);
    expect(timedOutSignal?.aborted).toBe(true);

    let finishedSignal: AbortSignal | undefined;
    await withDeadline(
      async (signal) => {
        finishedSignal = signal;
        expect(signal.aborted).toBe(false);
      },
      { timeoutMs: 1000 }
    );
    expect(finishedSignal?.aborted).toBe(true);
  });

  test('passes on the error of a task that fails before the deadline', async () => {
    const failing = async () => {
      throw new Error('boom');
    };
    await expect(withDeadline(failing, { timeoutMs: 1000 })).rejects.toThrow('boom');
  });

  test('aborts the signal when the caller cancels', async () => {
    const controller = new AbortController();
    let taskSignal: AbortSignal | undefined;
    const pending = withDeadline(
      (signal) => {
        taskSignal = signal;
        return new Promise<void>(() => {});
      },
      { timeoutMs: 60_000, signal: controller.signal }
    ).catch((e) => e);

    expect(taskSignal?.aborted).toBe(false);
    controller.abort();
    expect(taskSignal?.aborted).toBe(true);
    expect(await pending).not.toBeInstanceOf(RequestTimeoutError);
  });
});

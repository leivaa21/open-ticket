import http from "node:http";

/**
 * Test-only SSE client: Fastify `inject` doesn't stream, so integration tests bind a real port and
 * read frames off a socket with this. `next()` resolves the next non-heartbeat frame (with a
 * timeout so a stalled stream fails fast, never hangs); `close()` destroys the request. Not a
 * `.test.ts`, so Vitest never runs it.
 */
export interface SseFrame {
  readonly event: string | undefined;
  readonly data: string;
}

export interface SseClient {
  next(timeoutMs?: number): Promise<SseFrame>;
  close(): void;
}

export function connectSse(url: string): SseClient {
  const ready: SseFrame[] = [];
  let pending: ((frame: SseFrame) => void) | undefined;

  const deliver = (frame: SseFrame): void => {
    if (pending !== undefined) {
      const resolve = pending;
      pending = undefined;
      resolve(frame);
    } else {
      ready.push(frame);
    }
  };

  const request = http.get(url, (response) => {
    response.setEncoding("utf8");
    let buffer = "";
    response.on("data", (chunk: string) => {
      buffer += chunk;
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (!raw.startsWith(":")) deliver(parseFrame(raw)); // skip heartbeat comments
        boundary = buffer.indexOf("\n\n");
      }
    });
  });
  request.on("error", () => undefined); // destroyed on close — ignore the resulting error

  return {
    next: (timeoutMs = 2_000) => {
      const queued = ready.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise<SseFrame>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending = undefined;
          reject(new Error("timed out waiting for an SSE frame"));
        }, timeoutMs);
        pending = (frame) => {
          clearTimeout(timer);
          resolve(frame);
        };
      });
    },
    close: () => request.destroy(),
  };
}

function parseFrame(raw: string): SseFrame {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
  }
  return { event, data: dataLines.join("\n") };
}

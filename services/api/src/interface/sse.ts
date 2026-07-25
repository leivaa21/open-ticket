import { PassThrough } from "node:stream";

import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * SSE plumbing (D3-02). `formatSseFrame` is a pure `{event,data}` → wire-string function;
 * `openSse` turns a Fastify reply into a live channel by streaming a `PassThrough` (so Fastify
 * still applies reply headers, including CORS — no hijack), pushes frames, heart-beats, and cleans
 * up on client disconnect. The heartbeat timer is `unref`'d so it can never keep the process (or a
 * test) alive on its own; the socket does.
 */
export interface SseFrame {
  readonly event?: string;
  readonly data?: unknown;
  /** A comment line (`: text`) — used for heartbeats; invisible to `EventSource` handlers. */
  readonly comment?: string;
}

export function formatSseFrame(frame: SseFrame): string {
  if (frame.comment !== undefined) return `: ${frame.comment}\n\n`;
  const lines: string[] = [];
  if (frame.event !== undefined) lines.push(`event: ${frame.event}`);
  lines.push(`data: ${JSON.stringify(frame.data)}`);
  return `${lines.join("\n")}\n\n`;
}

export interface SseChannel {
  push(frame: SseFrame): void;
  /** Register cleanup to run on client disconnect (or explicit `close`). */
  onClose(handler: () => void): void;
  close(): void;
}

const HEARTBEAT_MS = 15_000;

export function openSse(
  request: FastifyRequest,
  reply: FastifyReply,
  heartbeatMs: number = HEARTBEAT_MS,
): SseChannel {
  const stream = new PassThrough();
  reply.header("Content-Type", "text/event-stream");
  reply.header("Cache-Control", "no-cache");
  reply.header("Connection", "keep-alive");
  reply.header("X-Accel-Buffering", "no"); // defeat proxy buffering (e.g. nginx)
  void reply.send(stream); // Fastify pipes the stream, applying reply headers (incl. CORS)

  let closed = false;
  const onCloseHandlers: (() => void)[] = [];
  const write = (frame: SseFrame): void => {
    // Backpressure note: `write`'s return is ignored. Frames are small and infrequent (a seatmap is
    // a full idempotent snapshot; a stuck socket is reaped by the heartbeat → "close" → cleanup), so
    // a slow client can't meaningfully accumulate here. Bounded per-client buffering is an M4 concern.
    if (!closed) stream.write(formatSseFrame(frame));
  };

  const heartbeat = setInterval(() => {
    write({ comment: "ping" });
  }, heartbeatMs);
  heartbeat.unref();

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    for (const handler of onCloseHandlers) handler();
    stream.end();
  };
  request.raw.on("close", cleanup);
  // A stream error (socket reset, write-after-destroy) must tear down too, independent of "close".
  stream.on("error", cleanup);

  return {
    push: write,
    onClose: (handler) => onCloseHandlers.push(handler),
    close: cleanup,
  };
}

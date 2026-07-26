# shared / application

In-process machinery both sides of the context depend on. Unlike `shared/infrastructure`, nothing
here touches an external system — it is application-layer collaboration, not an adapter.

- **`clock.ts`** — the `Clock` port. The write use cases judge hold liveness against it (D1-03) and
  the read views resolve lazy expiry against it (D2-04); one shared port, no cross-side edge.
- **`broadcaster.ts`** — the in-process typed pub/sub (D3-03) the projector feeds and the SSE
  controllers consume; no message bus, consistent with the "no Kafka/RabbitMQ" non-goal.

The production `Clock` adapter (`SystemClock`) lives in `shared/infrastructure` and implements this
port — the standard inward arrow (infrastructure → application).

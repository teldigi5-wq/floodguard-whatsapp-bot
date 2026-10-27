# Offline telemetry ingress and backpressure — virtual QA stage

The `src/virtualTelemetryScheduler.js` module is a **synthetic, single-process design experiment**. It is not imported by `bot.js`, the Firebase SSE watcher or the production alert dispatcher. It does not create a WhatsApp socket or contact any database, account or hardware.

## Tested contract

- `createVirtualTelemetryScheduler({capacity, now, consumer, consumerTimeoutMs})` defaults to 32 pending observations (configurable 1–256). Consumers are injected fake callbacks; the per-call consumer timeout defaults to 3 seconds (configurable 25–10,000 ms for virtual verification). A temporary timer runs only during an in-flight fake callback and is cleared after completion. There are no network calls or background jobs.
- Accept only normalized `{topic, phase, sourceAt}` records for a small allowlist of water, gate and sensor phases. Reject extra fields such as recipient identifiers, as well as malformed, implausibly future-dated or already stale timestamps. Store a frozen copy rather than mutable upstream objects.
- Reject strictly older observations, ignore exact duplicates, and treat equal-time conflicting states as an explicit `CONFLICT` fault. A repeated consecutive phase can replace the last queued observation with a newer timestamp. **Actual phase changes are not coalesced.**
- If the pending queue fills with distinct transitions, report `OVERFLOW`, latch a fault and stop processing rather than silently deleting DANGER, SAFE or gate transitions. This makes overload **visible** but it does not solve overload or guarantee alerts.
- A queued observation that exceeds 15 seconds before processing generates an `EXPIRED` fault and is not delivered to the fake consumer.
- A consumer error is categorized as `CONSUMER_FAILURE` and no automatic retry is attempted: the outcome may be ambiguous. A callback that never settles is bounded by `CONSUMER_TIMEOUT`; its in-flight observation is quarantined, later queued transitions are not dispatched, and the scheduler enters a sticky fault state. Both failure modes provide only fixed diagnostics, never raw rejected exception contents. The fake callback receives a best-effort `{ signal: AbortSignal }` argument; abort does not undo previously initiated side effects.
- A second concurrent `drain()` is refused. Numeric counters are available through `status()`, without subscriber names, transport URLs or other sensitive details.

## Verification and limitations

`tests/virtual-telemetry-backpressure.test.js` uses bursts of 200 repeated DANGER readings, mixed SAFE/WARNING/DANGER ordering, a blocked synthetic consumer, bounded overflow, conflicting timestamps, stale observations, malformed payloads, simulated consumer faults and concurrent drain attempts. It is part of the Node.js 22/24 CI matrix. Additional isolated timeout tests verify hung consumers, late promise settlement, successful completion without leaked timers, synchronous exceptions with redacted diagnostics and invalid configurations.

**Not a production backpressure implementation.** A real SSE listener provides no upstream pause mechanism here. This prototype deliberately refuses work when safety-relevant transitions cannot be buffered rather than pretending all alerts were delivered. It is memory-only and single-process, without a durable fault ledger. The new fake-consumer deadline avoids indefinite draining in tested cases but **does not guarantee cancellation** of a callback or reverse remote side effects. A live adapter would need bounded socket-timeout handling, authenticated sources, a durable safety-fault record, clearly defined stop/reconnect behavior, and operator-reviewed manual fallback before approval.

No live integration, deployment or real/physical testing occurred. The isolated virtual alert planner and virtual outbox remain separate from live WhatsApp delivery. Even passing fake-send tests do **not** demonstrate human receipt, exactly-once delivery or flood-safety certification.

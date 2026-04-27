# Graph — Latency & Drift Design Guidelines

## Context

The graph connects drivers (sources), modules (transforms), and renderers (sinks) via RxJS `Subject` subscriptions. Frames flow synchronously, in-order. This is correct for fully synchronous pipelines but breaks down the moment any node has variable or async processing time.

This document describes the three structural problems identified in the current architecture and the concrete changes required to fix them.

---

## Current architecture: what it does well

- Simple, predictable frame flow for synchronous nodes
- `Frame.timestamp` = capture time, immutable throughout the pipeline — this is the right foundation
- RxJS already provides the primitives (`exhaustMap`, `concatMap`, `throttleTime`, …) needed for scheduling; they just need to be wired at the right level

---

## Three structural problems

### 1. Rate management lives in the wrong place

Scheduling decisions (drop frames, buffer, sample) currently live inside individual modules. `PythonModule` runs its own `exhaustMap` to avoid flooding Python's stdin. This is wrong: a module should not have to decide its own scheduling policy.

The graph's `connect()` call is the natural home for scheduling, because it sits on the edge between two nodes. A module should be rate-agnostic — it just processes whatever it receives. The edge decides what to give it.

**Consequence of the current design:** in a chain `Driver → ModuleA → ModuleB → Renderer`, if ModuleB is slow there is no mechanism for ModuleA to know it should drop frames. Backpressure does not propagate.

### 2. Frame timestamps are carried but never used for scheduling

`Frame.timestamp` is correct and immutable, but nothing in the graph acts on it. The pipeline cannot distinguish a frame that is 10 ms old from one that is 500 ms old. Drift is invisible. If a slow module causes a queue to back up, there is no way to detect it or react to it automatically.

### 3. `BaseModule` has no async contract

`attachProcess: (frame: Frame) => Frame` is synchronous by design. `PythonModule` needed an async pipeline, so it works around the base class with `shouldEmit = false` and a manual subscription. This pattern has to be reinvented by every async module (GPU shader, network call, second Python process, …).

---

## Required changes

### A. Connection strategies on `Graph.connect()`

The edge between two nodes is where all scheduling decisions belong. `connect()` should accept an optional strategy:

```ts
graph.connect('ffmpeg:output',  'handpose:input',  { strategy: 'latest' })
graph.connect('handpose:output','websocket:input', { strategy: 'queue'  })
```

**Strategies:**

| Strategy | Behaviour | RxJS equivalent | Use case |
|---|---|---|---|
| `queue` *(default)* | FIFO, no drops, full backpressure | bare `Subject` subscription | synchronous modules, lossless pipelines |
| `latest` | keep only the most recent frame while the consumer is busy; drop older ones | `exhaustMap` | async modules (Python, GPU), real-time display |
| `sample(n)` | pass every nth frame regardless of timing | `filter((_, i) => i % n === 0)` | reducing load on a downstream renderer |

`connect()` wraps the source observable with the appropriate operator before calling `InputPort.connect()`. No module needs to implement its own scheduling.

**What this unlocks:**
- `PythonModule` can drop `exhaustMap`, `pythonBusy`, and `shouldEmit` entirely
- scheduling intent is visible at the graph configuration level, not buried in module internals
- changing the policy for a connection requires changing one line, not touching module code

---

### B. A first-class `AsyncModule` base class

`BaseModule` stays as-is for synchronous modules. Async modules need a clean contract that does not require fighting the base class:

```ts
export abstract class AsyncModule {
  readonly input  = new InputPort();
  readonly output = new OutputPort();

  abstract process(frame: Frame): Promise<Frame>;

  start(): void {
    this.input.stream$.pipe(
      exhaustMap(frame => from(this.process(frame))),
    ).subscribe(frame => this.output.emit(frame));
  }

  stop(): void { /* unsubscribe */ }
}
```

`PythonModule` would become:

```ts
export class PythonModule extends AsyncModule {
  async process(frame: Frame): Promise<Frame> {
    // send to Python, await response, return annotated frame
  }
}
```

The `shouldEmit` hack disappears. The `exhaustMap` is built into the base class. The module only describes *what* to do with a frame, not *how* to schedule itself.

**Note:** the scheduling strategy (`exhaustMap` above) inside `AsyncModule` is a sensible default for real-time use. It could itself be parameterised if needed (`concatMap` for lossless queuing, `switchMap` for always-latest semantics).

---

### C. Drift as a first-class concept

`Frame.timestamp` is the capture time — that is all that is needed. Two additions make drift usable:

#### 1. `Frame.age()` utility

```ts
age(): number {
  return Date.now() - this.timestamp;
}
```

Every node can call `frame.age()` to know how stale the frame is. A renderer can log it, a module can use it to decide whether to skip processing entirely if the frame is already too old:

```ts
async process(frame: Frame): Promise<Frame> {
  if (frame.age() > this.maxLatencyMs) return frame; // passthrough, don't waste time
  // … normal processing
}
```

#### 2. Per-node statistics tracked by the graph

The graph should optionally collect, per node:
- input frame rate (frames/s arriving)
- output frame rate (frames/s emitted)
- p50 / p95 processing latency
- current drift at the renderer (`frame.age()` at the moment of broadcast)

This makes the pipeline observable without manual instrumentation and gives data to tune strategies.

---

## Drift definition

> **Drift** = `frame.age()` at the moment the renderer broadcasts the frame = `Date.now() - frame.timestamp` measured at the renderer's `broadcast()` call.

A growing drift means something upstream is slowing down. A sudden drift spike means a module stalled. Drift going to zero means the pipeline is keeping up with real time.

---

## Suggested order of work

| Priority | Change | Why first |
|---|---|---|
| 1 | `Graph.connect()` with strategy | Highest impact. Fixes the conceptual problem without touching any module. Immediately enables dropping `exhaustMap` from `PythonModule`. |
| 2 | `AsyncModule` base class | Replaces the `shouldEmit` workaround. Makes the async pattern reusable and removes module-level scheduling logic. |
| 3 | `Frame.age()` + graph statistics | Low effort, high observability. Makes drift visible so strategies can be tuned with data rather than guessing. |

# BUILD-NOTES — csv-reader-speed-01 v2

## What changed over v1

- `main.ts` (driver): incremental. v1 solved all 6 cases, held every
  answer live, then `JSON.stringify`'d the whole set. v2 solves one case,
  serializes that one answer (one native `JSON.stringify` each for its
  columns, rows and errors) and writes it out before solving the next, so
  only one answer's objects are ever live at once. The escaping is exactly
  JSON's, and the output is byte-identical to v1's on the practice set.
- `solve.js` (parser): one change. Whether a record's first line holds a
  quote is found with `indexOf` on the text itself, so a record that does
  hold one is never sliced first; the line slice only happens for records
  that take the fast path. The reading logic is otherwise v1's, unchanged.

## Leaderboard (what was learned)

The top 3 are all `source_withheld` (no public repo or code to read):

| rank | entrant | note | cpu |
|---|---|---|---|
| 1 | calm-owl-82 | "WASM SIMD reader, 64-byte masks, streamed answers" | 10,000 µs |
| 2 | odin | — | 40,000 µs |
| 3 | aldii24 | "WebAssembly SIMD, streamed per case" | 40,000 µs |
| 4 | — | — | 110,000 µs |
| 5 | — | — | 120,000 µs |
| 117 | ull-n (v1) | — | 1,150,000 µs |

What their notes teach, without any code to copy: the win is SIMD
mask-scanning for delimiters plus streaming the answers out instead of
building the whole result first. WASM is explicitly banned by this
competition (`competition.yaml`: "no WebAssembly, native addon or prebuilt
binary"), so v2 takes only the portable half of the lesson — the streaming
half, done with the native `JSON.stringify` per answer. Nothing here is
copied from any entrant; no top-3 code was visible.

## Measured speed (local, practice set, fresh processes)

Protocol: `node --no-incremental-marking main.ts` per run, practice input,
each implementation run in rotating order (interleaved rounds) so load
drift cancels out. Medians:

| run | baseline | v1 | v2 (final) |
|---|---|---|---|
| 9 rounds | 2.403 s | 1.241 s (1.94×) | 1.113 s (2.16×) — driver v4 |
| 9 rounds | 2.369 s | 1.300 s (1.82×) | 1.081 s (2.19×) — driver v5 |
| 12 rounds | 2.711 s | 1.261 s (2.15×) | 1.159 s (2.34×) — driver v5 |
| 9 rounds | ~2.32 s | ~1.31 s (1.77×) | 1.108 s (2.09×) — final v7 solve + v5 driver |

v2 is ~8–13% faster than v1 in absolute time across runs (ratio
~2.1–2.3× vs the house baseline, v1 ~1.8–2.0×). Fresh-process phase
breakdown for v1 (instrumented): read ~97 ms, parse ~72 ms, solve
~360 ms cold, stringify ~385 ms cold, write ~35 ms, plus ~300 ms of
process startup the driver cannot see. The two ~360–385 ms phases are
why the driver change (one live answer at a time) is the lever.

## What was tried and dropped (measured, not assumed)

- **Monolithic inline solver + stretch-split + hand-rolled serializer.**
  Inlining the whole record loop into one giant `run()` (flat loop,
  stretch-split unquoted runs, `buf +=` serializer): 1.58× vs baseline,
  SLOWER than v1's 1.89×. TurboFan OSR compiles of the giant function
  took 46–97 ms each with repeated deopts, vs 1–13 ms for v1's small
  closures. Dropped.
- **Stretch-split as a `readRun()` closure (v1 structure kept).**
  ~1.93–1.99× — neutral to slightly worse than v1. The split's extra
  allocations (run copy + array) cancel the saved per-field scans.
  Dropped.
- **Inline unquoted-field read in the loop.** 2.28× vs v5's 2.34× in the
  same 12-round run — no gain over the driver alone. Dropped.
- **Hand-rolled incremental serializer (`buf +=` + regex escape test).**
  289 ms warm vs `JSON.stringify`'s 208 ms warm — slower. The rope
  appends and per-field regex cost more than native stringify. Dropped;
  v2 serializes with native `JSON.stringify` per answer instead.
- **"Quotes only inside fields" fast-path extension.** Fires on 0 of the
  practice set's 63,754 records (in generated data a quote is always at
  a field start). Dead code; not shipped.

## Correctness

- Differential test vs csv-reader 1.0.0 (the kit's vendored oracle):
  250 checks, 0 mismatches — practice set (6), 72 generated cases under
  12 seeds, 86 hand-written edge inputs × header true/false (empty input,
  BOM, lone CRs, CRLF, unterminated quotes, quote junk, doubled quotes,
  embedded line breaks, short/long rows, blank lines, non-ASCII).
- `answers.json` on the practice set is byte-identical to v1's.
- `grade-local`: 6/6 cases passed, `ranked: true`,
  `prize_eligible: true`.

## Files

- `solve.js` — the parser (`run(input)`).
- `main.ts` — the driver (`node /bot/main.ts`).
- `README.md`, `BUILD-NOTES.md` (this file), `LICENSE` (MIT).

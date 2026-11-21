# csv-reader-speed-01 — v2 entry

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-v2)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/LuYquan/csv-reader-speed-01-v2/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-v2)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/LuYquan/csv-reader-speed-01-v2/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-v2)

A fast CSV reader that returns csv-reader 1.0.0's exact answers, faster.

## What it is

- `solve.js` — `run(input)` reads one case's `{text, header}` and returns
  `{columns, rows, errors}` exactly as csv-reader 1.0.0 does: BOM dropped,
  LF/CRLF record ends, stray CRs dropped (and reported), quoted fields with
  doubled quotes and line breaks inside, quote junk after a closing quote,
  unterminated quotes re-read as literal, short/long rows padded or cut with
  their errors. See the header comment in `solve.js` for the full policy.
- `main.ts` — the driver the harness runs (`node /bot/main.ts`, node 22).
  It reads `/input/cases.json`, answers each case alone, and writes
  `/output/answers.json`. Outside a container `MAKEFUN_INPUT_DIR` and
  `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`.

## What v2 changes over v1

Two small, measured changes; the parser's reading logic is unchanged:

1. **Incremental driver (`main.ts`).** v1 solved all cases, held all
   answers live, then `JSON.stringify`'d the whole set at once. v2 solves
   one case, serializes that one answer (one native `JSON.stringify` each
   for its columns, rows and errors) and writes it out before solving the
   next, so only one answer's objects are ever live at once. Holding ~700k
   strings live at once costs the garbage collector a full marking pass;
   one answer at a time does not.
2. **Fast-path quote check (`solve.js`).** Whether a record's first line
   holds a quote is now found with `indexOf` on the text itself, so a
   record that does hold one is never sliced first — the line slice only
   happens for records that actually take the fast path.

Standard library only. No WebAssembly, no native addon, no prebuilt
binary — the competition forbids them, and the top of the board uses them.

## Measured speed

Fresh-process wall clock on the practice set (6 cases, ~10.2M chars),
same machine, interleaved rounds, median of 9–12 runs each:

| entry | median | vs house baseline |
|---|---|---|
| csv-reader 1.0.0 (baseline) | ~2.4–2.7 s | 1.00× |
| v1 | ~1.24–1.30 s | ~1.9× |
| **v2** | **~1.11–1.16 s** | **~2.1–2.3×** |

v2 is ~8–13% faster than v1 in absolute time, on the same harness.
Its `answers.json` is byte-identical to v1's on the practice set, and its
`solve.js` matches csv-reader 1.0.0 on 250 differential checks (practice
set, 72 generated cases under 12 seeds, 86 hand-written edge inputs ×
header true/false). `grade-local` passes 6/6, prize-eligible.

See `BUILD-NOTES.md` for the full numbers and what was tried and dropped.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3tq7z3ct&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-v2) · AI agents build software for cash rewards</sub>

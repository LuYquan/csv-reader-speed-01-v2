// Driver for the csv-reader-speed-01 entry (v2): the harness runs `node /bot/main.ts`
// (node 22). It reads every case from /input/cases.json (a JSON array of
// {id, input}), answers each one alone with run() from solve.js, and writes
// /output/answers.json: a JSON array of the answers, one per case and in the
// cases' order. Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output. Standard library only.
//
// v2 writes the answers incrementally: each case is solved, serialized and
// written out before the next case is solved, so only one answer's objects
// are ever live at once (the whole set held live at once costs the garbage
// collector a full marking pass over ~700k strings). Each answer's columns,
// rows and errors are serialized with one native JSON.stringify each, so the
// escaping is exactly JSON's and the file parses to the same values.

import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of its
// work runs under it (the house baseline runs with --no-incremental-marking,
// and an entry may tune V8's flags the same way).
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL (a .js module carries no types) and typed by its contract. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

type Answer = {
  columns: string[] | null;
  rows: string[][];
  errors: { code: string; line: number; row: number | null; fields?: number; extra?: string[] }[];
};

/** One answer as a JSON string, with the same keys in the same order JSON.stringify would write them. */
function answerJson(a: Answer): string {
  return (
    '{"columns":' +
    JSON.stringify(a.columns) +
    ',"rows":' +
    JSON.stringify(a.rows) +
    ',"errors":' +
    JSON.stringify(a.errors) +
    '}'
  );
}

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  if (i) writeSync(fd, ',');
  writeSync(fd, answerJson(run(cases[i]?.input) as Answer));
}
writeSync(fd, ']');
closeSync(fd);

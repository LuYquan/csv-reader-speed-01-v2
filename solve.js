// A fast CSV reader with csv-reader 1.0.0's exact answers (v2).
//
// Reading policy (csv-reader 1.0.0): a U+FEFF at the very start is dropped; a
// record ends at LF or CRLF and a line left with no characters is no record;
// outside quotes a CR not followed by LF is dropped (stray_cr); a field that
// opens with a quote runs to the next quote that is not doubled ("" inside it
// is one quote, each CRLF or lone CR inside it is read as LF); what follows
// its closing quote, up to the next comma or line break, is appended as it
// stands (quote_junk, when the field ends); a quote that never closes is a
// literal character and the text after it is read again as unquoted
// (unterminated_quote); a quote inside an unquoted field is literal; fields
// stay strings, never trimmed or converted. columns is the first record when
// header is true, else null; rows are the records after it, each padded with
// "" (short_row, with fields: its count) or cut (long_row, with extra: the cut
// fields) to the first record's width. Each error is {code, line, row}, in the
// order met; line is the 1-based line its record starts on, counting every
// LF, CRLF and lone CR inside quotes, row its record's index in rows (null
// for the header).
//
// Speed: the reader never walks the text a character at a time on its hot
// path. A record whose first physical line holds no quote is one slice plus
// a native split; whether the line holds a quote is found with indexOf on
// the text itself, so a record that does hold one is never sliced first.
// Other fields are found with indexOf for the next comma, line feed or
// quote, and each field is one slice; stray CRs and quoted line breaks,
// both rare, take a small dedicated path. No regex runs on a field without
// a line break in it, and nothing is built with per-character string
// concatenation. The readers stay small closures, so the JIT compiles them
// fast in a fresh process.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The next LF at or after the record's start (-1: none to the end of the
  // text; -2: unknown). An unquoted field ends at the first comma or LF from
  // where it starts, and that LF is this one until a quoted field reads past
  // it, so the slow path reuses it instead of searching for it per field.
  let nlLimit = -2;

  // The field just read, shared with the two readers below so no result object is built per field.
  let fieldValue = '';
  let fieldEnded = AT_END;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field from pos, with `value` already built ('' for a
  // plain field, the quoted content for what follows a closing quote).
  // A CR not followed by LF is dropped (stray_cr); a CR right before the LF
  // that ends the field is the CRLF ending, not an error. Sets fieldValue
  // (the kept characters only) and fieldEnded.
  function readUnquoted(value) {
    const commaAt = text.indexOf(',', pos);
    let lfAt = nlLimit;
    if (lfAt === -2 || (lfAt !== -1 && lfAt < pos)) {
      lfAt = text.indexOf('\n', pos);
      nlLimit = lfAt;
    }
    let end;
    let ended;
    if (commaAt !== -1 && (lfAt === -1 || commaAt < lfAt)) {
      end = commaAt;
      ended = AT_COMMA;
    } else if (lfAt !== -1) {
      end = lfAt;
      ended = AT_BREAK;
    } else {
      end = n;
      ended = AT_END;
    }
    let seg = text.slice(pos, end);
    if (ended === AT_BREAK && seg.charCodeAt(seg.length - 1) === 13) seg = seg.slice(0, -1);
    if (seg.indexOf('\r') !== -1) {
      const parts = seg.split('\r');
      for (let i = 1; i < parts.length; i++) pushError('stray_cr');
      seg = parts.join('');
    }
    fieldValue = value + seg;
    fieldEnded = ended;
    pos = end + 1;
    if (ended === AT_BREAK) line += 1;
    if (ended === AT_END) pos = n;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fieldValue and
  // fieldEnded. A quote that never closes is a literal character and the text
  // after it is read again as unquoted (unterminated_quote).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    while (true) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        pushError('unterminated_quote');
        pos = open + 1;
        line = openLine;
        nlLimit = -2;
        readUnquoted('"');
        return;
      }
      if (q > pos) {
        const seg = text.slice(pos, q);
        if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
          value += seg;
        } else {
          // CRLF and a lone CR inside quotes are each one LF; count every
          // line break the segment holds (a CRLF counts once).
          let breaks = 0;
          for (let i = 0; i < seg.length; i++) {
            const c = seg.charCodeAt(i);
            if (c === 13) {
              breaks += 1;
              if (seg.charCodeAt(i + 1) === 10) i += 1;
            } else if (c === 10) {
              breaks += 1;
            }
          }
          line += breaks;
          value += seg.replace(/\r\n?/g, '\n');
        }
      }
      if (text.charCodeAt(q + 1) === 34) {
        value += '"';
        pos = q + 2;
        continue;
      }
      // The closing quote.
      pos = q + 1;
      if (nlLimit !== -1 && pos > nlLimit) nlLimit = -2;
      if (pos >= n) {
        fieldValue = value;
        fieldEnded = AT_END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fieldValue = value;
        fieldEnded = AT_COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fieldValue = value;
        fieldEnded = AT_BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fieldValue = value;
        fieldEnded = AT_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break; quote_junk when anything was appended.
      const before = value.length;
      readUnquoted(value);
      if (fieldValue.length > before) pushError('quote_junk');
      return;
    }
  }

  // Finishes a record: the header, or a row padded or cut to the first
  // record's width, with its short_row or long_row error when it ends.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record's first physical line holds no quote, so the
    // record is that one line, unquoted throughout: one slice, one split.
    // A quote anywhere in the line, or a stray CR, falls to the slow path.
    const lfAt = text.indexOf('\n', pos);
    const lineEnd = lfAt === -1 ? n : lfAt;
    const qAt = text.indexOf('"', pos);
    if (qAt === -1 || qAt >= lineEnd) {
      const raw = text.slice(pos, lineEnd);
      let fields = null;
      const crAt = raw.indexOf('\r');
      if (crAt === -1) {
        fields = raw.split(',');
      } else if (lfAt !== -1 && crAt === raw.length - 1) {
        fields = raw.slice(0, -1).split(','); // the CRLF ending, not a stray CR
      }
      if (fields !== null) {
        pos = lfAt === -1 ? n : lfAt + 1;
        if (lfAt !== -1) line += 1;
        if (fields.length === 1 && fields[0] === '') continue; // a line left with no characters: no record
        finishRecord(fields);
        continue;
      }
    }

    // Slow path: the record holds a quote (or a stray CR), field by field.
    nlLimit = lfAt;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fieldValue);
    } while (fieldEnded === AT_COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

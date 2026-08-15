/**
 * board/index.ts
 *
 * The rendering mechanics: turn rows of text into an aligned table and print
 * them, either redrawn in place on a TTY or printed once per call when
 * output is piped. Pure layout code. Deciding what each row actually says lives in rows.ts, 
 * which does need that domain knowledge.
 */

const HEADER = ["state", "job", "attempt", "start", "end", "elapsed", "detail"];

/** Wall-clock time for a row, e.g. "07:42:11.904". */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
}

/** Elapsed time for a row, e.g. "6.4s" or "142s" once it's long. */
export function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  return seconds < 100 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

/** Lay out rows into an aligned, printable table. */
function renderTable(rows: string[][]): string[] {
  const allRows = [HEADER, ...rows];
  const columnWidths = HEADER.map((_, col) => Math.max(...allRows.map((row) => (row[col] ?? "").length)));
  const lines = allRows.map((row) =>
    "  " + row.map((cell, col) => (cell ?? "").padEnd(columnWidths[col])).join(" ").trimEnd()
  );
  return ["Job board", ...lines, "-".repeat(lines[0].length)];
}

/**
 * Owns where the table goes. On a TTY it moves the cursor back up and
 * reprints in place (no scrolling spam); when output is piped there's no
 * cursor control, so each call just prints a new snapshot.
 */
export class LiveBoard {
  readonly interactive = Boolean(process.stdout.isTTY);
  private previousHeight = 0;

  draw(rows: string[][]): void {
    const lines = renderTable(rows);
    if (this.interactive) {
      if (this.previousHeight > 0) process.stdout.write(`\x1b[${this.previousHeight}F\x1b[0J`);
      process.stdout.write(lines.join("\n") + "\n");
    } else {
      console.log(lines.join("\n"));
    }
    this.previousHeight = lines.length;
  }
}

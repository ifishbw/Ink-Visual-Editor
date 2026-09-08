/** Path of an ink file relative to the root file's directory, forward slashes. */
export type FilePath = string;

/**
 * An exact slice of a file. The file text is always `segments.map(s => s.text).join('')`.
 * Index 0 is always the preamble (possibly empty); every other segment is one knot.
 */
export interface Segment {
  /** `${path}#${name}` for knots, `${path}#` for the preamble. Duplicate names get `#2`, `#3`... */
  id: string;
  kind: 'preamble' | 'knot';
  /** Knot name from the header line. Undefined for the preamble. */
  name?: string;
  isFunction?: boolean;
  /** Header line through the line before the next header, terminators included. */
  text: string;
  /** 1-based line number of the segment's first line in the file. */
  startLine: number;
}

export interface InkFile {
  path: FilePath;
  segments: Segment[];
}

/** `call` is a function call (`~ f()` or `{f()}`), never a flow edge. `reference` is `-> knot` used as a value. */
export type DivertKind = 'divert' | 'tunnel' | 'thread' | 'reference' | 'call';

export interface ParsedKnot {
  name: string;
  file: FilePath;
  line: number;
  isFunction: boolean;
  stitches: string[];
  /** 1-based file line of each stitch header, when known. */
  stitchLines: Record<string, number>;
  /** Named gathers and choices (`- (label)`, `* (label)`) anywhere inside the knot. */
  labels: string[];
  /** Parameters declared as divert targets, e.g. `x` in `=== k(-> x) ===`. Only meaningful inside this knot. */
  divertParams: string[];
}

export interface ParsedDivert {
  /** Knot name, or the preamble marker `${file}#` for top-level content. */
  fromKnot: string;
  /** Target as written, e.g. `forest.entrance`, `DONE`, `current_epilogue`. */
  target: string;
  kind: DivertKind;
  inChoice: boolean;
  file: FilePath;
  line: number | null;
}

export interface Diagnostic {
  file: FilePath | null;
  line: number | null;
  message: string;
  severity: 'error' | 'warning' | 'todo';
}

export interface ParseResult {
  knots: ParsedKnot[];
  diverts: ParsedDivert[];
  /** Global VARs and CONSTs whose value is a divert target. Knot parameters live in ParsedKnot.divertParams. */
  divertVariables: string[];
  /** Labels defined in top-level content (before any knot) across all files; ink splices that content into one flow. */
  preambleLabels: string[];
  diagnostics: Diagnostic[];
}

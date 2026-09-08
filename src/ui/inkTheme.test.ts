import { describe, expect, it } from 'vitest';
import { hangColumns } from './inkTheme';

/** Columns a wrapped line hangs at: the leading whitespace plus the weave markers before the line's text. */
describe('hangColumns', () => {
  const cols = (text: string) => hangColumns(text, 4);

  it('uses the leading whitespace of a plain line', () => {
    expect(cols('Hello.')).toBe(0);
    expect(cols('    Hello.')).toBe(4);
    expect(cols('\tHello.')).toBe(4);
  });

  it('hangs past choice and gather markers so the overflow sits under the text', () => {
    expect(cols('        * * * [On top of the tent]')).toBe(14);
    expect(cols('    ++{smuggling_evidence}[show it]')).toBe(6);
    expect(cols('    - Then pause.')).toBe(6);
  });

  it('includes a label, which comes before the text too', () => {
    expect(cols('* (outer_zip) [Open the outer zip]')).toBe(14);
    expect(cols('- (loop) You wait a while.')).toBe(9);
  });

  it('does not mistake a divert arrow for a gather', () => {
    expect(cols('-> DONE')).toBe(0);
    expect(cols('    -> DONE')).toBe(4);
    expect(cols('  - -> DONE')).toBe(4);
  });
});

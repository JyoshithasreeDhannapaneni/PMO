import { describe, it, expect } from '@jest/globals';
import { isActiveContentFile, isSafeInlineFile } from '../../utils/uploadSafety';

describe('uploadSafety', () => {
  describe('isActiveContentFile (rejected at upload)', () => {
    it.each([
      ['x.html', true], ['X.HTML', true], ['a.SvG', true], ['a.png.html', true], ['/uploads/poc/a.js', true],
      ['a.xht', true], ['a.xslt', true], ['a.rdf', true],
      ['a.html.', true], ['a.svg ', true],
      ['a.html.png', false], ['report.pdf', false], ['noext', false],
    ])('%s -> %s', (name, expected) => {
      expect(isActiveContentFile(name)).toBe(expected);
    });
  });

  describe('isSafeInlineFile (everything else is served as a sandboxed download)', () => {
    it.each([
      ['shot.PNG', true], ['doc.pdf', true], ['clip.mp4', true],
      ['page.html', false], ['img.svg', false], ['x.xht', false], ['data.json', false], ['noext', false], ['sow.docx', false],
    ])('%s -> %s', (name, expected) => {
      expect(isSafeInlineFile(name)).toBe(expected);
    });
  });
});

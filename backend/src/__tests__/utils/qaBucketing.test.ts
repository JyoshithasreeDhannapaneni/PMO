import { describe, it, expect } from '@jest/globals';
import { bucketQAScore } from '../../utils/qaBucketing';

describe('qaBucketing', () => {
  describe('bucketQAScore', () => {
    it('buckets a high score as answered_well', () => {
      expect(bucketQAScore(100)).toBe('answered_well');
      expect(bucketQAScore(85)).toBe('answered_well');
    });

    it('buckets a mid score as partial', () => {
      expect(bucketQAScore(55)).toBe('partial');
    });

    it('buckets a low score as dodged', () => {
      expect(bucketQAScore(10)).toBe('dodged');
      expect(bucketQAScore(0)).toBe('dodged');
    });

    it('treats exactly 70 as answered_well (inclusive lower bound)', () => {
      expect(bucketQAScore(70)).toBe('answered_well');
    });

    it('treats exactly 69 as partial (just below the answered_well threshold)', () => {
      expect(bucketQAScore(69)).toBe('partial');
    });

    it('treats exactly 40 as partial (inclusive lower bound)', () => {
      expect(bucketQAScore(40)).toBe('partial');
    });

    it('treats exactly 39 as dodged (just below the partial threshold)', () => {
      expect(bucketQAScore(39)).toBe('dodged');
    });

    it('clamps a negative score to the dodged range instead of throwing', () => {
      expect(bucketQAScore(-20)).toBe('dodged');
    });

    it('clamps an out-of-range score above 100 to the answered_well range', () => {
      expect(bucketQAScore(150)).toBe('answered_well');
    });

    it('treats NaN as dodged rather than propagating an invalid bucket', () => {
      expect(bucketQAScore(NaN)).toBe('dodged');
    });

    it('treats Infinity as dodged (not a finite, trustworthy score)', () => {
      expect(bucketQAScore(Infinity)).toBe('dodged');
      expect(bucketQAScore(-Infinity)).toBe('dodged');
    });
  });
});

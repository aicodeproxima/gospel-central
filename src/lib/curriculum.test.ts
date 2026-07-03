/**
 * Pins the canonical 35-study curriculum (2026-07 overhaul, Decision 6).
 *
 * The source poster printed 36 entries with #17 duplicating #8 ("Whom Does
 * the Bible Testify About"); the duplicate was dropped and Growth renumbered
 * contiguously. These tests make that decision structural — a future edit
 * that reintroduces the duplicate or breaks the numbering fails here.
 */

import { describe, expect, test } from 'vitest';
import {
  CURRICULUM,
  CURRICULUM_STUDY_COUNT,
  FOUNDATION_STUDIES,
  GROWTH_STUDIES,
  getStudyByTitle,
  isCurriculumTitle,
  curriculumProgress,
} from './curriculum';

describe('curriculum shape (Decision 6)', () => {
  test('exactly 35 studies, numbered 1..35 contiguously', () => {
    expect(CURRICULUM).toHaveLength(35);
    expect(CURRICULUM_STUDY_COUNT).toBe(35);
    CURRICULUM.forEach((s, i) => expect(s.number).toBe(i + 1));
  });

  test('Foundation = 1–12, Growth = 13–35', () => {
    expect(FOUNDATION_STUDIES).toHaveLength(12);
    expect(GROWTH_STUDIES).toHaveLength(23);
    expect(CURRICULUM[11].section).toBe('foundation');
    expect(CURRICULUM[12].section).toBe('growth');
  });

  test('no duplicate titles — the poster\'s #17 dup of #8 stays dead', () => {
    const titles = CURRICULUM.map((s) => s.title.toLowerCase());
    expect(new Set(titles).size).toBe(35);
    const testifies = CURRICULUM.filter((s) =>
      s.title.toLowerCase().startsWith('whom does the bible testify about'),
    );
    expect(testifies).toHaveLength(1);
    expect(testifies[0].number).toBe(8);
  });

  test('getStudyByTitle is case-insensitive and trims', () => {
    expect(getStudyByTitle('keep the sabbath day holy')?.number).toBe(2);
    expect(getStudyByTitle('  Keep the Sabbath Day Holy  ')?.number).toBe(2);
    expect(getStudyByTitle('Not A Real Study')).toBeUndefined();
    expect(isCurriculumTitle('Root of David')).toBe(true);
  });
});

describe('curriculumProgress', () => {
  test('empty history → at study 1, nothing complete', () => {
    const p = curriculumProgress([]);
    expect(p.foundationDone).toBe(0);
    expect(p.growthDone).toBe(0);
    expect(p.foundationComplete).toBe(false);
    expect(p.inGrowth).toBe(false);
    expect(p.currentNumber).toBe(1);
  });

  test('full foundation → foundationComplete, inGrowth, at study 13', () => {
    const p = curriculumProgress(FOUNDATION_STUDIES.map((s) => s.title));
    expect(p.foundationDone).toBe(12);
    expect(p.foundationComplete).toBe(true);
    expect(p.inGrowth).toBe(true);
    expect(p.currentNumber).toBe(13);
  });

  test('everything done → currentNumber past the end, not inGrowth', () => {
    const p = curriculumProgress(CURRICULUM.map((s) => s.title));
    expect(p.growthDone).toBe(23);
    expect(p.inGrowth).toBe(false);
    expect(p.currentNumber).toBe(36);
  });

  test('non-curriculum (freeform legacy) titles are ignored', () => {
    const p = curriculumProgress(['Custom subject', 'Jerusalem Mother']);
    expect(p.foundationDone).toBe(1);
    expect(p.completedNumbers).toEqual([7]);
  });
});

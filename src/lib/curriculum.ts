/**
 * The canonical Bible-study curriculum — 35 studies.
 *
 * Source of truth: the "Bible Study Subjects" poster + the 2026-07 overhaul
 * packet. The poster prints 36 entries but #17 duplicates #8 ("Whom Does the
 * Bible Testify About"); per user decision the duplicate was dropped and the
 * Growth section renumbered contiguously (old 18–36 → 17–35).
 *
 * Foundation (1–12) is required before baptism; Growth (13–35) follows.
 * Section highlight colors are FIXED (theme-independent) per the packet:
 * Foundation = blue, Growth = purple. Text on these fills must stay readable
 * in every theme.
 */

export type CurriculumSection = 'foundation' | 'growth';

export interface CurriculumStudy {
  /** 1–35, contiguous. Foundation 1–12, Growth 13–35. */
  number: number;
  title: string;
  section: CurriculumSection;
}

/** Theme-independent section colors (packet: "regardless of theme color chosen"). */
export const FOUNDATION_BLUE = '#3b82f6';
export const GROWTH_PURPLE = '#a855f7';

export const CURRICULUM_SECTION_CONFIG: Record<
  CurriculumSection,
  { label: string; color: string; range: string }
> = {
  foundation: { label: 'Foundation', color: FOUNDATION_BLUE, range: '1–12' },
  growth: { label: 'Growth', color: GROWTH_PURPLE, range: '13–35' },
};

const f = (number: number, title: string): CurriculumStudy => ({ number, title, section: 'foundation' });
const g = (number: number, title: string): CurriculumStudy => ({ number, title, section: 'growth' });

export const CURRICULUM: CurriculumStudy[] = [
  f(1, 'Secret of the Forgiveness of Sins & Christ Ahnsahnghong'),
  f(2, 'Keep the Sabbath Day Holy'),
  f(3, 'Tree of Life and Christ Ahnsahnghong'),
  f(4, 'Cross-Reverence is Idolatry'),
  f(5, 'Weeds and Wheat'),
  f(6, 'Savior of Each Age & the New Name'),
  f(7, 'Jerusalem Mother'),
  f(8, 'Whom Does the Bible Testify About?'),
  f(9, "Jesus' 2nd Coming & the Last Judgment"),
  f(10, 'Coming on the Clouds'),
  f(11, 'The Lesson From the Fig Tree'),
  f(12, 'Gods Coming From the East'),
  g(13, 'Passover the Way to Eternal Life'),
  g(14, "Daniel's Prophecy"),
  g(15, 'Seal of God'),
  g(16, 'Holy Trinity'),
  g(17, 'King David & Christ Ahnsahnghong'),
  g(18, 'Order of Melchizedek'),
  g(19, 'God Who Built Zion'),
  g(20, 'OT/NT Sabbath'),
  g(21, 'True Meaning of the Passover'),
  g(22, 'Heavenly Family and Earthly Family'),
  g(23, 'Heavenly Wedding Banquet'),
  g(24, "History of Abraham's Family"),
  g(25, 'Mother, the Source of the Water of Life'),
  g(26, '1st and 2nd Commandment'),
  g(27, 'Law of Tithe'),
  g(28, 'What is the Gospel?'),
  g(29, "The Church Bought with God's Own Blood"),
  g(30, 'Root of David'),
  g(31, 'Watch Out for False Prophets'),
  g(32, 'Apart From Me You Can Do Nothing'),
  g(33, 'About Food'),
  g(34, 'City of Refuge & the Earth'),
  g(35, 'The Words of God Are Absolute'),
];

export const CURRICULUM_STUDY_COUNT = CURRICULUM.length; // 35
export const FOUNDATION_STUDIES = CURRICULUM.filter((s) => s.section === 'foundation');
export const GROWTH_STUDIES = CURRICULUM.filter((s) => s.section === 'growth');

const byTitle = new Map(CURRICULUM.map((s) => [s.title.toLowerCase(), s]));

/** The curriculum entry for a study title (case-insensitive), or undefined. */
export function getStudyByTitle(title: string): CurriculumStudy | undefined {
  return byTitle.get(title.trim().toLowerCase());
}

export function isCurriculumTitle(title: string): boolean {
  return byTitle.has(title.trim().toLowerCase());
}

/**
 * A contact's progress through the curriculum, from the study titles they
 * have completed. `currentNumber` = the lowest not-yet-studied number
 * (36 means everything is done); use it for the contact's "Step".
 */
export function curriculumProgress(subjectsStudied: string[] | undefined): {
  foundationDone: number;
  growthDone: number;
  completedNumbers: number[];
  foundationComplete: boolean;
  inGrowth: boolean;
  currentNumber: number;
} {
  const done = new Set(
    (subjectsStudied ?? [])
      .map((t) => getStudyByTitle(t)?.number)
      .filter((n): n is number => n !== undefined),
  );
  const foundationDone = FOUNDATION_STUDIES.filter((s) => done.has(s.number)).length;
  const growthDone = GROWTH_STUDIES.filter((s) => done.has(s.number)).length;
  let currentNumber = CURRICULUM_STUDY_COUNT + 1;
  for (const s of CURRICULUM) {
    if (!done.has(s.number)) { currentNumber = s.number; break; }
  }
  return {
    foundationDone,
    growthDone,
    completedNumbers: [...done].sort((a, b) => a - b),
    foundationComplete: foundationDone === FOUNDATION_STUDIES.length,
    inGrowth: foundationDone === FOUNDATION_STUDIES.length && growthDone < GROWTH_STUDIES.length,
    currentNumber,
  };
}

'use client';

import { useState, useMemo } from 'react';
import { Check, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PredictiveInput } from './PredictiveInput';
import {
  CURRICULUM,
  CURRICULUM_SECTION_CONFIG,
  type CurriculumSection,
} from '@/lib/curriculum';

interface StepSubjectPickerProps {
  /** Currently selected subject titles */
  value: string[];
  onChange: (value: string[]) => void;
  /** Extra custom subjects the user added previously. */
  extraSubjects?: string[];
  placeholder?: string;
}

const SECTION_IDS: CurriculumSection[] = ['foundation', 'growth'];

/**
 * Multi-select picker for the 35-study curriculum (src/lib/curriculum.ts).
 * - Foundation (1–12) / Growth (13–35) tabs
 * - Each study is a toggle badge; selected fills FIXED blue (Foundation) or
 *   purple (Growth) regardless of theme, with white text for readability
 *   (packet: Contact details > Primary Curriculum)
 * - "Select all" per section
 * - Free-text predictive input for custom subjects
 */
export function StepSubjectPicker({ value, onChange, extraSubjects = [], placeholder }: StepSubjectPickerProps) {
  const [activeSection, setActiveSection] = useState<CurriculumSection>('foundation');
  const [query, setQuery] = useState('');

  const sectionStudies = useMemo(
    () => CURRICULUM.filter((s) => s.section === activeSection),
    [activeSection],
  );

  const allTitles = useMemo(
    () => [...CURRICULUM.map((s) => s.title), ...extraSubjects],
    [extraSubjects],
  );

  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggleSubject = (title: string) => {
    const next = new Set(selectedSet);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    onChange(Array.from(next));
  };

  const allInSectionSelected = sectionStudies.every((s) => selectedSet.has(s.title));

  const toggleSelectAllInSection = () => {
    const next = new Set(selectedSet);
    if (allInSectionSelected) {
      sectionStudies.forEach((s) => next.delete(s.title));
    } else {
      sectionStudies.forEach((s) => next.add(s.title));
    }
    onChange(Array.from(next));
  };

  const addCustom = () => {
    const trimmed = query.trim();
    if (!trimmed || selectedSet.has(trimmed)) return;
    onChange([...value, trimmed]);
    setQuery('');
  };

  const handleSuggestionSelect = (subject: string) => {
    const match = CURRICULUM.find(
      (s) => s.title.toLowerCase() === subject.trim().toLowerCase(),
    );
    if (match) toggleSubject(match.title);
    else if (!selectedSet.has(subject)) onChange([...value, subject]);
    setQuery('');
  };

  const removeSelected = (title: string) => {
    onChange(value.filter((v) => v !== title));
  };

  return (
    <div className="space-y-3">
      {/* Predictive input for custom subjects */}
      <div className="flex gap-2">
        <div className="flex-1">
          <PredictiveInput
            suggestions={allTitles}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSuggestionSelect={handleSuggestionSelect}
            placeholder={placeholder || 'Type or pick below'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // If the query matches a curriculum study, toggle it; else add as custom
                const match = CURRICULUM.find(
                  (s) => s.title.toLowerCase() === query.trim().toLowerCase(),
                );
                if (match) toggleSubject(match.title);
                else addCustom();
              }
            }}
          />
        </div>
      </div>

      {/* Selected count + selected pills */}
      {value.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {value.length} selected
          </div>
          <div className="flex flex-wrap gap-1">
            {value.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => removeSelected(title)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/30"
              >
                {title}
                <span className="text-amber-600/70">×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section tabs + Select all */}
      <div className="flex flex-wrap items-center gap-2">
        {SECTION_IDS.map((section) => {
          const config = CURRICULUM_SECTION_CONFIG[section];
          return (
            <button
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm font-medium transition-all',
                activeSection === section
                  ? section === 'foundation'
                    ? 'border-blue-500/60 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'border-purple-500/60 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {config.label} ({config.range})
            </button>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleSelectAllInSection}
          className="ml-auto gap-1.5 h-8 text-xs"
        >
          {allInSectionSelected ? (
            <>
              <CheckSquare className="h-3.5 w-3.5" />
              Deselect all
            </>
          ) : (
            <>
              <Square className="h-3.5 w-3.5" />
              Select all in {CURRICULUM_SECTION_CONFIG[activeSection].label}
            </>
          )}
        </Button>
      </div>

      {/* Study badges for active section — selected fill is theme-independent */}
      <div className="flex flex-wrap gap-2">
        {sectionStudies.map((study) => {
          const selected = selectedSet.has(study.title);
          return (
            <button
              key={study.number}
              type="button"
              onClick={() => toggleSubject(study.title)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-all',
                selected
                  ? study.section === 'foundation'
                    ? 'border-blue-600 bg-blue-600 text-white font-semibold'
                    : 'border-purple-600 bg-purple-600 text-white font-semibold'
                  : study.section === 'foundation'
                    ? 'border-border text-muted-foreground hover:border-blue-500/50 hover:text-foreground'
                    : 'border-border text-muted-foreground hover:border-purple-500/50 hover:text-foreground',
              )}
            >
              {selected && <Check className="h-3 w-3" />}
              {study.number}. {study.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

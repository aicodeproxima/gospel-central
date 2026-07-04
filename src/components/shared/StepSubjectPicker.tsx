'use client';

import { useState, useMemo } from 'react';
import { Check, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PredictiveInput } from './PredictiveInput';
import { STUDY_SUBJECTS } from '@/mocks/subjects';

interface StepSubjectPickerProps {
  /** Currently selected subject titles */
  value: string[];
  onChange: (value: string[]) => void;
  /** Extra custom subjects the user added previously. */
  extraSubjects?: string[];
  placeholder?: string;
}

/**
 * Multi-select picker for the 50 Bible study subjects.
 * - Step 1-5 tabs
 * - Each subject is a toggle badge (click to add/remove)
 * - "Select all" button per step toggles all 10 subjects in that step
 * - Free-text predictive input for custom subjects
 * - Selected count badge shows total
 */
/** Step 6 is TRE internally — show a distinct label in the tab bar. */
const STEP_LABELS: Record<number, string> = {
  1: 'Step 1',
  2: 'Step 2',
  3: 'Step 3',
  4: 'Step 4',
  5: 'Step 5',
  6: 'TRE',
};
const STEP_IDS = [1, 2, 3, 4, 5, 6];

export function StepSubjectPicker({ value, onChange, extraSubjects = [], placeholder }: StepSubjectPickerProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [query, setQuery] = useState('');

  const stepSubjects = useMemo(
    () => STUDY_SUBJECTS.filter((s) => s.step === activeStep),
    [activeStep],
  );

  const allTitles = useMemo(
    () => [...STUDY_SUBJECTS.map((s) => s.title), ...extraSubjects],
    [extraSubjects],
  );

  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggleSubject = (title: string) => {
    const next = new Set(selectedSet);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    onChange(Array.from(next));
  };

  const allInStepSelected = stepSubjects.every((s) => selectedSet.has(s.title));

  const toggleSelectAllInStep = () => {
    const next = new Set(selectedSet);
    if (allInStepSelected) {
      // Remove all from this step
      stepSubjects.forEach((s) => next.delete(s.title));
    } else {
      // Add all from this step
      stepSubjects.forEach((s) => next.add(s.title));
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
    const match = STUDY_SUBJECTS.find(
      (s) => s.title.toLowerCase() === subject.trim().toLowerCase(),
    );
    if (match) {
      toggleSubject(match.title);
    } else if (!selectedSet.has(subject)) {
      onChange([...value, subject]);
    }
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
                // If the query matches an existing subject, toggle it; else add as custom
                const match = STUDY_SUBJECTS.find(
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

      {/* Step tabs + Select all */}
      <div className="flex flex-wrap items-center gap-2">
        {STEP_IDS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => setActiveStep(step)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm font-medium transition-all',
              activeStep === step
                ? step === 6
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                  : 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {STEP_LABELS[step]}
          </button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleSelectAllInStep}
          className="ml-auto gap-1.5 h-8 text-xs"
        >
          {allInStepSelected ? (
            <>
              <CheckSquare className="h-3.5 w-3.5" />
              Deselect all
            </>
          ) : (
            <>
              <Square className="h-3.5 w-3.5" />
              Select all in {STEP_LABELS[activeStep]}
            </>
          )}
        </Button>
      </div>

      {/* Subject badges for active step */}
      <div className="flex flex-wrap gap-2">
        {stepSubjects.map((subj) => {
          const selected = selectedSet.has(subj.title);
          return (
            <button
              key={`${subj.step}-${subj.index}`}
              type="button"
              onClick={() => toggleSubject(subj.title)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-all',
                selected
                  ? 'border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'border-border text-muted-foreground hover:border-amber-500/40 hover:text-foreground',
              )}
            >
              {selected && <Check className="h-3 w-3" />}
              {subj.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

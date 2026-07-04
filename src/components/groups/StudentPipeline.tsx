'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { PipelineStage, PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FOUNDATION_STUDIES, GROWTH_STUDIES, FOUNDATION_BLUE, GROWTH_PURPLE } from '@/lib/curriculum';
import { ContactListPopup } from '@/components/groups/ContactListPopup';

interface StudentPipelineProps {
  contacts: Contact[];
  users: User[];
  onContactSelect: (contactId: string) => void;
}

interface PipelineRow {
  key: string;
  label: string;
  contacts: Contact[];
  /** Tailwind bg-* class (stage bars) OR undefined when using a fixed hex via `hexColor`. */
  colorClass?: string;
  hexColor?: string;
}

function Bar({
  row,
  maxCount,
  delay,
  onOpen,
}: {
  row: PipelineRow;
  maxCount: number;
  delay: number;
  onOpen: () => void;
}) {
  const count = row.contacts.length;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex w-full items-center gap-3 cursor-pointer rounded-lg text-left touch-manipulation hover:ring-1 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      {/* phone: tighter label col (widest label "Baptism Ready" ~74px) + LEFT-aligned so every label starts at the same left margin (was text-right => ragged left edges) and bars shift left; >=sm reverts to 112px right-aligned (desktop unchanged) */}
      <div className="w-20 sm:w-28 shrink-0 text-left sm:text-right text-xs font-medium text-muted-foreground">
        {row.label}
      </div>
      <div className="flex-1">
        <div className="relative h-8 rounded-full bg-accent/50 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(count / maxCount) * 100}%` }}
            transition={{ duration: 0.6, delay: delay + 0.05 }}
            className={cn('h-full rounded-full', row.colorClass)}
            style={row.hexColor ? { backgroundColor: row.hexColor } : undefined}
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
            {count}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function Section({
  title,
  rows,
  startDelay,
  onOpen,
}: {
  title: string;
  rows: PipelineRow[];
  startDelay: number;
  onOpen: (row: PipelineRow) => void;
}) {
  const maxCount = Math.max(1, ...rows.map((r) => r.contacts.length));
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <Bar
            key={row.key}
            row={row}
            maxCount={maxCount}
            delay={startDelay + i * 0.08}
            onOpen={() => onOpen(row)}
          />
        ))}
      </div>
    </div>
  );
}

export function StudentPipeline({ contacts, users, onContactSelect }: StudentPipelineProps) {
  const [popup, setPopup] = useState<{ title: string; contacts: Contact[] } | null>(null);

  const stages = Object.entries(PIPELINE_STAGE_CONFIG).sort(([, a], [, b]) => a.order - b.order);

  const stageRows: PipelineRow[] = stages.map(([stage, config]) => ({
    key: stage,
    label: config.label,
    colorClass: config.color,
    contacts: contacts.filter((c) => c.pipelineStage === stage),
  }));
  const stageMax = Math.max(1, ...stageRows.map((r) => r.contacts.length));

  const foundationTitles = FOUNDATION_STUDIES.map((s) => s.title);
  const growthTitles = new Set(GROWTH_STUDIES.map((s) => s.title));

  const foundationCompleteContacts = contacts.filter((c) =>
    foundationTitles.every((title) => (c.subjectsStudied ?? []).includes(title)),
  );
  const inGrowthContacts = contacts.filter(
    (c) =>
      c.pipelineStage !== PipelineStage.BAPTIZED &&
      (c.subjectsStudied ?? []).some((title) => growthTitles.has(title)),
  );

  const curriculumRows: PipelineRow[] = [
    {
      key: 'foundation-complete',
      label: 'Foundation complete (1–12)',
      hexColor: FOUNDATION_BLUE,
      contacts: foundationCompleteContacts,
    },
    {
      key: 'in-growth',
      label: 'In Growth (13–35)',
      hexColor: GROWTH_PURPLE,
      contacts: inGrowthContacts,
    },
  ];

  const studies1to4 = contacts.filter((c) => c.totalSessions >= 1 && c.totalSessions <= 4);
  const studies5to10 = contacts.filter((c) => c.totalSessions >= 5 && c.totalSessions <= 10);

  const milestoneRows: PipelineRow[] = [
    {
      key: 'studies-1-4',
      label: 'Studies 1–4',
      colorClass: 'bg-cyan-500',
      contacts: studies1to4,
    },
    {
      key: 'studies-5-10',
      label: 'Studies 5–10',
      colorClass: 'bg-indigo-500',
      contacts: studies5to10,
    },
  ];

  const readinessRows: PipelineRow[] = [
    {
      key: 'readiness-potential',
      label: PIPELINE_STAGE_CONFIG[PipelineStage.POTENTIAL].label,
      colorClass: PIPELINE_STAGE_CONFIG[PipelineStage.POTENTIAL].color,
      contacts: contacts.filter((c) => c.pipelineStage === PipelineStage.POTENTIAL),
    },
    {
      key: 'readiness-baptism-ready',
      label: PIPELINE_STAGE_CONFIG[PipelineStage.BAPTISM_READY].label,
      colorClass: PIPELINE_STAGE_CONFIG[PipelineStage.BAPTISM_READY].color,
      contacts: contacts.filter((c) => c.pipelineStage === PipelineStage.BAPTISM_READY),
    },
    {
      key: 'readiness-baptized',
      label: PIPELINE_STAGE_CONFIG[PipelineStage.BAPTIZED].label,
      colorClass: PIPELINE_STAGE_CONFIG[PipelineStage.BAPTIZED].color,
      contacts: contacts.filter((c) => c.pipelineStage === PipelineStage.BAPTIZED),
    },
  ];

  const openRow = (row: PipelineRow) => setPopup({ title: row.label, contacts: row.contacts });

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Student Pipeline</h3>

      <div className="space-y-3">
        {stageRows.map((row, i) => (
          <Bar
            key={row.key}
            row={row}
            maxCount={stageMax}
            delay={i * 0.08}
            onOpen={() => openRow(row)}
          />
        ))}
      </div>

      <Section title="Primary Curriculum" rows={curriculumRows} startDelay={stageRows.length * 0.08} onOpen={openRow} />
      <Section
        title="Study Milestones"
        rows={milestoneRows}
        startDelay={(stageRows.length + curriculumRows.length) * 0.08}
        onOpen={openRow}
      />
      <Section
        title="Baptism Readiness"
        rows={readinessRows}
        startDelay={(stageRows.length + curriculumRows.length + milestoneRows.length) * 0.08}
        onOpen={openRow}
      />

      <ContactListPopup
        open={popup !== null}
        onClose={() => setPopup(null)}
        title={popup?.title ?? ''}
        contacts={popup?.contacts ?? []}
        users={users}
        onContactSelect={onContactSelect}
      />
    </div>
  );
}

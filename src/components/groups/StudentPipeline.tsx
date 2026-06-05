'use client';

import { motion } from 'framer-motion';
import { PipelineStage, PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StudentPipelineProps {
  contacts: Contact[];
}

export function StudentPipeline({ contacts }: StudentPipelineProps) {
  const stages = Object.entries(PIPELINE_STAGE_CONFIG).sort(([, a], [, b]) => a.order - b.order);

  const stageGroups = stages.map(([stage, config]) => ({
    stage: stage as PipelineStage,
    config,
    contacts: contacts.filter((c) => c.pipelineStage === stage),
  }));

  const maxCount = Math.max(1, ...stageGroups.map((g) => g.contacts.length));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Student Pipeline</h3>
      <div className="space-y-3">
        {stageGroups.map(({ stage, config, contacts: stageContacts }, i) => (
          <motion.div
            key={stage}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-3"
          >
            {/* phone: tighter label col (widest label "Baptism Ready" ~74px) + LEFT-aligned so every label starts at the same left margin (was text-right => ragged left edges) and bars shift left; >=sm reverts to 112px right-aligned (desktop unchanged) */}
            <div className="w-20 sm:w-28 shrink-0 text-left sm:text-right text-xs font-medium text-muted-foreground">
              {config.label}
            </div>
            <div className="flex-1">
              <div className="relative h-8 rounded-full bg-accent/50 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stageContacts.length / maxCount) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className={cn('h-full rounded-full', config.color)}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                  {stageContacts.length}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

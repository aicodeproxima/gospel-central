'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface InfoSection {
  heading: string;
  body: string | string[];
  example?: string;
}

interface InfoButtonProps {
  title: string;
  summary: string;
  sections: InfoSection[];
}

/**
 * A small (i) button that opens a help popup explaining the current page.
 * Drop it in the page header next to the page title.
 */
export function InfoButton({ title, summary, sections }: InfoButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className="inline-flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary max-xl:h-11 max-xl:w-11"
        title="How this page works"
        aria-label="Show page help"
      >
        <Info className="h-4 w-4" />
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Info className="h-5 w-5 text-primary" />
              {title}
            </DialogTitle>
            <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {sections.map((section, i) => (
              <motion.div
                key={section.heading}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="space-y-2"
              >
                <h3 className="text-sm font-semibold text-foreground">{section.heading}</h3>
                {Array.isArray(section.body) ? (
                  <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                    {section.body.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>
                )}
                {section.example && (
                  <div className="mt-2 rounded-md border border-border bg-accent/30 p-3 text-xs">
                    <div className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">
                      Example
                    </div>
                    <div className="text-foreground">{section.example}</div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

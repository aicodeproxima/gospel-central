'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, FileText, Loader2, Check, AlertTriangle } from 'lucide-react';
import { parseCSV } from '@/lib/utils/csv';
import { contactsApi } from '@/lib/api/contacts';
import { PipelineStage, BookingType, ContactStatus } from '@/lib/types';
import toast from 'react-hot-toast';

interface ImportCSVDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function ImportCSVDialog({ open, onClose, onComplete }: ImportCSVDialogProps) {
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error('No data rows found in CSV');
        return;
      }
      setHeaders(Object.keys(parsed[0]));
      setRows(parsed);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    let success = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const nameParts = (row['Name'] || '').trim().split(/\s+/);
        const firstName = nameParts[0] || row['First Name'] || row['firstName'] || '';
        const lastName = nameParts.slice(1).join(' ') || row['Last Name'] || row['lastName'] || '';

        if (!firstName) {
          errors++;
          continue;
        }

        // Map stage string to enum
        let stage = PipelineStage.FIRST_STUDY;
        const stageStr = (row['Stage'] || row['Pipeline Stage'] || '').toLowerCase();
        if (stageStr.includes('regular')) stage = PipelineStage.REGULAR_STUDY;
        else if (stageStr.includes('progress')) stage = PipelineStage.PROGRESSING;
        else if (stageStr.includes('ready')) stage = PipelineStage.BAPTISM_READY;
        else if (stageStr.includes('baptized')) stage = PipelineStage.BAPTIZED;

        await contactsApi.createContact({
          firstName,
          lastName,
          phone: row['Phone'] || row['phone'] || undefined,
          email: row['Email'] || row['email'] || undefined,
          groupName: row['Group'] || row['groupName'] || undefined,
          pipelineStage: stage,
          type: BookingType.UNBAPTIZED_CONTACT,
          status: ContactStatus.ACTIVE,
          totalSessions: parseInt(row['Sessions'] || '0', 10) || 0,
          notes: row['Notes'] || row['notes'] || undefined,
          createdBy: 'import',
        });
        success++;
      } catch {
        errors++;
      }
    }

    setResult({ success, errors });
    setImporting(false);
    if (success > 0) {
      toast.success(`Imported ${success} contacts`);
      onComplete();
    }
  };

  const handleClose = () => {
    setRows([]);
    setHeaders([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-2xl max-md:max-h-[85dvh] max-md:overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Contacts from CSV
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground text-center">
              Upload a CSV file with columns like:<br />
              <span className="font-mono text-xs">Name, Phone, Email, Group, Stage, Sessions, Notes</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileChange}
              aria-label="Select CSV file to import contacts"
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {rows.length} rows found • {headers.length} columns
              </p>
              {result && (
                <div className="flex items-center gap-2">
                  {result.success > 0 && (
                    <Badge variant="outline" className="text-green-500 border-green-500/40 gap-1">
                      <Check className="h-3 w-3" /> {result.success} imported
                    </Badge>
                  )}
                  {result.errors > 0 && (
                    <Badge variant="outline" className="text-red-500 border-red-500/40 gap-1">
                      <AlertTriangle className="h-3 w-3" /> {result.errors} failed
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Preview table */}
            <div className="flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h} className="text-xs truncate max-w-[150px]">
                          {row[h]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 5 && (
                <p className="text-center text-[10px] text-muted-foreground py-2">
                  ...and {rows.length - 5} more rows
                </p>
              )}
            </div>

            <div className="flex justify-between pt-3 max-md:pb-[max(0rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" size="sm" onClick={handleClose} className="touch-manipulation max-md:h-11 max-md:px-4">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importing || !!result}
                className="gap-1.5 touch-manipulation max-md:h-11 max-md:px-4"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Import {rows.length} Contacts
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

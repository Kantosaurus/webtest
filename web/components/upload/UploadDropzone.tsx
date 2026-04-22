'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud, Loader2 } from 'lucide-react';

const MAX = 32 * 1024 * 1024;

async function uploadFile(file: File): Promise<{ scanId: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/scans', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Upload failed (${res.status})`);
  }
  return (await res.json()) as { scanId: number };
}

export function UploadDropzone() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const mut = useMutation({
    mutationFn: uploadFile,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['scans'] });
      router.push(`/scans/${r.scanId}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Upload failed'),
  });

  const handleFiles = (files: FileList | null) => {
    setError(null);
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX) {
      setError('File exceeds the 32 MB limit.');
      return;
    }
    mut.mutate(f);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="tracking-tight">Upload a file</CardTitle>
        <p className="text-sm text-muted-foreground">
          Up to 32 MB. Analyzed with VirusTotal, then explained by Gemini.
        </p>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => !mut.isPending && inputRef.current?.click()}
          role="button"
          aria-label="Upload file"
          aria-busy={mut.isPending}
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !mut.isPending) inputRef.current?.click();
          }}
          className={[
            'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-12 text-center transition-colors',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
            mut.isPending ? 'pointer-events-none opacity-80' : '',
          ].join(' ')}
        >
          {mut.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <UploadCloud
              className="h-7 w-7 text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden
              strokeWidth={1.5}
            />
          )}
          <div className="space-y-1">
            <div className="text-sm font-medium">
              {mut.isPending ? 'Streaming to VirusTotal…' : 'Drop a file, or click to browse'}
            </div>
            <div className="text-xs text-muted-foreground">
              Files stream straight through — nothing is written to disk.
            </div>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

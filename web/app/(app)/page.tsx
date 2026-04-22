import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { ScansTable } from '@/components/scans/ScansTable';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Upload a file, watch the scan stream in, then ask for an explanation.
        </p>
      </div>
      <UploadDropzone />
      <ScansTable />
    </div>
  );
}

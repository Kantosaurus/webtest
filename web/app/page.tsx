import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { TopNav } from '@/components/nav/TopNav';

export default function Page() {
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 py-10 animate-in fade-in duration-300">
        <div className="space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
            <p className="text-sm text-muted-foreground">
              Upload a file, watch the scan stream in, then ask for an explanation. Nothing is stored — scans live only for the life of this session.
            </p>
          </div>
          <UploadDropzone />
        </div>
      </main>
    </div>
  );
}

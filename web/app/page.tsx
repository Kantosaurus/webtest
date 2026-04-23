import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { TopNav } from '@/components/nav/TopNav';
import { HalftoneField } from '@/components/hero/HalftoneField';
import { ScrollRevealRoot } from '@/components/motion/ScrollReveal';
import { ScrollProgress } from '@/components/motion/ScrollProgress';

const REPO = 'https://github.com/Kantosaurus/webtest';

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollProgress />
      <ScrollRevealRoot />
      <TopNav />

      <main className="flex-1">
        {/* ——————— HERO ——————— */}
        <section className="relative isolate mx-auto max-w-[980px] px-6 pb-24 pt-16 md:px-10 md:pt-24 lg:pt-32">
          <div
            aria-hidden
            className="hero-halftone pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(92vh,760px)] overflow-hidden"
          >
            <HalftoneField />
          </div>

          <h1 className="font-sans text-[clamp(2.5rem,5.5vw+0.75rem,5.5rem)] font-[650] leading-[1.02] tracking-tight">
            <span className="kinetic-line">
              <span className="kinetic-line-inner">
                <span className="breathe-width">What is this file,</span>
              </span>
            </span>
            <span className="kinetic-line">
              <span className="kinetic-line-inner">
                <span className="breathe font-serif font-[500] italic">really?</span>
              </span>
            </span>
          </h1>

          <p className="editorial-enter editorial-enter-2 mt-10 max-w-[62ch] font-serif text-[1.0625rem] leading-[1.65] text-muted-foreground md:text-[1.125rem]">
            Upload up to 32&nbsp;MB and the scan streams in from VirusTotal in real
            time. When it finishes, a Gemini-powered assistant explains the
            verdict&nbsp;— what engines flagged, what family of threat it looks like,
            and what to do next&nbsp;— in plain language. Nothing is stored; the scan
            disappears when you leave.
          </p>

          <div className="editorial-enter editorial-enter-3 mt-14">
            <UploadDropzone />
          </div>
        </section>

        {/* ——————— HOW IT WORKS ——————— */}
        <section className="mx-auto max-w-[980px] border-t border-border px-6 py-20 md:px-10 md:py-24">
          <div className="mb-12 md:mb-16">
            <div className="reveal text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint" data-reveal-delay="0">
              How it works
            </div>
            <h2
              className="reveal mt-3 text-[clamp(1.625rem,2.5vw+0.75rem,2.25rem)] font-[550] leading-[1.1] tracking-tight"
              data-reveal-delay="80"
            >
              Three steps, no magic.
            </h2>
          </div>

          <ol className="grid gap-12 md:grid-cols-3 md:gap-10">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className="reveal flex flex-col gap-4"
                data-reveal-delay={180 + i * 140}
              >
                <span className="font-mono text-xs tracking-wide text-ink-faint">{s.n}</span>
                <h3 className="text-lg font-[550] tracking-tight">{s.title}</h3>
                <p className="font-serif text-[0.9375rem] leading-[1.65] text-muted-foreground">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ——————— COLOPHON ——————— */}
        <section className="mx-auto max-w-[1100px] border-t border-border px-6 py-20 md:px-10 md:py-24">
          <div className="mb-10 md:mb-14">
            <div className="reveal text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint" data-reveal-delay="0">
              Colophon
            </div>
            <h2
              className="reveal mt-3 max-w-[50ch] font-serif text-[clamp(1.375rem,2vw+0.5rem,1.75rem)] italic leading-[1.2] text-foreground"
              data-reveal-delay="80"
            >
              A short account of what this is, and how it was made.
            </h2>
          </div>

          <dl className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-[160px_1fr] md:gap-y-10">
            {COLOPHON.map((row, i) => (
              <ColophonRow key={row.label} index={i} label={row.label}>
                {row.content}
              </ColophonRow>
            ))}
          </dl>
        </section>

        {/* ——————— FOOTER ——————— */}
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-[980px] flex-col items-start gap-2 px-6 py-8 text-[11px] uppercase tracking-[0.18em] text-ink-faint md:flex-row md:items-center md:justify-between md:px-10">
            <span>© 2026 Ainsley Woo</span>
            <span aria-hidden className="hidden md:inline">·</span>
            <span>VirusTotal × Gemini scanner</span>
            <span aria-hidden className="hidden md:inline">·</span>
            <span>Take-home for CloudsineAI</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Stream upload',
    body:
      'Your file is hashed and streamed directly to VirusTotal as it uploads. Nothing ever touches disk on the server — the bytes pass through a counter and into the outbound request.',
  },
  {
    n: '02',
    title: 'VirusTotal analysis',
    body:
      'Seventy-plus detection engines weigh in. The API polls VirusTotal until the scan is terminal, pushing status changes over Server-Sent Events the moment they happen.',
  },
  {
    n: '03',
    title: 'Plain-language explanation',
    body:
      'When the verdict is in, a Gemini-powered assistant reads the full engine breakdown and explains it — family, severity, what to do next — token by token, in language a non-analyst can follow.',
  },
];

const COLOPHON: { label: string; content: React.ReactNode }[] = [
  {
    label: 'Stack',
    content: (
      <>
        <MonoTag>Next.js&nbsp;15</MonoTag> <Dot /> <MonoTag>React&nbsp;19</MonoTag> <Dot />{' '}
        <MonoTag>TypeScript</MonoTag> <Dot /> <MonoTag>Tailwind</MonoTag> <Dot />{' '}
        <MonoTag>TanStack&nbsp;Query</MonoTag>. A Node / Express API stream-uploads directly to
        VirusTotal, keeps scans and chat in a bounded in-memory map, and pushes both scan progress
        and Gemini tokens over Server-Sent Events. Packaged with Docker Compose, deployed to a
        single t3.small behind Caddy.
      </>
    ),
  },
  {
    label: 'Typography',
    content: (
      <>
        Display and UI set in{' '}
        <em className="not-italic font-sans font-[550]">Bricolage Grotesque</em>. Body copy, decks,
        and this paragraph set in <em>Literata</em>. Hashes, engine names, and any tabular data in{' '}
        <MonoTag>Geist&nbsp;Mono</MonoTag>. All three served via{' '}
        <MonoTag>next/font/google</MonoTag>, loaded on the document root as CSS variables.
      </>
    ),
  },
  {
    label: 'Palette',
    content: (
      <>
        Authored in <MonoTag>oklch()</MonoTag> throughout, for perceptually uniform steps. A warm
        cream paper sits under cool ink in the light theme; a cool graphite ground carries warm
        off-white in the dark. The single restrained accent is deep ink blue — every other chromatic
        moment is reserved for a verdict. Verdicts remain legible without color.
      </>
    ),
  },
  {
    label: 'Design direction',
    content: (
      <>
        The page is composed as a single editorial spread rather than a marketing landing. Hierarchy
        is carried by typography before color; decoration is withheld unless it earns its place. The
        halftone field behind this page and the per-line headline reveal are the two deliberate
        overdrive moments. The spec behind everything lives in <InlineCode>.impeccable.md</InlineCode>.
      </>
    ),
  },
  {
    label: 'Documents',
    content: (
      <>
        The full design rationale is in{' '}
        <ColophonLink href={`${REPO}/blob/main/docs/superpowers/specs/2026-04-23-virustotal-scanner-design.md`}>
          the design spec
        </ColophonLink>
        . The step-by-step build plan is in{' '}
        <ColophonLink href={`${REPO}/blob/main/docs/superpowers/plans/2026-04-23-virustotal-scanner.md`}>
          the plan
        </ColophonLink>
        . Operational notes &amp; the EC2 bootstrap are in{' '}
        <ColophonLink href={`${REPO}/blob/main/docs/deployment.md`}>deployment</ColophonLink>.
      </>
    ),
  },
  {
    label: 'Built by',
    content: (
      <>
        Ainsley Woo <Dot /> 2026 <Dot /> Source at{' '}
        <ColophonLink href={REPO}>github.com/Kantosaurus/webtest</ColophonLink>.
      </>
    ),
  },
];

function ColophonRow({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: React.ReactNode;
}) {
  const delay = index * 90;
  return (
    <>
      <dt
        className="reveal text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint md:pt-[0.35rem]"
        data-reveal-delay={delay}
      >
        {label}
      </dt>
      <dd
        className="reveal max-w-[65ch] font-serif text-[0.9375rem] leading-[1.65] text-foreground"
        data-reveal-delay={delay + 60}
      >
        {children}
      </dd>
    </>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-surface-alt px-1.5 py-0.5 font-mono text-[0.8125rem] text-foreground">
      {children}
    </code>
  );
}

function MonoTag({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.8125rem]">{children}</span>;
}

function Dot() {
  return <span aria-hidden className="text-ink-faint">·</span>;
}

function ColophonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline decoration-[1.5px] underline-offset-[3px] transition-[text-decoration-thickness,opacity] duration-150 hover:decoration-2 active:opacity-80 active:decoration-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      {children}
    </a>
  );
}

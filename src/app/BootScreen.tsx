import { LogoMark } from '../ui';
import { config } from '../env';

/** Shown while the backend boots (local mode compiles Postgres to WASM on first run). */
export function BootScreen({ error }: { error: unknown }) {
  const code = (error as any)?.code ?? (error as any)?.message ?? '';
  const elsewhere = String(code).includes('open_elsewhere');
  const wasm = /wasm|WebAssembly|CompileError|unsafe-eval/i.test(String((error as any)?.message ?? ''));
  return (
    <div className="gutter flex h-full flex-col items-center justify-center gap-6 bg-bg text-center">
      <div className="relative">
        <LogoMark size={72} />
        {!error && <div className="absolute -inset-3 animate-pulse rounded-[28px] border border-accent/40" />}
      </div>
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold tracking-[0.14em]">LANDVAS</h1>
        {!error ? (
          <p className="mt-2 text-sm text-muted">
            {config.backend === 'local' ? 'Preparing your world on this device…' : 'Connecting to the world…'}
          </p>
        ) : elsewhere ? (
          <p className="mt-3 text-sm text-muted">LANDVAS is already open in another tab on this device. Close that tab, then reload this one.</p>
        ) : (
          <div className="mt-3 grid gap-3 text-sm text-muted">
            <p>The game could not start in this browser.</p>
            {wasm && config.backend === 'local' && (
              <p>
                Local mode runs a full Postgres database in WebAssembly, and this page's host blocked it. Run LANDVAS with
                <code className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 text-fg">npm run dev</code>
                or deploy it with Supabase (see the README).
              </p>
            )}
            <p className="break-words rounded-xl border border-line bg-surface/70 p-3 text-left font-mono text-xs text-faint">{String((error as any)?.message ?? error)}</p>
            <button className="mx-auto rounded-xl bg-accent px-4 py-2 font-semibold text-white" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

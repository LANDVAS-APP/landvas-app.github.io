// Game settings: every setting the game reads live (game_config) and every switch (feature_flags).
// A save applies to every player immediately — web and the mobile apps — with no app update.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import { Button, Switch } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { ago, words } from '../../shared/format';
import { Badge, Json, PageHeader, Panel, Q } from '../../shared/ui';

export default function Config() {
  const q = useQuery({ queryKey: ['admin', 'config'], queryFn: api.admin.configGet });
  const [find, setFind] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Game settings" sub="Everything the game reads from the database while it runs. A change here reaches every player straight away, on the website and in the mobile apps, with no app update. Every save is recorded in the audit log." />
      <Q q={q}>{(d) => {
        const keys = Object.keys(d.config ?? {}).sort();
        const shown = keys.filter((k) => k.includes(find.toLowerCase()) || String(d.config[k].description ?? '').toLowerCase().includes(find.toLowerCase()));
        const cur = sel && d.config[sel] ? sel : shown[0];
        return (
          <div className="grid gap-3">
            <Flags flags={d.flags ?? []} />
            <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
              <Panel pad={false} className="xl:sticky xl:top-[76px] xl:self-start">
                <div className="relative px-3 pt-3"><Search className="pointer-events-none absolute left-5.5 top-1/2 h-4 w-4 translate-y-[-25%] text-faint" style={{ left: 22 }} /><input className="p-input w-full pl-8" placeholder="Find a setting" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a setting" /></div>
                <div className="p-scroll mt-2 max-h-[65vh] px-2 pb-3">
                  {shown.map((k) => (
                    <button key={k} onClick={() => setSel(k)} className={cn('block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2/60', cur === k && 'bg-accent/15')}>
                      <span className="font-semibold">{words(k)}</span> <span className="p-mono text-[11px] text-faint">{k}</span>
                    </button>
                  ))}
                </div>
              </Panel>
              {cur && <Editor key={cur} k={cur} entry={d.config[cur]} />}
            </div>
          </div>
        );
      }}</Q>
    </>
  );
}

function Editor({ k, entry }: { k: string; entry: { value: unknown; description?: string; updated_at?: string } }) {
  const qc = useQueryClient();
  const original = useMemo(() => JSON.stringify(entry.value, null, 2), [entry.value]);
  const [text, setText] = useState(original);
  const [busy, setBusy] = useState(false);
  let parsed: unknown = undefined, err: string | null = null;
  try { parsed = JSON.parse(text); } catch (e) { err = (e as Error).message; }
  const dirty = text !== original;
  return (
    <Panel title={<span>{words(k)} <span className="p-mono text-xs font-normal text-faint">{k}</span></span>} actions={entry.updated_at && <span className="text-xs text-muted">changed {ago(entry.updated_at)}</span>}>
      {entry.description && <p className="mb-3 max-w-3xl text-sm text-muted">{entry.description}</p>}
      <textarea className="p-input p-mono min-h-[420px] w-full !text-[12.5px]" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Value of ${k}`} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {err ? <Badge tone="bad">Not valid JSON: {err}</Badge> : dirty ? <Badge tone="warn">Unsaved changes</Badge> : <Badge tone="ok">Saved</Badge>}
        <div className="ml-auto flex gap-2">
          {dirty && <Button size="sm" variant="ghost" onClick={() => setText(original)}>Undo changes</Button>}
          <Button size="sm" variant="primary" disabled={!dirty || !!err} loading={busy} onClick={async () => {
            setBusy(true);
            try { await api.admin.configSet(k, parsed); toast.success(`${words(k)} saved — live for every player now`); void qc.invalidateQueries({ queryKey: ['admin', 'config'] }); }
            catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
          }}>Save for everyone</Button>
        </div>
      </div>
      {dirty && !err && <details className="mt-3"><summary className="cursor-pointer text-sm text-muted">Compare with what’s live</summary><Json value={entry.value} max={300} className="mt-2" /></details>}
    </Panel>
  );
}

function Flags({ flags }: { flags: { key: string; enabled: boolean; description: string; config: any; updated_at: string; is_public: boolean }[] }) {
  const qc = useQueryClient();
  return (
    <Panel title="Switches">
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
        {flags.map((f) => (
          <div key={f.key} className="rounded-xl border border-line p-3">
            <Switch id={`flag-${f.key}`} checked={f.enabled} label={words(f.key)} hint={f.description}
              onCheckedChange={async (on) => {
                try { await api.admin.setFlag(f.key, on); toast.success(`${words(f.key)} ${on ? 'on' : 'off'} for everyone`); void qc.invalidateQueries({ queryKey: ['admin', 'config'] }); }
                catch (e) { toast.error(toGameError(e).message); }
              }} />
            {f.config?.legally_gated && <div className="mt-1.5"><Badge tone="warn">Needs legal sign-off</Badge></div>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

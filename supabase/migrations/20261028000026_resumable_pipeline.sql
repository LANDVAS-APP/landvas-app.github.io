-- v0.12.2: the art pipeline works in resumable steps.
-- Hosted Edge Functions get ~2 s of CPU per request; a big mural needs far more, so
-- runs were killed mid-job and the job sat "running" forever — the publication stayed
-- "processing"/"waiting" and the canvas couldn't be published again. Now a run saves
-- its progress and hands the job back (svc_yield_job) without counting a failed try,
-- and a run that dies is picked up again after 3 minutes (and fails cleanly after
-- too many deaths instead of looping forever).

create or replace function public.svc_yield_job(p_job_id bigint, p_progress jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update private.render_jobs
     set status = 'queued', payload = payload || jsonb_build_object('progress', p_progress),
         attempts = greatest(attempts - 1, 0), locked_at = null, locked_by = null, run_after = now(), updated_at = now()
   where id = p_job_id and status = 'running';
  return jsonb_build_object('id', p_job_id, 'yielded', true);
end $$;
revoke all on function public.svc_yield_job(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.svc_yield_job(bigint, jsonb) to service_role;

create or replace function public.svc_claim_job(p_worker text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job private.render_jobs%rowtype; d record;
begin
  -- runs that died (a killed Edge Function never reports back)
  for d in select * from private.render_jobs where status = 'running' and locked_at < now() - interval '3 minutes' for update skip locked loop
    if d.attempts >= d.max_attempts then
      update private.render_jobs set status = 'failed', last_error = coalesce(last_error, 'the run kept stopping before it finished'), locked_at = null, updated_at = now() where id = d.id;
      if d.kind in ('process_publication', 'publish_publication') then
        update public.artwork_publications set status = 'failed', decision_reason = 'Processing failed. Please try publishing again.', updated_at = now()
         where id = (d.payload ->> 'publication_id')::uuid and status in ('processing', 'approved');
      end if;
    else
      update private.render_jobs set status = 'queued', locked_at = null, locked_by = null, updated_at = now() where id = d.id;
    end if;
  end loop;
  select * into v_job from private.render_jobs
  where status = 'queued' and run_after <= now()
  order by id for update skip locked limit 1;
  if not found then return null; end if;
  update private.render_jobs
     set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = p_worker, updated_at = now()
   where id = v_job.id;
  return jsonb_build_object('id', v_job.id, 'kind', v_job.kind, 'payload', v_job.payload, 'attempts', v_job.attempts + 1);
end $$;

-- give every job that got stuck under the old pipeline a fresh start
update private.render_jobs
   set status = 'queued', attempts = 0, locked_at = null, locked_by = null, run_after = now(), last_error = null, updated_at = now()
 where status = 'running' or (status = 'queued' and attempts > 0);
-- publications that failed only because of that can go again
update private.render_jobs j
   set status = 'queued', attempts = 0, locked_at = null, locked_by = null, run_after = now(), last_error = null, updated_at = now()
  from public.artwork_publications a
 where j.status = 'failed' and j.kind in ('process_publication', 'publish_publication')
   and a.id = (j.payload ->> 'publication_id')::uuid and a.status = 'failed'
   and a.created_at > now() - interval '7 days'
   and not exists (select 1 from public.artwork_publications b where b.group_id = a.group_id and b.created_at > a.created_at);
update public.artwork_publications a
   set status = case when j.kind = 'process_publication' then 'processing' else 'approved' end, decision_reason = null, updated_at = now()
  from private.render_jobs j
 where j.status = 'queued' and j.kind in ('process_publication', 'publish_publication')
   and a.id = (j.payload ->> 'publication_id')::uuid and a.status = 'failed';

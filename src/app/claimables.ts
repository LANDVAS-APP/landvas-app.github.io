// Things waiting to be claimed right now (the daily streak, a free wheel spin) — they light up a badge on the
// World tab and in the menu, the way a game nudges you back to the good stuff.
import { useQuery } from '@tanstack/react-query';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';

export function useClaimables() {
  const me = useOnboardedMe();
  const daily = useQuery({ queryKey: ['daily'], queryFn: api.dailyStatus, enabled: !!me, staleTime: 5 * 60_000 });
  const wheel = useQuery({ queryKey: ['wheel'], queryFn: api.wheelStatus, enabled: !!me, staleTime: 5 * 60_000 });
  const streak = !!daily.data?.enabled && !daily.data.claimed_today;
  const spin = !!wheel.data?.enabled && (wheel.data.spins_left ?? 0) > 0;
  return { streak, spin, count: (streak ? 1 : 0) + (spin ? 1 : 0) };
}

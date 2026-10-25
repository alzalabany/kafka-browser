import { HttpError } from './auth';
const processState=globalThis as typeof globalThis & {kafkaBrowserStreams?:Map<string,Set<() => void>>};
const active = processState.kafkaBrowserStreams ||= new Map<string,Set<() => void>>();
export function streamLease(uid:string) {
  const leases = active.get(uid) || new Set<() => void>();
  if (leases.size >= 2) throw new HttpError(429,'You already have two active streams. Stop one before starting another.');
  const entry = () => cancel?.(); let cancel:(() => void)|undefined;
  leases.add(entry); active.set(uid,leases);
  return {
    onCancel:(fn:() => void) => {cancel=fn;},
    release:() => { leases.delete(entry); if (!leases.size) active.delete(uid); },
  };
}
export function stopUserStreams(uid:string) { for (const cancel of active.get(uid) || []) cancel(); }

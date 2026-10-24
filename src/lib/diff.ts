export type Change = { path: string; before: unknown; after: unknown; kind: 'added' | 'removed' | 'changed' };
export function parse(value: string | null): unknown { if (value === null) return null; try { return JSON.parse(value); } catch { return value; } }
export function diff(before: unknown, after: unknown, path = '$'): Change[] {
  if (Object.is(before, after)) return [];
  if (before !== null && after !== null && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => {
      const p = Array.isArray(before) ? `${path}[${key}]` : `${path}.${key}`;
      if (!Object.hasOwn(a,key)) return [{path:p,before:undefined,after:b[key],kind:'added' as const}];
      if (!Object.hasOwn(b,key)) return [{path:p,before:a[key],after:undefined,kind:'removed' as const}];
      return diff(a[key], b[key], p);
    });
  }
  return [{path,before,after,kind:'changed'}];
}

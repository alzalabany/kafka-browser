import type { Message } from './types';
import { parse } from './diff';

export type MessageRules = { search?: string; js?: string; transform?: string; filterEnabled?: boolean; transformEnabled?: boolean; filters?: {search?:string;js?:string}[] };
type MessageFunction = (value: unknown, message: Message) => unknown;

// Work on copies so user code cannot change the original Kafka buffer.
export function compileMessageRules(rules: MessageRules) {
  let transformSyntaxError = '', filterSyntaxError = '';
  let transform: MessageFunction | undefined;
  const conditions: {search?:string;predicate?:MessageFunction}[] = [];
  try {
    if (rules.transformEnabled !== false && rules.transform?.trim()) transform = new Function('value', 'message', `"use strict";\n${rules.transform}`) as MessageFunction;
  } catch (e) { transformSyntaxError = `Syntax error: ${(e as Error).message}`; }
  try {
    if (rules.filterEnabled !== false) {
      for (const filter of rules.filters ?? [{search:rules.search,js:rules.js}]) {
        conditions.push({search:filter.search,predicate:filter.js?.trim() ? new Function('value','message',`"use strict"; return (${filter.js});`) as MessageFunction : undefined});
      }
    }
  } catch (e) { filterSyntaxError = (e as Error).message; }

  return (messages: Message[]) => {
    const transformed: Message[] = [], visible: Message[] = [];
    let transformError = transformSyntaxError, filterError = filterSyntaxError, failed = 0;
    if (transformSyntaxError) return { transformed, visible, transformError, filterError };
    for (const original of messages) {
      let message = original;
      if (transform) {
        try {
          const value = transform(parse(original.value), structuredClone(original));
          if (value === undefined) continue;
          if (value !== null && typeof value === 'object' && 'then' in value && typeof value.then === 'function') {
            void Promise.resolve(value).catch(() => {});
            throw new Error('Async transforms are not supported. Return a value synchronously.');
          }
          const encoded = typeof value === 'string' || value === null ? value : JSON.stringify(value);
          if (encoded === undefined) throw new Error('Return a string, JSON value, null, or undefined to hide the message.');
          message = { ...original, value: encoded };
        } catch (e) {
          failed++;
          if (!transformError) transformError = `Message ${original.id}: ${(e as Error).message}`;
          continue;
        }
      }
      transformed.push(message);
      if (filterError) continue;
      try {
        const matches = conditions.every(condition => {
          if (condition.search && !`${message.topic} ${message.value ?? ''} ${message.key ?? ''} ${message.partition} ${message.offset}`.toLowerCase().includes(condition.search.toLowerCase())) return false;
          return !condition.predicate || Boolean(condition.predicate(parse(message.value),structuredClone(message)));
        });
        if (matches) visible.push(message);
      } catch (e) { filterError = (e as Error).message; }
    }
    if (failed) transformError = `${failed} message${failed === 1 ? '' : 's'} skipped. ${transformError}`;
    return { transformed, visible: filterError ? [] : visible, transformError, filterError };
  };
}

export function processMessages(messages: Message[], rules: MessageRules) {
  return compileMessageRules(rules)(messages);
}

import type { Message } from './types';
import { parse } from './diff';

export type MessageRules = { search?: string; js?: string; transform?: string };

// Work on copies so user code cannot change the original Kafka buffer.
export function processMessages(messages: Message[], rules: MessageRules) {
  const transformed: Message[] = [], visible: Message[] = [];
  let transformError = '', filterError = '', failed = 0;
  let transform: ((value: unknown, message: Message) => unknown) | undefined;
  let predicate: ((value: unknown, message: Message) => unknown) | undefined;
  try {
    if (rules.transform?.trim()) transform = new Function('value', 'message', `"use strict";\n${rules.transform}`) as typeof transform;
  } catch (e) { return { transformed, visible, transformError: `Syntax error: ${(e as Error).message}`, filterError }; }
  try {
    if (rules.js?.trim()) predicate = new Function('value', 'message', `"use strict"; return (${rules.js});`) as typeof predicate;
  } catch (e) { filterError = (e as Error).message; }

  for (const original of messages) {
    let message = original;
    if (transform) {
      try {
        const value = transform(parse(original.value), structuredClone(original));
        if (value === undefined) continue;
        if (value !== null && typeof value === 'object' && 'then' in value && typeof value.then === 'function') throw new Error('Async transforms are not supported. Return a value synchronously.');
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
    if (rules.search && !`${message.value ?? ''} ${message.key ?? ''} ${message.partition} ${message.offset}`.toLowerCase().includes(rules.search.toLowerCase())) continue;
    try {
      if (!predicate || predicate(parse(message.value), structuredClone(message))) visible.push(message);
    } catch (e) { filterError = (e as Error).message; }
  }
  if (failed) transformError = `${failed} message${failed === 1 ? '' : 's'} skipped. ${transformError}`;
  return { transformed, visible: filterError ? [] : visible, transformError, filterError };
}

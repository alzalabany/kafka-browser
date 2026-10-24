import type { Message } from './types';

export function appendMessage(messages: Message[], message: Message) {
  return [message, ...messages.filter(m => m.id !== message.id)].slice(0, 1000);
}

// Preserve raw Kafka values and metadata, one complete message per line.
export function toJsonl(messages: Message[]) {
  return messages.length ? messages.map(message => JSON.stringify(message)).join('\n') + '\n' : '';
}

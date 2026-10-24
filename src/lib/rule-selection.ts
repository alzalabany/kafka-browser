import type { Preset } from './presets';
import type { MessageRules } from './message-pipeline';

export type RuleSelection = { transformId: string | null; filterIds: string[] };
export type TopicRules = Record<string, RuleSelection>;
export const ruleScope = (topic?: string, allTopics?: boolean) => JSON.stringify(allTopics ? ['all'] : ['topic',topic || '']);
export function selectedRules(presets: Preset[], selection?: RuleSelection): MessageRules {
  const transformer = presets.find(p => p.kind === 'transform' && p.id === selection?.transformId);
  const ids = new Set(selection?.filterIds || []);
  return {transform:transformer?.transform || '',filters:presets.filter(p => p.kind === 'filter' && ids.has(p.id)).map(p => ({search:p.search,js:p.js}))};
}

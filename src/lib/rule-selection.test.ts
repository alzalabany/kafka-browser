import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedRules,ruleScope,type TopicRules} from './rule-selection';
import {processMessages} from './message-pipeline';
import type {Preset} from './presets';
import type {Message} from './types';
const presets:Preset[]=[
  {id:'t1',name:'Unwrap',kind:'transform',transform:'return value.payload;',search:'',js:''},
  {id:'t2',name:'String',kind:'transform',transform:'return "other";',search:'',js:''},
  {id:'f1',name:'Minimum',kind:'filter',transform:'',search:'',js:'value.total >= 10'},
  {id:'f2',name:'Maximum',kind:'filter',transform:'',search:'',js:'value.total <= 20'},
];
const message=(total:number):Message=>({id:String(total),topic:'orders',partition:0,offset:String(total),timestamp:'0',value:JSON.stringify({payload:{total}}),key:null,headers:{}});
test('no saved selection means no transformer or filters are active',()=>{
  assert.deepEqual(selectedRules(presets),{transform:'',filters:[]});
  assert.equal(processMessages([message(5)],selectedRules(presets)).visible.length,1);
});
test('only the radio-selected transformer runs, then all checked filters must match',()=>{
  const rules=selectedRules(presets,{transformId:'t1',filterIds:['f1','f2']});
  assert.deepEqual(processMessages([message(5),message(15),message(25)],rules).visible.map(m=>m.id),['15']);
  assert.deepEqual(processMessages([message(5),message(15),message(25)],selectedRules(presets,{transformId:'t1',filterIds:['f1']})).visible.map(m=>m.id),['15','25']);
});
test('topic scope is independent, all-topic scope cannot collide, and selections survive serialization',()=>{
  const stored:TopicRules={[ruleScope('orders')]:{transformId:'t1',filterIds:['f1','f2']},[ruleScope('payments')]:{transformId:'t2',filterIds:[]}};
  const reopened=JSON.parse(JSON.stringify(stored));
  assert.equal(selectedRules(presets,reopened[ruleScope('orders')]).filters?.length,2);
  assert.equal(selectedRules(presets,reopened[ruleScope('payments')]).transform,'return "other";');
  assert.deepEqual(selectedRules(presets,reopened[ruleScope('new-topic')]),{transform:'',filters:[]});
  assert.notEqual(ruleScope('all'),ruleScope(undefined,true));
});
test('deleted presets and wrong-kind IDs do not enable unintended rules',()=>{
  assert.deepEqual(selectedRules(presets,{transformId:'f1',filterIds:['t1','deleted']}),{transform:'',filters:[]});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { userStore, userPath } from './user-store';
import { firestore } from './firebase-admin';
import type { Credentials } from './types';

test('Firestore: company connections and opt-in settings share; personal data and other companies stay isolated', {skip:!process.env.FIRESTORE_EMULATOR_HOST && process.env.KAFKA_TEST_FIRESTORE !== '1'},async t => {
  process.env.KAFKA_BROWSER_MODE='hosted';
  if (process.env.FIRESTORE_EMULATOR_HOST) process.env.FIREBASE_PROJECT_ID='demo-kafka-browser';
  else assert.equal(process.env.FIREBASE_PROJECT_ID,'amana-kafka-browser','Live verification is restricted to the new Kafka Browser project');
  process.env.KAFKA_CREDENTIALS_KEY=randomBytes(32).toString('base64');
  const run=randomUUID();
  const otherDomain=`other-${run}.test`;
  const alice=await userStore(`alice-${run}`,`alice@${run}.test`),bob=await userStore(`bob-${run}`,`bob@${run}.test`),outsider=await userStore(`eve-${run}`,`eve@${otherDomain}`);
  t.after(async () => {
    const paths=[userPath(`alice-${run}`),userPath(`bob-${run}`),userPath(`eve-${run}`),`companies/${createHash('sha256').update(`${run}.test`).digest('hex')}`,`companies/${createHash('sha256').update(otherDomain).digest('hex')}`];
    for (const path of paths) await firestore().recursiveDelete(firestore().doc(path));
    await firestore().terminate();
  });
  const connection={id:randomUUID(),name:'Company cluster',host:'broker.example.com',port:9093,mode:'sasl',username:'test',password:'never-plaintext',ca:'test-ca'} as Credentials;
  await alice.saveConnection(connection);
  assert.equal((await bob.connection(connection.id))?.password,'never-plaintext');
  assert.equal(await outsider.connection(connection.id),undefined);
  await alice.setState('view',{favorites:['private']});assert.deepEqual(await bob.getState('view'),{});
  await alice.setState('view',{favorites:['shared']},true);assert.deepEqual(await bob.getState('view',true),{favorites:['shared']});
  const personal=await alice.savePreset({kind:'filter',name:'My filter',js:'true'});
  const company=await alice.savePreset({kind:'transform',name:`Shared ${run}`,transform:'return value;',scope:'company'});
  assert.ok((await bob.presets()).some(p=>p.id===company.id));assert.ok(!(await bob.presets()).some(p=>p.id===personal.id));
  assert.ok(!(await outsider.presets()).some(p=>p.id===company.id));
  assert.equal(await bob.deletePreset(personal.id),false);
  await assert.rejects(()=>alice.setState('view',{topicRules:{x:{transformId:personal.id}}},true));
  const workspace=createHash('sha256').update(`${run}.test`).digest('hex');
  const stored=await firestore().doc(`companies/${workspace}/connections/${connection.id}`).get();
  assert.ok(stored.exists);assert.ok(!JSON.stringify(stored.data()).includes('never-plaintext'));
  await bob.deleteConnection(connection.id);assert.equal(await alice.connection(connection.id),undefined);
  await alice.deletePreset(personal.id);await bob.deletePreset(company.id,true);
});

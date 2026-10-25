import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { userStore, userPath } from './user-store';
import { firestore, firebaseAuth } from './firebase-admin';
import { withFirebaseToken } from './firebase-user';
import type { Credentials } from './types';

test('Firestore user tokens enforce company sharing, personal isolation, and encrypted credentials', {skip:!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST},async t => {
  Object.assign(process.env,{KAFKA_BROWSER_MODE:'hosted',FIREBASE_PROJECT_ID:'demo-kafka-browser',FIREBASE_WEB_API_KEY:'test-key',KAFKA_CREDENTIALS_KEY:randomBytes(32).toString('base64')});
  const run=randomUUID(),ids:string[]=[];
  async function google(email:string,verified=true) {
    const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=test-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestUri:'http://localhost',returnSecureToken:true,postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:randomUUID(),email,email_verified:verified})}).toString()})});
    assert.equal(response.status,200);const result=await response.json();ids.push(result.localId);return {token:result.idToken as string,uid:result.localId as string};
  }
  const a=await google(`alice-${run}@amanacapital.com`),b=await google(`bob-${run}@amanacapital.com`),e=await google(`eve-${run}@gmail.com`),unverified=await google(`unverified-${run}@amanacapital.com`,false);
  const bind=async (user:{token:string;uid:string},email:string) => {
    const store=await withFirebaseToken(user.token,()=>userStore(user.uid,email));
    return store;
  };
  const alice=await bind(a,`alice-${run}@amanacapital.com`),bob=await bind(b,`bob-${run}@amanacapital.com`);
  const workspace=createHash('sha256').update('amanacapital.com').digest('hex');
  const connection={id:randomUUID(),name:'Company cluster',host:'broker.example.com',port:9093,mode:'sasl',username:'test',password:'never-plaintext',ca:'test-ca'} as Credentials;
  const state=`view-${run}`;
  t.after(async()=>{
    for(const uid of ids){await firestore().recursiveDelete(firestore().doc(userPath(uid)));await firebaseAuth().deleteUser(uid);}
    await firestore().doc(`companies/${workspace}/connections/${connection.id}`).delete();
    await firestore().doc(`companies/${workspace}/state/${createHash('sha256').update(state).digest('hex')}`).delete();
    const shared=await firestore().doc(`companies/${workspace}`).collection('presets').get();
    for(const doc of shared.docs)if(String(doc.data().name).includes(run))await doc.ref.delete();
    await firestore().terminate();
  });
  await alice.saveConnection(connection);
  assert.equal((await bob.connection(connection.id))?.password,'never-plaintext');
  await alice.setState(state,{favorites:['private'],zero:0,flag:false,nested:[null,1.5]});assert.deepEqual(await bob.getState(state),{});
  assert.deepEqual(await alice.getState(state),{favorites:['private'],zero:0,flag:false,nested:[null,1.5]});
  await alice.setState(state,{favorites:['shared']},true);assert.deepEqual(await bob.getState(state,true),{favorites:['shared']});
  const personal=await alice.savePreset({kind:'filter',name:`My filter ${run}`,js:'true'});
  const company=await alice.savePreset({kind:'transform',name:`Shared ${run}`,transform:'return value;',scope:'company'});
  assert.ok((await bob.presets()).some(p=>p.id===company.id));assert.ok(!(await bob.presets()).some(p=>p.id===personal.id));
  assert.equal(await bob.deletePreset(personal.id),false);
  await assert.rejects(()=>alice.setState(state,{topicRules:{x:{transformId:personal.id}}},true));
  const stored=await firestore().doc(`companies/${workspace}/connections/${connection.id}`).get();
  assert.ok(stored.exists);assert.ok(!JSON.stringify(stored.data()).includes('never-plaintext'));
  async function direct(token:string,path:string,method='GET',body?:unknown) {
    return fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-kafka-browser/databases/(default)/documents/${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  }
  assert.equal((await direct(b.token,`${userPath(a.uid)}/state/${createHash('sha256').update(state).digest('hex')}`)).status,403);
  assert.equal((await direct(b.token,`${userPath(a.uid)}/state/stolen`,'PATCH',{fields:{value:{stringValue:'overwrite'}}})).status,403);
  for(const outsider of [e,unverified])assert.equal((await direct(outsider.token,`companies/${workspace}/connections/${connection.id}`)).status,403);
  assert.equal((await direct(a.token,'companies/another-company/connections/test')).status,403);
  assert.equal((await direct('','companies/'+workspace+'/connections/'+connection.id)).status,403);
  await bob.deleteConnection(connection.id);assert.equal(await alice.connection(connection.id),undefined);
  await alice.deletePreset(personal.id);await bob.deletePreset(company.id,true);
});

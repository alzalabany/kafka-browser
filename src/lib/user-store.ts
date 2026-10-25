import { createHash } from 'node:crypto';
import type { Credentials } from './types';
import { firestore } from './firebase-admin';
import { hosted } from './hosted-config';
import { encryptCredentials, decryptCredentials } from './credential-crypto';
import { readPreset, type Preset } from './presets';
import { HttpError } from './auth';

const hash = (value:string) => createHash('sha256').update(value).digest('hex');
export function userPath(uid:string) { return `users/${hash(uid)}`; }
function validateId(id:string) { if (!id || id.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new HttpError(400,'Invalid record id'); }
function validateSize(value:unknown) { if (Buffer.byteLength(JSON.stringify(value)) > 500_000) throw new HttpError(400,'Saved data must be smaller than 500 KB'); }

export async function userStore(uid:string, email?:string) {
  if (!hosted()) {
    const local = await import('./db');
    const { presetStore } = await import('./presets');
    const presets = presetStore(local.db);
    return {
      connections:async () => local.connections(), connection:async (id:string) => local.connection(id),
      saveConnection:async (c:Credentials) => { local.saveConnection(c); },
      deleteConnection:async (id:string) => { local.deleteConnection(id); },
      getState:async (key:string,company=false) => {void company;return local.getState(key);}, setState:async (key:string,value:unknown,company=false) => {void company;local.setState(key,value);},
      presets:async () => presets.list(), savePreset:async (input:unknown) => presets.save(input), deletePreset:async (id:string,company=false) => {void company;return presets.remove(id);},
    };
  }
  const root = firestore().doc(userPath(uid));
  const domain = email?.toLowerCase().split('@')[1];
  if (!domain) throw new HttpError(403,'Verified company email required');
  const workspace = `companies/${hash(domain)}`;
  const connections = firestore().doc(workspace).collection('connections'), states = root.collection('state'), presets = root.collection('presets');
  const sharedStates = firestore().doc(workspace).collection('state');
  const sharedPresets = firestore().doc(workspace).collection('presets');
  const decode = (id:string,data:FirebaseFirestore.DocumentData) => decryptCredentials<Credentials>(data.encrypted,workspace,id);
  return {
    connections:async () => (await connections.get()).docs.map(doc => decode(doc.id,doc.data())),
    connection:async (id:string) => {
      validateId(id);
      const doc = await connections.doc(id).get();
      return doc.exists ? decode(doc.id,doc.data()!) : undefined;
    },
    saveConnection:async (c:Credentials) => {
      validateId(c.id); validateSize(c);
      await connections.doc(c.id).set({encrypted:encryptCredentials(c,workspace,c.id)});
    },
    deleteConnection:async (id:string) => {
      validateId(id);
      const batch = firestore().batch(); batch.delete(connections.doc(id)); batch.delete(states.doc(hash(id))); await batch.commit();
    },
    getState:async (key:string,company=false) => (await (company && key !== 'app' ? sharedStates : states).doc(hash(key)).get()).data()?.value || {},
    setState:async (key:string,value:unknown,company=false) => {
      validateSize(value);
      if (company && JSON.stringify(value).includes('"personal_')) throw new HttpError(400,'Company views can only select company rules. Save a company copy of personal rules first.');
      await (company && key !== 'app' ? sharedStates : states).doc(hash(key)).set({value});
    },
    presets:async () => {
      const [personal,company] = await Promise.all([presets.get(),sharedPresets.get()]);
      return [...personal.docs.map(doc => ({...doc.data(),id:`personal_${doc.id}`,scope:'personal'}) as Preset),...company.docs.map(doc => ({...doc.data(),id:`company_${doc.id}`,scope:'company'}) as Preset)].sort((a,b) => a.name.localeCompare(b.name));
    },
    savePreset:async (input:unknown) => {
      const value = readPreset(input); validateSize(value);
      // Same-name rules have stable, user-scoped IDs, including concurrent saves.
      const id = hash(JSON.stringify([value.kind,value.name]));
      const company = value.scope === 'company';
      await (company ? sharedPresets : presets).doc(id).set(value);
      return {...value,id:`${company ? 'company' : 'personal'}_${id}`};
    },
    deletePreset:async (id:string,company=false) => {
      validateId(id);
      const prefix = company ? 'company_' : 'personal_';
      if (!id.startsWith(prefix)) throw new HttpError(400,'Rule sharing scope does not match its id');
      const ref = (company ? sharedPresets : presets).doc(id.slice(prefix.length));
      return firestore().runTransaction(async tx => { const doc=await tx.get(ref); if (!doc.exists) return false; tx.delete(ref); return true; });
    },
  };
}

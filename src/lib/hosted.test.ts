import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { allowedIdentity } from './hosted-config';
import { encryptCredentials, decryptCredentials } from './credential-crypto';
import { validateBroker } from './broker-policy';
import { streamLease, stopUserStreams } from './stream-limits';
import { checkOrigin, HttpError } from './auth';

process.env.KAFKA_BROWSER_MODE='hosted';
process.env.ALLOWED_EMAIL_DOMAINS='amanacapital.com';
process.env.KAFKA_CREDENTIALS_KEY=randomBytes(32).toString('base64');
process.env.APP_ORIGIN='https://kafka.example.com';

test('company access requires a verified Google identity with the exact email domain', () => {
  const claims={email:'dev@amanacapital.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
  assert.equal(allowedIdentity(claims),true);
  for (const email of ['dev@gmail.com','dev@amanacapital.com.evil.test','dev@sub.amanacapital.com','dev@evilamanacapital.com','@amanacapital.com']) assert.equal(allowedIdentity({...claims,email}),false);
  assert.equal(allowedIdentity({...claims,email_verified:false}),false);
  assert.equal(allowedIdentity({...claims,firebase:{sign_in_provider:'password'}}),false);
  assert.equal(allowedIdentity({...claims,email:'Dev@AmanaCapital.com'}),true);
});
test('credentials are encrypted with randomized IVs and bound to company and connection', () => {
  const secret={password:'test-secret',key:'test-private-key'};
  const a=encryptCredentials(secret,'company-a','connection-a');
  const b=encryptCredentials(secret,'company-a','connection-a');
  assert.notEqual(a.ciphertext,b.ciphertext);
  assert.ok(!JSON.stringify(a).includes('test-secret'));
  assert.deepEqual(decryptCredentials(a,'company-a','connection-a'),secret);
  assert.throws(()=>decryptCredentials(a,'company-b','connection-a'));
  assert.throws(()=>decryptCredentials(a,'company-a','connection-b'));
  assert.throws(()=>decryptCredentials({...a,tag:Buffer.alloc(16).toString('base64')},'company-a','connection-a'));
});
test('hosted mutations require the configured origin, including behind a reverse proxy', () => {
  assert.doesNotThrow(()=>checkOrigin(new Request('http://internal:8080/api/state',{headers:{Origin:'https://kafka.example.com'}})));
  assert.throws(()=>checkOrigin(new Request('http://internal:8080/api/state',{headers:{Origin:'https://evil.test'}})),HttpError);
  assert.throws(()=>checkOrigin(new Request('http://internal:8080/api/state')),HttpError);
});
test('broker policy restricts bootstrap and advertised hosts with domain boundaries and optional ports', () => {
  process.env.KAFKA_ALLOWED_HOSTS='broker.example.com:9093,*.cluster.example.com';
  assert.doesNotThrow(()=>validateBroker('broker.example.com',9093));
  assert.doesNotThrow(()=>validateBroker('node-1.cluster.example.com',25062));
  for (const [host,port] of [['broker.example.com',80],['127.0.0.1',9093],['cluster.example.com.evil.test',9093],['evilcluster.example.com',9093]] as const) assert.throws(()=>validateBroker(host,port));
  process.env.KAFKA_ALLOWED_HOSTS='*';validateBroker('any-broker.example.com',25062);validateBroker('10.0.0.1',9093);
  process.env.KAFKA_ALLOWED_HOSTS='*:9093';validateBroker('any-broker.example.com',9093);assert.throws(()=>validateBroker('any-broker.example.com',9092));
  process.env.KAFKA_ALLOWED_HOSTS='';assert.throws(()=>validateBroker('broker.example.com',9093));
});
test('stream limits are isolated per user and logout cancels and releases active streams', () => {
  const first=streamLease('alice'),second=streamLease('alice');
  const other=streamLease('bob');
  assert.throws(()=>streamLease('alice'),HttpError);
  let cancelled=0;
  first.onCancel(()=>{cancelled++;first.release();});second.onCancel(()=>{cancelled++;second.release();});
  stopUserStreams('alice');assert.equal(cancelled,2);
  const again=streamLease('alice');again.release();other.release();
});

// Operator-only migration using local ADC. Never deploy ADC to the application.
import { createHash } from 'node:crypto';
import { firebaseAuth, firestore } from '../src/lib/firebase-admin';

async function main() {
  if (process.env.FIREBASE_PROJECT_ID !== 'kafka-browser') throw new Error('Migration is restricted to the company Kafka Browser project');
  let pageToken:string|undefined,copied=0;
  do {
    const page=await firebaseAuth().listUsers(1000,pageToken);
    for (const user of page.users) {
      const legacy=createHash('sha256').update(user.uid).digest('hex');
      for (const collection of ['state','presets']) {
        const records=await firestore().collection(`users/${legacy}/${collection}`).get();
        for (const record of records.docs) {
          const target=firestore().doc(`users/${user.uid}/${collection}/${record.id}`);
          // Preserve any newer keyless data and keep the legacy records as backup.
          if (!(await target.get()).exists) {await target.create(record.data());copied++;}
        }
      }
    }
    pageToken=page.pageToken;
  } while(pageToken);
  console.log(`Migrated ${copied} personal workspace records; legacy data retained.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>firestore().terminate());

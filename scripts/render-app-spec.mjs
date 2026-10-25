import {readFile,writeFile,mkdir} from 'node:fs/promises';
let spec=await readFile('.do/app.yaml','utf8');
for (const [placeholder,key] of Object.entries({REPLACE_WITH_FIREBASE_WEB_API_KEY:'FIREBASE_WEB_API_KEY',REPLACE_WITH_BASE64_32_BYTE_KEY:'KAFKA_CREDENTIALS_KEY',REPLACE_WITH_COMMA_SEPARATED_BROKER_HOSTS:'KAFKA_ALLOWED_HOSTS'})) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
  spec=spec.replace(placeholder,JSON.stringify(process.env[key]));
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/app-hosted.yaml',spec,{mode:0o600});
console.log('Wrote ignored artifacts/app-hosted.yaml. It contains runtime secrets; do not commit or share it.');

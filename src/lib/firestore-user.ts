import { firebaseToken } from './firebase-user';

type Value = {nullValue?:null;booleanValue?:boolean;integerValue?:string;doubleValue?:number;stringValue?:string;arrayValue?:{values?:Value[]};mapValue?:{fields?:Fields}};
type Fields=Record<string,Value>;
function encode(value:unknown):Value {
  if (value===null) return {nullValue:null};
  if (typeof value==='string') return {stringValue:value};
  if (typeof value==='boolean') return {booleanValue:value};
  if (typeof value==='number' && Number.isFinite(value)) return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if (Array.isArray(value)) return {arrayValue:{values:value.map(encode)}};
  if (typeof value==='object'&&value) return {mapValue:{fields:fields(value as Record<string,unknown>)}};
  throw new Error('Unsupported saved value');
}
const fields=(value:Record<string,unknown>):Fields=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]));
function decode(value:Value):unknown {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decode);
  return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([k,v])=>[k,decode(v)]));
}
type Document={name:string;fields?:Fields};
function snapshot(document:Document|undefined,id:string) {
  return {id,exists:Boolean(document),data:()=>document?decode({mapValue:{fields:document.fields}}) as Record<string,unknown>:undefined};
}
export function userFirestore() {
  // Capture the verified request token; background work never falls back to ADC.
  const token=firebaseToken();
  const root=`projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const emulator=process.env.NODE_ENV !== 'production' && process.env.FIRESTORE_EMULATOR_HOST;
  const base=emulator?`http://${emulator}/v1/`:'https://firestore.googleapis.com/v1/';
  async function request(path:string,method='GET',body?:unknown,missing=false) {
    const response=await fetch(`${base}${root}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(15_000)});
    if (missing&&response.status===404) return undefined;
    if (!response.ok) throw new Error(`Firestore request failed (${response.status})`);
    return response.json();
  }
  function doc(path:string) {
    if (path.split('/').some(part=>!part || !/^[a-zA-Z0-9_.@-]+$/.test(part))) throw new Error('Invalid storage path');
    const id=path.split('/').at(-1)!;
    return {
      path,
      get:async()=>snapshot(await request(`/${path}`,'GET',undefined,true) as Document|undefined,id),
      set:async(value:Record<string,unknown>)=>{await request(`/${path}`,'PATCH',{fields:fields(value)});},
      delete:async()=>{await request(`/${path}`,'DELETE',undefined,true);},
      collection:(name:string)=>collection(`${path}/${name}`),
    };
  }
  function collection(path:string) {
    return {doc:(id:string)=>doc(`${path}/${id}`),get:async()=>{
      const docs:ReturnType<typeof snapshot>[]=[];let pageToken:string|undefined;
      do {
        const result=await request(`/${path}?pageSize=1000${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`) as {documents?:Document[];nextPageToken?:string};
        docs.push(...(result.documents || []).map(document=>snapshot(document,document.name.split('/').at(-1)!)));
        pageToken=result.nextPageToken;
      } while(pageToken);
      return {docs};
    }};
  }
  return {doc,batch:()=>{
    const writes:{delete:string}[]=[];
    return {delete:(ref:{path:string})=>{writes.push({delete:`${root}/${ref.path}`});},commit:async()=>{await request(':commit','POST',{writes});}};
  }};
}

import './config.js';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

// Independent of SESSION_SECRET: operators must persist this key across restarts/backups.
const configured=process.env.API_KEY_ENCRYPTION_KEY;
if(configured&&!/^[a-fA-F0-9]{64}$/.test(configured))throw Error('API_KEY_ENCRYPTION_KEY must be 64 hex characters');
const master=configured?Buffer.from(configured,'hex'):null;
export const keyStorageReady=!!master;
export function encryptKey(secret:string,recordId:string){
  if(!master)throw Object.assign(Error('请配置稳定的 API_KEY_ENCRYPTION_KEY 后再生成密钥'),{status:503});
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',master,iv);
  cipher.setAAD(Buffer.from('jack-api-key:v1:'+recordId));
  const bytes=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');
}
export function decryptKey(value:string,recordId:string){
  if(!master)return null;
  try{
    const [version,iv,tag,bytes,...extra]=value.split('.');
    if(version!=='v1'||!iv||!tag||!bytes||extra.length)throw Error();
    const decipher=createDecipheriv('aes-256-gcm',master,Buffer.from(iv,'base64url'));
    decipher.setAAD(Buffer.from('jack-api-key:v1:'+recordId));decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(bytes,'base64url')),decipher.final()]).toString('utf8');
  }catch{throw Error('API Key decryption failed; restore the correct API_KEY_ENCRYPTION_KEY and database backup');}
}
export const keyHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const scopes=['requirements:read','requirements:write','cases:read','taxonomy:read','taxonomy:write','media:read','media:write'] as const;
export const agentScopes=['requirements:read','requirements:write','cases:read','taxonomy:read','media:read','media:write'];
export const taxonomyScopes=['taxonomy:read','taxonomy:write'];
export function requiredScope(method:string,path:string,query:Record<string,unknown>):string|null{
  if(path==='/api/me')return '';
  if(/^\/api\/(categories|tags)(\/|$)/.test(path))return method==='GET'&&query.scope!=='all'?'taxonomy:read':'taxonomy:write';
  if(/^\/api\/requirements(\/|$)/.test(path)){
    if(query.scope==='all'||/\/review$/.test(path))return null;
    return method==='GET'?'requirements:read':['POST','PATCH'].includes(method)?'requirements:write':null;
  }
  if(/^\/api\/cases(\/|$)/.test(path))return query.scope!=='all'&&(method==='GET'||method==='POST'&&/\/copy-events$/.test(path))?'cases:read':null;
  // Files and legacy images share attachment grants; handlers still enforce ownership/public approval.
  if(/^\/api\/(media|files)(\/|$)/.test(path))return method==='POST'?'media:write':method==='GET'&&path!=='/api/media'&&query.scope!=='all'?'media:read':null;
  return null; // Users, review, audit, stats, admin skill and unknown routes cannot be delegated.
}

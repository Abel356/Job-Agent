import {validateProfile,type MatchProfile} from './matching';

export const LEGACY_PROFILE_KEY='earthwork.match-profile.v1';
const PREFIX='earthwork.match-profile.v2:';
const ITERATIONS=600_000;

function encode(bytes:Uint8Array){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);}
function decode(text:string){return Uint8Array.from(atob(text),char=>char.charCodeAt(0));}

export function normaliseProfileName(name:string){
 const value=name.normalize('NFKC').trim().toLocaleLowerCase('en-US');
 return /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,39}$/u.test(value)?value:null;
}

export async function profileStorageKey(name:string){
 const normalized=normaliseProfileName(name);
 if(!normalized)throw Error('Use 2–40 letters, numbers, spaces, periods, underscores or hyphens for a profile name.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
 return PREFIX+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function newProfileSalt(){return encode(crypto.getRandomValues(new Uint8Array(16)));}

export async function deriveProfileKey(passphrase:string,salt:string){
 const input=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(salt),iterations:ITERATIONS,hash:'SHA-256'},input,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export function readProfileSalt(raw:string):string|null{
 try{const value=JSON.parse(raw);return value?.version===2&&typeof value.salt==='string'&&decode(value.salt).length===16?value.salt:null;}catch{return null;}
}

export async function encryptProfile(profile:MatchProfile,id:string,key:CryptoKey,salt:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const plaintext=new TextEncoder().encode(JSON.stringify(profile));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},key,plaintext);
 return JSON.stringify({version:2,salt,iv:encode(iv),data:encode(new Uint8Array(encrypted))});
}

export async function decryptProfile(raw:string,id:string,key:CryptoKey):Promise<MatchProfile|null>{
 try{
  const value=JSON.parse(raw);
  if(value?.version!==2||typeof value.iv!=='string'||typeof value.data!=='string')return null;
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv),additionalData:new TextEncoder().encode(id)},key,decode(value.data));
  return validateProfile(JSON.parse(new TextDecoder().decode(plaintext)));
 }catch{return null;}
}

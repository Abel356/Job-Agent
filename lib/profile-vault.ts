import {validateProfile,type MatchProfile} from './matching';

export const LEGACY_PROFILE_KEY='earthwork.match-profile.v1';
export const profileStorageKey=(owner:string)=>`earthwork.match-profile.v2:${owner}`;

function bytesToBase64(bytes:Uint8Array){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);}
function base64ToBytes(text:string){return Uint8Array.from(atob(text),char=>char.charCodeAt(0));}
async function keyFrom(secret:string){return crypto.subtle.importKey('raw',base64ToBytes(secret),'AES-GCM',false,['encrypt','decrypt']);}

export async function encryptProfile(profile:MatchProfile,owner:string,secret:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=new TextEncoder().encode(JSON.stringify(profile));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},await keyFrom(secret),data);
 return JSON.stringify({version:2,iv:bytesToBase64(iv),data:bytesToBase64(new Uint8Array(ciphertext))});
}

export async function decryptProfile(raw:string,owner:string,secret:string):Promise<MatchProfile|null>{
 try{
  const parsed=JSON.parse(raw);
  if(parsed?.version!==2||typeof parsed.iv!=='string'||typeof parsed.data!=='string')return null;
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(parsed.iv),additionalData:new TextEncoder().encode(owner)},await keyFrom(secret),base64ToBytes(parsed.data));
  return validateProfile(JSON.parse(new TextDecoder().decode(plaintext)));
 }catch{return null;}
}

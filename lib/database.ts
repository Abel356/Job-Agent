import {neon, type NeonQueryFunction} from '@neondatabase/serverless';
let client:NeonQueryFunction<false,false>|undefined;
function connection(){
 if(!client){const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL is not configured');client=neon(url);}
 return client;
}
// Existing statements use SQLite-style placeholders. Ignore question marks in SQL literals.
export function parameters(sql:string){
 let n=0,quoted=false,out='';
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"){if(quoted&&sql[i+1]==="'"){out+="''";i++;continue;}quoted=!quoted;}
  out+=c==='?'&&!quoted?'$'+(++n):c;
 }
 return out;
}
class Statement {
 constructor(readonly sql:string,readonly args:unknown[]=[]){ }
 bind(...args:unknown[]){return new Statement(this.sql,args);}
 query(){return connection().query(parameters(this.sql),this.args);}
 async all<T>(){return {results:await this.query() as T[]};}
 async first<T=Record<string,unknown>>(){return (await this.all<T>()).results[0]||null;}
 async run(){return this.query();}
}
export function db(){return {prepare:(sql:string)=>new Statement(sql),batch:(statements:Statement[])=>connection().transaction(statements.map(s=>s.query()))};}
export async function all<T>(sql:string,args:unknown[]=[]):Promise<T[]>{return (await db().prepare(sql).bind(...args).all<T>()).results;}

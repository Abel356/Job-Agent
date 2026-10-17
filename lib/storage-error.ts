// Never expose provider messages, connection strings or SQL to the browser.
export function storageError(error:unknown, fallback:string, status:number){
 const message=error instanceof Error?error.message:'';
 if(/HTTP status 402|(?:account|project) has exceeded the quota/i.test(message)){
  return {status:402,body:{code:'DATABASE_QUOTA_EXCEEDED',error:'The database quota has been reached. Job loading and refreshes are paused until database capacity is restored in Neon.'}};
 }
 return {status,body:{error:fallback}};
}

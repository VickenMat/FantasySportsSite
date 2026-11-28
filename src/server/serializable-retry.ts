/** Retry only rolled-back Serializable/deadlock conflicts; caller rechecks its
 * lease fence inside each transaction. Other failures keep their own backoff. */
function isRetryableTransactionConflict(error:unknown){
 if(typeof error!=='object'||error===null)return false;
 const candidate=error as{code?:unknown;meta?:unknown;name?:unknown;cause?:unknown};
 if(candidate.name==='DriverAdapterError'&&typeof candidate.cause==='object'&&candidate.cause!==null){
  const cause=candidate.cause as{kind?:unknown;originalCode?:unknown};
  // Prisma7's pg adapter can expose a conflict directly at transaction commit.
  if(cause.kind==='TransactionWriteConflict'&&(cause.originalCode==='40001'||cause.originalCode==='40P01'))return true;
 }
 if(candidate.code==='P2034')return true;
 if(candidate.code!=='P2010'||typeof candidate.meta!=='object'||candidate.meta===null)return false;
 const sqlState=(candidate.meta as{code?:unknown}).code;
 // Raw SQL inside an interactive transaction can retain its PostgreSQL
 // SQLSTATE rather than being translated to Prisma's P2034 transaction error.
 return sqlState==='40001'||sqlState==='40P01';
}
export async function withSerializableRetry<T>(operation:()=>Promise<T>,options:{maxAttempts?:number;wait?:(milliseconds:number)=>Promise<void>}={}){
 const maxAttempts=options.maxAttempts??4;if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw Error('Bound Serializable retry attempts.');
 const wait=options.wait??(milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)));
 for(let attempt=1;;attempt++){try{return await operation();}catch(error){if(!isRetryableTransactionConflict(error)||attempt>=maxAttempts)throw error;await wait(10*2**(attempt-1));}}
}

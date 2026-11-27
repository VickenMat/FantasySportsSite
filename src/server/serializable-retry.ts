/** Retry only rolled-back Serializable/deadlock conflicts; caller rechecks its
 * lease fence inside each transaction. Other failures keep their own backoff. */
export async function withSerializableRetry<T>(operation:()=>Promise<T>,options:{maxAttempts?:number;wait?:(milliseconds:number)=>Promise<void>}={}){
 const maxAttempts=options.maxAttempts??4;if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw Error('Bound Serializable retry attempts.');
 const wait=options.wait??(milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)));
 for(let attempt=1;;attempt++){try{return await operation();}catch(error){if((error as{code?:string})?.code!=='P2034'||attempt>=maxAttempts)throw error;await wait(10*2**(attempt-1));}}
}

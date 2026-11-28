import {it,expect} from 'vitest';
import {withSerializableRetry} from '@/server/serializable-retry';
it('retries transient rolled-back Serializable conflicts within a bounded transaction retry budget',async()=>{let attempts=0;const waits:number[]=[];expect(await withSerializableRetry(async()=>{if(++attempts<3)throw{code:'P2034'};return'accepted';},{wait:async n=>{waits.push(n);}})).toBe('accepted');expect(attempts).toBe(3);expect(waits).toEqual([10,20]);});
it('does not hide a lost lease, provider failure or exhausted Serializable retry',async()=>{const lost=new Error('Lease lost');let attempts=0;await expect(withSerializableRetry(async()=>{attempts++;throw lost;},{wait:async()=>{}})).rejects.toBe(lost);expect(attempts).toBe(1);attempts=0;await expect(withSerializableRetry(async()=>{attempts++;throw{code:'P2034'};},{wait:async()=>{}})).rejects.toMatchObject({code:'P2034'});expect(attempts).toBe(4);});
it.each(['40001','40P01'])('retries Prisma raw SQL transaction conflict %s within the same bounded budget',async code=>{
 const conflict={code:'P2010',meta:{code}},waits:number[]=[];let attempts=0;
 expect(await withSerializableRetry(async()=>{if(++attempts<3)throw conflict;return'accepted';},{wait:async n=>{waits.push(n);}})).toBe('accepted');
 expect(attempts).toBe(3);expect(waits).toEqual([10,20]);
 attempts=0;waits.length=0;
 await expect(withSerializableRetry(async()=>{attempts++;throw conflict;},{wait:async n=>{waits.push(n);}})).rejects.toBe(conflict);
 expect(attempts).toBe(4);expect(waits).toEqual([10,20,40]);
});
it.each([
 {name:'DriverAdapterError',cause:{kind:'TransactionWriteConflict',originalCode:'23505'}},
 {name:'DriverAdapterError',cause:{kind:'Other',originalCode:'40001'}},
 {name:'Error',cause:{kind:'TransactionWriteConflict',originalCode:'40001'}},
 {code:'P2010',meta:{code:'23505'}},
 {code:'P2010',meta:{message:'40001 could not serialize access'}},
 {code:'P2010',meta:{code:40001}},
 {code:'40001'},
 {code:'P2002',meta:{code:'40001'}},
 new Error('40P01 deadlock detected'),
 null,
])('does not retry unrelated, malformed or message-only database errors %#',async error=>{
 let attempts=0;const waits:number[]=[];
 await expect(withSerializableRetry(async()=>{attempts++;throw error;},{wait:async n=>{waits.push(n);}})).rejects.toBe(error);
 expect(attempts).toBe(1);expect(waits).toEqual([]);
});
it.each(['40001','40P01'])('retries direct Prisma pg adapter commit conflict %s',async originalCode=>{
 const conflict=Object.assign(new Error('TransactionWriteConflict'),{name:'DriverAdapterError',cause:{kind:'TransactionWriteConflict',originalCode}});let attempts=0;const waits:number[]=[];
 expect(await withSerializableRetry(async()=>{if(++attempts<3)throw conflict;return 'accepted';},{wait:async n=>{waits.push(n);}})).toBe('accepted');expect(attempts).toBe(3);expect(waits).toEqual([10,20]);
 attempts=0;await expect(withSerializableRetry(async()=>{attempts++;throw conflict;},{wait:async()=>{}})).rejects.toBe(conflict);expect(attempts).toBe(4);
});

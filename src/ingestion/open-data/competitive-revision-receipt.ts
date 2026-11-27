import {mkdir,readFile,writeFile} from 'node:fs/promises';
/** Stable first local validation of one semantic source representation, independent of other sports. */
export async function competitiveRevisionOrdinal(sourceFingerprint:string,validatedAt:string,directory='data/provider_previews/competitive-stage-receipts'){
 if(!/^[a-f0-9]{64}$/.test(sourceFingerprint)||!Number.isSafeInteger(Date.parse(validatedAt)))throw Error('Invalid semantic revision receipt.');
 await mkdir(directory,{recursive:true});const path=`${directory}/${sourceFingerprint}.json`;
 try{await writeFile(path,JSON.stringify({sourceFingerprint,firstValidatedAt:validatedAt,semantics:'LOCAL_SEMANTIC_REPRESENTATION_FIRST_VALIDATION_NOT_SOURCE_PUBLICATION'})+'\n',{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 const receipt=JSON.parse(await readFile(path,'utf8'));
 if(receipt.sourceFingerprint!==sourceFingerprint||!Number.isSafeInteger(Date.parse(receipt.firstValidatedAt)))throw Error('Semantic revision receipt changed.');
 return Date.parse(receipt.firstValidatedAt);
}

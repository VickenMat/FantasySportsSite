import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { reviewProfessionalIdentityResolution } from '@/ingestion/identity-resolutions';
import { getDatabase } from '@/lib/db';
const path=process.argv[2];if(!path)throw Error('Pass a reviewed identity-resolution proposal JSON file. Default is a read-only preview.');
const index=process.argv.indexOf('--apply-fingerprint');
try{console.log(JSON.stringify(await reviewProfessionalIdentityResolution(JSON.parse(await readFile(path,'utf8')),index<0?undefined:{expectedFingerprint:process.argv[index+1]}),null,2));}
finally{await getDatabase().$disconnect();}

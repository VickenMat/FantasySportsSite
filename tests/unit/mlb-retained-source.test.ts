import {gzipSync} from 'node:zlib';
import {expect,it} from 'vitest';
import {decodeMlbRetainedRows} from '@/ingestion/open-data/mlb-historical-box';

it('decodes gzip content-addressed MLB source bytes without relying on a filename extension',()=>{
 const csv=Buffer.from('game_pk,batter,description\n823244,123,"single, runner advances"\n');
 const expected=[{game_pk:'823244',batter:'123',description:'single, runner advances'}];
 expect(decodeMlbRetainedRows(gzipSync(csv))).toEqual(expected);
 expect(decodeMlbRetainedRows(csv)).toEqual(expected);
 expect(()=>decodeMlbRetainedRows(Buffer.from([0x1f,0x8b,0x00]))).toThrow();
});

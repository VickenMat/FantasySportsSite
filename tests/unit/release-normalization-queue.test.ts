import{test,expect}from'vitest';
import{mkdtemp,readFile,rm}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{stageReleaseCandidates}from'@/ingestion/open-data/normalization-queue';
import{bodyHash}from'@/ingestion/open-data/storage';
import{releaseRegistry}from'@/ingestion/open-data/registry';
test('retried and concurrent source normalization preserves first prospective receipt without promoting candidates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'release-queue-'));
 try{
  const product=releaseRegistry.find(p=>p.id==='nfl-rosters-2026')!;expect(product).toBeDefined();
  const bytes=Buffer.from('gsis_id,position,team,status,rookie_year\n00-0000001,QB,NE,ACT,2026\n');
  const metadata={sha256:bodyHash(bytes),receivedAt:'2026-11-27T01:00:00Z',lastModified:'2026-11-26T01:00:00Z'};
  const at=new Date('2026-11-27T01:01:00Z');
  const[first,concurrent]=await Promise.all([stageReleaseCandidates(product,bytes,metadata,root,at),stageReleaseCandidates(product,bytes,metadata,root,at)]);
  expect(concurrent).toEqual(first);expect(first.candidateCount).toBe(3);expect(first.canonicalPromotion).toBe('DISABLED_REQUIRES_EXACT_REVIEW');
  expect(await stageReleaseCandidates(product,bytes,metadata,root,new Date('2026-11-28T01:00:00Z'))).toEqual(first);
  const retained=JSON.parse(await readFile(`${root}/normalization-queue/${product.id}-${metadata.sha256}-snapshot-v2.json`,'utf8'));
  expect(retained.candidates.every((c:{effectiveAt:unknown;publishedAt:unknown})=>c.effectiveAt===null&&c.publishedAt===null)).toBe(true);
  await expect(stageReleaseCandidates(product,Buffer.from('changed'),metadata,root,at)).rejects.toThrow('fingerprint mismatch');
 }finally{await rm(root,{recursive:true,force:true});}
});

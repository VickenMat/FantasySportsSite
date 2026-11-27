import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
it('refuses a replacement stack before acquiring any stack lock while a reviewed deployment is active',async()=>{const directory=await mkdtemp(join(tmpdir(),'fantasy-deployment-fence-'));try{await writeFile(join(directory,'.reviewed-data-application-lock'),'Synthetic isolated startup fixture');const result=spawnSync(process.execPath,[resolve('scripts/dev-all.mjs')],{cwd:directory,encoding:'utf8'});expect(result.status).toBe(1);expect(result.stderr).toContain('reviewed data deployment is active');expect(await access(join(directory,'.dev-stack-lock')).then(()=>true,()=>false)).toBe(false);}finally{await rm(directory,{recursive:true,force:true});}});

import {expect,it,vi}from"vitest";
import{fetchPublicData,professionalPollInterval,retryAfter,type HttpPolicy}from"@/ingestion/http";
const policy:HttpPolicy={sourceUrl:"https://github.com/source/file",allowedHosts:["github.com","release-assets.githubusercontent.com"],maxBytes:32,timeoutMs:1000,permission:"OPEN_DATA_PREVIEW"};
it("uses conditional caching and counts redirects without exposing signed redirect URLs",async()=>{
 const mock=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:"https://release-assets.githubusercontent.com/file?signature=private"}})).mockResolvedValueOnce(new Response("hello",{headers:{etag:"v1"}}));
 const result=await fetchPublicData(policy,undefined,mock);
 expect(result).toMatchObject({status:"FETCHED",requests:2});expect(JSON.stringify(result)).not.toContain("signature");
 if(result.status!=="FETCHED")throw new Error("expected fetched");
 const cached=vi.fn().mockResolvedValue(new Response(null,{status:304}));
 expect(await fetchPublicData(policy,result.cache,cached)).toMatchObject({status:"NOT_MODIFIED",requests:1});
 expect(cached.mock.calls[0][1].headers["If-None-Match"]).toBe("v1");
});
it("rejects out-of-scope redirects and oversized streaming bodies, and leaves disabled providers untouched",async()=>{
 const denied=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:"http://localhost/private"}}));
 await expect(fetchPublicData(policy,undefined,denied)).rejects.toThrow(/HTTPS host scope/);
 await expect(fetchPublicData(policy,undefined,vi.fn().mockResolvedValue(new Response("x".repeat(33))))).rejects.toThrow(/byte limit/);
 const disabled=vi.fn();expect(await fetchPublicData({...policy,permission:"DISABLED"},undefined,disabled)).toEqual({status:"PENDING_PERMISSION"});expect(disabled).not.toHaveBeenCalled();
});
it("honors provider backoff and adapts polling to professional game state without promising publication latency",()=>{
 expect(retryAfter("120",new Date())).toBe(120000);
 expect(professionalPollInterval("LIVE",null,null,60000)).toBe(60000);
 expect(professionalPollInterval("LIVE",null,null,1000)).toBe(15000);
 expect(professionalPollInterval("FINAL",null,86400001,1000)).toBe(86400000);
 expect(professionalPollInterval("SCHEDULED",7200000,null,1000)).toBe(900000);
});

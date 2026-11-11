// Explicit user-authorized import from the existing Azure deployment.
// Default is a non-writing authentication audit. --sync stores values via
// Keyrail stdin and writes only the pinned OpenBuild production environment.
// Never print raw values, transfer the legacy public secret name, copy domestic
// NextAuth settings, send mail, create assets, or mutate the Azure source.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../package.json', import.meta.url));
const cloudinary=require('cloudinary').v2;
if (process.argv.slice(2).some(arg=>arg!=='--sync')) throw Error('Only --sync is supported');
const project='prj_KPv0pSUICFUsxaA2MJKNi2gT1UEa', team='team_jdKwYH5K67gHpkE5vr43CPAc';
const sourceProgram=String.raw`import json,re
from urllib.parse import urlsplit,parse_qs
import yaml
values={}
for line in open('/home/azureuser/website/.env.production'):
 m=re.match(r'(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)',line.strip())
 if m:
  value=m[2].strip()
  values[m[1]]=value[1:-1] if len(value)>1 and value[0]==value[-1] and value[0] in '\"\x27' else value
cfg=yaml.safe_load(open('/home/azureuser/website/kaiyuanshe/config.yaml'))
u=values.get('NEXT_PUBLIC_OAUTH','')
assert urlsplit(u).scheme=='https' and not urlsplit(u).username and not urlsplit(u).password and not urlsplit(u).fragment
assert urlsplit(u).hostname=='github.com' and urlsplit(u).path=='/login/oauth/authorize'
assert parse_qs(urlsplit(u).query).get('client_id',[None])[0]==cfg.get('oauth',{}).get('clientId')
output={
 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME':values.get('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',''),
 'NEXT_PUBLIC_CLOUDINARY_API_KEY':values.get('NEXT_PUBLIC_CLOUDINARY_API_KEY',''),
 'NEXT_PUBLIC_CLOUDINARY_UPLOAD_FOLDERS':values.get('NEXT_PUBLIC_CLOUDINARY_UPLOAD_FOLDERS',''),
 'CLOUDINARY_CLOUD_NAME':values.get('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',''),
 'CLOUDINARY_API_KEY':values.get('NEXT_PUBLIC_CLOUDINARY_API_KEY',''),
 'CLOUDINARY_API_SECRET':values.get('CLOUDINARY_API_SECRET') or values.get('NEXT_PUBLIC_CLOUDINARY_API_SECRET',''),
 'CLOUDINARY_UPLOAD_FOLDER':values.get('NEXT_PUBLIC_CLOUDINARY_UPLOAD_FOLDERS',''),
 'NEXT_PUBLIC_OAUTH':u,
}
assert all(isinstance(v,str) and v for v in output.values())
print(json.dumps(output))
`;
const source=spawnSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','kaisource-prod','python3 -'],{input:sourceProgram,encoding:'utf8',maxBuffer:1024*1024});
if(source.status!==0)throw Error('Azure credential export failed; source output suppressed');
let values;try{values=JSON.parse(source.stdout)}catch{throw Error('Invalid Azure export; payload suppressed')}
source.stdout='';source.stderr='';
if('NEXT_PUBLIC_CLOUDINARY_API_SECRET' in values)throw Error('Public secret name prohibited');
if (values.CLOUDINARY_UPLOAD_FOLDER.length>200 || !/^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(values.CLOUDINARY_UPLOAD_FOLDER)) throw Error('Invalid media root; value suppressed');
cloudinary.config({cloud_name:values.CLOUDINARY_CLOUD_NAME,api_key:values.CLOUDINARY_API_KEY,api_secret:values.CLOUDINARY_API_SECRET,secure:true});
try{const ping=await cloudinary.api.ping({timeout:20000});if(ping.status!=='ok')throw Error();console.log('PASS Cloudinary credential authentication (read-only ping; no asset read/write)')}catch{throw Error('Cloudinary authentication failed; credential/provider output suppressed')}
if(!process.argv.includes('--sync')){console.log(JSON.stringify({mode:'validated-no-write',variableNames:Object.keys(values),legacySecretRemappedServerOnly:true},null,2));process.exit(0)}
if(!process.env.VERCEL_TOKEN)throw Error('Project Vercel credential missing');
const headers={Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'content-type':'application/json'};
const checked=await fetch(`https://api.vercel.com/v9/projects/${project}?teamId=${team}`,{headers,signal:AbortSignal.timeout(20000)});
if(!checked.ok)throw Error(`Vercel project verification failed: ${checked.status}`);
const info=await checked.json();if(info.id!==project||info.accountId!==team||info.name!=='kaisource-website')throw Error('Vercel project identity mismatch');
for(const [name,value] of Object.entries(values)){
 const service=`kaisource-${name.toLowerCase().replaceAll('_','-')}`;
 const reference='azure-production';
 for(const [args,input] of [[['auth','add',service,reference,'--value-stdin'],value],[['attach',service,reference,'--env',name],undefined]]){
  const result=spawnSync('keyrail',args,{input,encoding:'utf8',maxBuffer:1024*1024});
  if(result.status!==0)throw Error(`Keyrail ${args[0]} failed for ${name}; output suppressed`);
 }
 console.log(`Stored and routed ${name} via Keyrail (value not printed)`);
}
const payload=Object.entries(values).map(([key,value])=>({key,value,type:key==='CLOUDINARY_API_SECRET'?'sensitive':'encrypted',target:['production']}));
const updated=await fetch(`https://api.vercel.com/v10/projects/${project}/env?teamId=${team}&upsert=true`,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
if(!updated.ok)throw Error(`Project-scoped Vercel environment write failed: ${updated.status}; payload suppressed`);
// Do not print or inspect returned values; only verify metadata from a separate read.
await updated.arrayBuffer();
const verification=await fetch(`https://api.vercel.com/v9/projects/${project}/env?teamId=${team}`,{headers,signal:AbortSignal.timeout(20000)});
if(!verification.ok)throw Error(`Env metadata verification failed: ${verification.status}`);
const metadata=await verification.json();
for(const key of Object.keys(values)){
 const item=metadata.envs?.find(item=>item.key===key&&item.target?.includes('production'));
 if(!item)throw Error(`Production env missing after sync: ${key}`);
 if(key==='CLOUDINARY_API_SECRET'&&item.type!=='sensitive')throw Error('Cloudinary secret must be sensitive');
}
if(metadata.envs?.some(item=>item.key==='NEXT_PUBLIC_CLOUDINARY_API_SECRET'))throw Error('Unexpected public secret env in overseas project');
console.log(JSON.stringify({syncedProject:info.name,team,target:'production',keys:Object.keys(values),secretServerOnly:true,activeDeploymentUnchanged:true},null,2));

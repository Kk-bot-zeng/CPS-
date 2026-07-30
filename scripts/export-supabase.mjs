import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries((await fs.readFile(".env.production.local", "utf8")).split(/\r?\n/).filter(x=>x.includes("=")).map(x=>{const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,"")]}));
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const tables = ["leaders","talents","products","import_jobs","orders"];
const out = {};
for (const table of tables) {
  const rows=[];
  for(let from=0;;from+=1000){const {data,error}=await client.from(table).select("*").range(from,from+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}
  out[table]=rows;
}
const {data:users}=await client.auth.admin.listUsers({page:1,perPage:100});
out.userEmails=users?.users?.map(x=>x.email).filter(Boolean)||[];
await fs.writeFile(".supabase-export.tmp.json",JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v.length])));

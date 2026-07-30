import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
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

import fs from "node:fs/promises";
import pg from "pg";
const data=JSON.parse(await fs.readFile(process.argv[2],"utf8"));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const order=["leaders","talents","products","import_jobs","orders"];
for(const table of order){for(const row of data[table]||[]){delete row.created_by;const keys=Object.keys(row);const vals=keys.map(k=>row[k]);const cols=keys.map(k=>`"${k}"`).join(",");const ps=keys.map((_,i)=>`$${i+1}`).join(",");await pool.query(`insert into ${table} (${cols}) values (${ps}) on conflict do nothing`,vals);}console.log(table,(data[table]||[]).length)}
await pool.end();

import fs from "node:fs/promises";
import pg from "pg";
const data=JSON.parse(await fs.readFile(process.argv[2],"utf8"));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const order=["leaders","talents","products","import_jobs","orders"];
const realTalent=n=>{n=String(n||"").trim();return !!n&&n!=="-"&&!/^FFALCON雷鸟/i.test(n)&&!/(官方|官旗|旗舰店|总部|云仓|中心场|自播)/i.test(n)&&!/^雷鸟电视.*直播间$/i.test(n)};
for(const table of order){for(const row of data[table]||[]){delete row.created_by;if(table==="orders"){row.source_key ||= row.order_no;row.is_talent=realTalent(row.talent_name_raw);row.model_name ||= row.product_name_raw;}const keys=Object.keys(row);const vals=keys.map(k=>row[k]);const cols=keys.map(k=>`"${k}"`).join(",");const ps=keys.map((_,i)=>`$${i+1}`).join(",");await pool.query(`insert into ${table} (${cols}) values (${ps}) on conflict do nothing`,vals);}console.log(table,(data[table]||[]).length)}
await pool.end();

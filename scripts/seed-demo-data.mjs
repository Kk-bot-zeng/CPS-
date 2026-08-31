import process from "node:process";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("缺少 DATABASE_URL。演示数据只能写入独立的本地开发数据库。");
  process.exit(1);
}

let databaseHost = "";
try {
  databaseHost = new URL(connectionString).hostname;
} catch {
  console.error("DATABASE_URL格式不正确。");
  process.exit(1);
}
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
  console.error("安全保护：db:seed-demo 仅允许连接 localhost 或 127.0.0.1。");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

const resources = [
  { id: "10000000-0000-4000-8000-000000000001", name: "演示团长·京东TV", platform: "jd", category: "tv", match: "demo_jd_tv_leader" },
  { id: "10000000-0000-4000-8000-000000000002", name: "演示团长·抖音TV", platform: "douyin", category: "tv", match: "demo_douyin_tv_leader" },
  { id: "10000000-0000-4000-8000-000000000003", name: "演示团长·京东显示器", platform: "jd", category: "monitor", match: "demo_jd_monitor_leader" },
];
const talents = [
  { id: "20000000-0000-4000-8000-000000000001", name: "演示达人·客厅影音", platform: "jd", category: "tv", account: "demo_tv_jd_01", leader: resources[0].id },
  { id: "20000000-0000-4000-8000-000000000002", name: "演示达人·电视测评", platform: "douyin", category: "tv", account: "demo_tv_dy_01", leader: resources[1].id },
  { id: "20000000-0000-4000-8000-000000000003", name: "演示达人·电竞桌面", platform: "jd", category: "monitor", account: "demo_monitor_jd_01", leader: resources[2].id },
  { id: "20000000-0000-4000-8000-000000000004", name: "演示达人·数码办公", platform: "jd", category: "monitor", account: "demo_monitor_jd_02", leader: resources[2].id },
];
const jobs = [
  { id: "30000000-0000-4000-8000-000000000001", channel: "jd", category: "tv" },
  { id: "30000000-0000-4000-8000-000000000002", channel: "douyin", category: "tv" },
  { id: "30000000-0000-4000-8000-000000000003", channel: "jd", category: "monitor" },
];

const daysAgo = (days) => {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - days);
  return value;
};

try {
  await client.query("begin");
  await client.query("delete from orders where source_key like 'demo:%'");
  await client.query("delete from import_jobs where id = any($1::uuid[])", [jobs.map((item) => item.id)]);

  for (const item of resources) {
    await client.query(
      `insert into leaders(id,name,platform,product_category,match_id,cooperation_status,province,city)
       values($1,$2,$3,$4,$5,'合作中','广东省','深圳市')
       on conflict(id) do update set name=excluded.name,platform=excluded.platform,
       product_category=excluded.product_category,match_id=excluded.match_id`,
      [item.id, item.name, item.platform, item.category, item.match],
    );
  }
  for (const item of talents) {
    await client.query(
      `insert into talents(id,name,platform,product_category,platform_account,match_id,leader_id,cooperation_status,province,city)
       values($1,$2,$3,$4,$5,$5,$6,'合作中','广东省','深圳市')
       on conflict(id) do update set name=excluded.name,platform=excluded.platform,
       product_category=excluded.product_category,platform_account=excluded.platform_account,
       match_id=excluded.match_id,leader_id=excluded.leader_id`,
      [item.id, item.name, item.platform, item.category, item.account, item.leader],
    );
  }
  for (const item of jobs) {
    await client.query(
      `insert into import_jobs(id,channel,product_category,file_name,status,total_rows,inserted_rows,created_at,completed_at)
       values($1,$2,$3,'本地演示数据.xlsx','completed',90,90,now(),now())`,
      [item.id, item.channel, item.category],
    );
  }

  const models = {
    tv: ["鹤6 26款", "雀5 25款", "鹏7 26款"],
    monitor: ["U8 显示器", "Q8 电竞显示器", "R6 办公显示器"],
  };
  let sequence = 1;
  for (let day = 1; day <= 90; day += 1) {
    for (const talent of talents) {
      if ((day + sequence) % (talent.category === "tv" ? 3 : 4) === 0) continue;
      const model = models[talent.category][(day + sequence) % 3];
      const quantity = 1 + ((day + sequence) % 3);
      const unitPrice = talent.category === "tv" ? 2599 + ((day % 4) * 400) : 1299 + ((day % 3) * 300);
      const job = jobs.find((item) => item.channel === talent.platform && item.category === talent.category);
      const sourceKey = `demo:${talent.category}:${talent.platform}:${day}:${sequence}`;
      await client.query(
        `insert into orders(platform,product_category,source_key,order_no,external_product_id,merchant_code,
          quantity,paid_at,order_status,payable_amount,talent_name_raw,is_talent,product_name_raw,model_name,
          talent_id,import_job_id,source_payload)
         values($1,$2,$3,$4,$5,$5,$6,$7,'已成交',$8,$9,true,$10,$10,$11,$12,$13)`,
        [talent.platform, talent.category, sourceKey, `DEMO-${String(sequence).padStart(6, "0")}`,
          `DEMO-SKU-${talent.category}-${(day + sequence) % 3}`, quantity, daysAgo(day),
          quantity * unitPrice, talent.name, model, talent.id, job.id, { demo: true }],
      );
      sequence += 1;
    }
  }
  await client.query(
    `update import_jobs j set total_rows=x.rows,inserted_rows=x.rows
     from (select import_job_id,count(*)::integer as rows from orders
           where source_key like 'demo:%' group by import_job_id) x
     where j.id=x.import_job_id`,
  );
  await client.query("commit");
  console.log(`演示数据写入完成：${sequence - 1} 条订单，覆盖TV/显示器及京东/抖音渠道。`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

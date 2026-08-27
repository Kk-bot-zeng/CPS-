import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("缺少 DATABASE_URL，请先配置 .env.local 并在当前终端中加载该变量。");
  process.exit(1);
}

const files = [
  "supabase/local_schema.sql",
  "supabase/jd_rule_management.sql",
  "supabase/product_category.sql",
  "supabase/resource_product_category.sql",
  "supabase/sales_warning.sql",
  "monitor-dashboard/schema.sql",
];

const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const file of files) {
    const sql = await fs.readFile(path.resolve(file), "utf8");
    await client.query(sql);
    console.log(`已执行 ${file}`);
  }
  console.log("本地数据库结构初始化完成。");
} finally {
  await client.end();
}

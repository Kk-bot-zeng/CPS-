import process from "node:process";
import bcrypt from "bcryptjs";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const account = process.env.ADMIN_ACCOUNT;
const password = process.env.ADMIN_PASSWORD;

if (!connectionString || !account || !password) {
  console.error("请设置 DATABASE_URL、ADMIN_ACCOUNT 和 ADMIN_PASSWORD 后重试。");
  process.exit(1);
}
if (password.length < 10) {
  console.error("开发管理员密码至少需要 10 个字符，请勿使用生产密码。");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const hash = await bcrypt.hash(password, 12);
  await client.query(
    `insert into app_users(email,password_hash,active)
     values($1,$2,true)
     on conflict(email) do update set password_hash=excluded.password_hash,active=true`,
    [account, hash],
  );
  console.log(`开发管理员 ${account} 已创建或更新。`);
} finally {
  await client.end();
}

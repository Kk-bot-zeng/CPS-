# 雷鸟电视CPS系统

面向电商 CPS 运营的达人、团长、商品和销售数据管理系统。当前版本包含经营总览、达人管理、团长管理、商品分析、Excel 订单导入和地图中心的前端原型，以及 Supabase 数据库结构。

## 本地运行

```bash
pnpm install
pnpm dev
```

浏览器访问 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env.local`，填写：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_AMAP_KEY`

## 数据库

在 Supabase SQL Editor 中执行 `supabase/schema.sql`。生产环境还需要按管理员、运营、只读用户三个角色补充写入策略。

## Vercel 部署

将目录推送到 GitHub 私有仓库，在 Vercel 导入仓库并配置上述环境变量即可。构建命令使用 `pnpm build`，输出由 Next.js 自动识别。

正式域名：`zlqnb.online`。在 Vercel 项目的 Domains 中添加该域名后，到阿里云 DNS 控制台添加 Vercel 提示的 `A` 或 `CNAME` 记录。建议同时添加 `www.zlqnb.online`，并将其中一个设置为主域名、另一个自动跳转。

## 当前导入规则

上传 Excel 后优先读取 `gmv` 工作表，否则读取第一个工作表。支持字段：主订单编号、商品ID、商品数量、支付完成时间、订单状态、订单应付金额、达人昵称、选购商品。

导入前必须选择京东、抖音或天猫渠道。订单使用“渠道 + 主订单编号”作为唯一键，同一订单号在不同渠道不会互相覆盖。已有生产库升级时，先在 Supabase SQL Editor 执行 `supabase/channel_dimension.sql`，再执行 `supabase/performance.sql`；历史渠道会暂存为 `unknown`，需要人工确认后修正。

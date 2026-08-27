# 雷鸟 CPS 系统开发交接指南

## 1. 交接原则

本仓库是系统唯一代码基线。二次开发人员只能在独立分支开发，不直接修改或强制推送 `main`，也不直接操作生产服务器和生产数据库。

严禁提交以下内容：

- `.env.local`、`.env.production*` 和任何真实密钥
- 京东/B站账号、密码、Cookie、浏览器用户目录或登录状态
- Cloudflare 凭证、数据库备份、生产日志
- 真实订单、达人、团长和店铺经营数据
- `node_modules`、`.next`、Python虚拟环境及临时输出文件

## 2. 系统组成

| 模块 | 位置 | 说明 |
| --- | --- | --- |
| Next.js 主系统 | `app/`、`components/`、`lib/` | 页面、接口、认证、导入、看板与管理功能 |
| PostgreSQL 结构 | `supabase/` | 主业务表、品类、匹配规则与预警结构 |
| B站操盘看板 | `monitor-dashboard/` | FastAPI 服务、独立 schema 与数据分析 |
| 京东采集服务 | `deploy/jd-*.py` | 双店铺浏览器采集、保活和同步控制 |
| 部署配置 | `deploy/` | systemd、Nginx、备份与 Cloudflare 示例 |
| 浏览器自动化 | `scripts/` | B站建联及本地辅助脚本 |

## 3. 获取代码和创建分支

```bash
git clone https://github.com/Kk-bot-zeng/CPS-.git
cd CPS-
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b feature/<英文功能名称>
```

每项独立需求使用一个分支。不得在一个分支中混入无关重构、格式化或依赖升级。

## 4. 本地开发环境

推荐版本：Node.js 22 LTS 或 24、pnpm 10、PostgreSQL 16、Python 3.11+。安装主系统依赖：

```bash
pnpm install --frozen-lockfile
```

复制 `.env.example` 为 `.env.local`，使用本地数据库和开发密钥。`SESSION_SECRET` 应使用至少 32 位随机字符串。

PowerShell 示例：

```powershell
$env:DATABASE_URL="postgresql://cps_dev:本地密码@127.0.0.1:5432/cps_dev"
$env:ADMIN_ACCOUNT="dev_admin"
$env:ADMIN_PASSWORD="仅限本地的强密码"
pnpm db:setup
pnpm admin:create
pnpm dev
```

macOS/Linux 示例：

```bash
export DATABASE_URL='postgresql://cps_dev:本地密码@127.0.0.1:5432/cps_dev'
export ADMIN_ACCOUNT='dev_admin'
export ADMIN_PASSWORD='仅限本地的强密码'
pnpm db:setup
pnpm admin:create
pnpm dev
```

`pnpm db:setup` 只用于空白的本地开发数据库。已有数据库的结构变更必须编写新的增量 SQL，禁止通过修改旧脚本来伪造迁移历史。

## 5. B站看板与京东采集

B站看板：

```bash
python -m venv .venv
pip install -r monitor-dashboard/requirements.txt
cd monitor-dashboard
uvicorn server:app --host 127.0.0.1 --port 8090
```

京东采集：

```bash
pip install -r deploy/requirements.txt
```

京东采集依赖真实平台登录、Chromium 和服务器级配置。未经项目负责人明确授权，不得执行真实同步、发送消息或修改平台数据。开发阶段应使用脱敏样本或模拟接口。

## 6. 数据库变更规范

- 新增变更必须创建独立、可重复执行的 SQL 文件，使用 `if exists`/`if not exists` 等保护。
- 不得删除生产字段、表或历史数据；确有必要时必须提供备份、迁移和回退脚本。
- 渠道与品类必须保持隔离，查询和唯一键需同时考虑 `platform/channel` 与 `product_category`。
- 导入必须保持幂等，避免重复订单，并保留批次、来源和异常统计。
- 修改计划白名单、SKU映射、达人/团长匹配或退款口径时，必须提供正反案例。
- 禁止将生产数据写入测试夹具或提交到 Git。

## 7. 开发规范

- 保持 Next.js、React 和锁文件版本一致；非必要不升级框架。
- UI修改必须检查 1366×768、1920×1080 和常见浏览器缩放比例。
- 列表必须支持合理的分页或虚拟化，避免一次渲染全部数据。
- 大文件解析应保持异步处理和进度反馈，避免阻塞主线程。
- 新接口必须校验登录、输入参数、渠道、品类和数据权限。
- 不得在源码、日志或错误信息中输出密钥、密码和完整 Cookie。
- 涉及真实外部动作时必须保留人工确认或明确的测试开关。

## 8. 提交前验证

至少完成：

```bash
pnpm build
python monitor-dashboard/verify_package.py
git status --short
git diff --check
```

并手工验证：登录、日期筛选、渠道/品类切换、数据导入、看板汇总、达人/团长匹配、导出、分页、预警和受影响的专项模块。

## 9. 提交与交付

```bash
git add <本次修改文件>
git commit -m "feat: 简要描述本次功能"
git push -u origin feature/<英文功能名称>
```

开发方需提交 Pull Request，内容包括：需求理解和实现范围、修改文件和数据库变更、环境变量及依赖变化、测试步骤与结果、已知限制与回退方式，以及涉及 UI 时的页面截图。

最终交付物为 Git 分支/提交，不接受仅提供压缩包或覆盖后的整套目录。

## 10. 项目负责人合并和部署流程

1. 审查代码差异及数据库迁移。
2. 在独立测试环境执行构建和回归测试。
3. 备份生产数据库、环境配置和当前发布版本。
4. 合并通过审核的分支并生成发布提交或标签。
5. 先执行兼容性数据库迁移，再发布应用代码。
6. 验证健康检查、登录、核心看板、导入和同步状态。
7. 异常时回退应用版本；数据库按对应回退方案处理。

## 11. 完成交付标准

- 主系统生产构建通过，无 TypeScript 错误。
- 数据库变更可重复执行且不破坏历史数据。
- 新增配置已写入 `.env.example`，但不包含真实值。
- 新功能在渠道、品类、日期及权限边界下表现正确。
- 原有 TV、显示器、京东、抖音及 B站相关功能无明显回归。
- Git 工作区无遗漏的正式源文件，Pull Request 信息完整。

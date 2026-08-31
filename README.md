# 雷鸟全渠道 CPS 经营管理系统

面向京东、抖音、天猫等渠道的 CPS 经营数据平台，支持 TV、显示器品类以及订单导入、规则匹配、经营总览、达人/团长管理、动销预警、ROI 分析和 B 站操盘看板。

## 技术栈

- Next.js 16、React 19、TypeScript、PostgreSQL
- Python、FastAPI、Selenium、Playwright
- Nginx、systemd、Cloudflare Tunnel

## 快速开始

环境要求：Node.js 22 或 24、pnpm 10、PostgreSQL 16、Python 3.11+。

```bash
git clone https://github.com/Kk-bot-zeng/CPS-.git
cd CPS-
pnpm install --frozen-lockfile
```

复制 `.env.example` 为 `.env.local`，只填写本地开发环境配置。不要使用或提交生产密码、Cookie、Token、数据库备份及真实业务数据。

在终端加载 `DATABASE_URL` 后执行：

```bash
pnpm db:setup
pnpm db:seed-demo
pnpm admin:create
pnpm dev
```

`db:seed-demo` 仅允许写入本机数据库，生成完全脱敏的 TV/显示器、京东/抖音演示数据，便于观察筛选、排行和趋势效果。创建管理员前需临时设置 `ADMIN_ACCOUNT` 和 `ADMIN_PASSWORD`。浏览器访问 `http://localhost:3000`。

如需运行 B 站操盘看板：

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r monitor-dashboard/requirements.txt
cd monitor-dashboard
uvicorn server:app --host 127.0.0.1 --port 8090
```

京东采集服务仅在明确获得测试账号和授权后配置，依赖见 `deploy/requirements.txt`。普通页面和导入功能开发不需要启动真实采集服务。

## 验证命令

```bash
pnpm build
python monitor-dashboard/verify_package.py
```

完整的开发、数据库、分支、交付和验收要求见 [开发交接指南](docs/DEVELOPMENT_HANDOFF.md)。可直接发送给开发方 AI 的任务提示词见 [AI 二次开发提示词](docs/AI_DEVELOPMENT_PROMPT.md)。

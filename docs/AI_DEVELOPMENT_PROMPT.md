# 可直接发送给二次开发人员 AI 的完整提示词

将下面整段内容发送给二次开发人员使用的 AI，并把方括号中的内容替换为本次真实需求。

```text
你现在负责“雷鸟全渠道 CPS 经营管理系统”的二次开发。请从接手仓库、本地搭建、需求分析、代码实施、数据库迁移、测试验证、Git提交到Pull Request交付，全程按以下要求执行。

一、项目和仓库

代码仓库：https://github.com/Kk-bot-zeng/CPS-.git
GitHub仓库所有者：Kk-bot-zeng

你需要先登录自己的GitHub账号并接受仓库协作者邀请。没有接受邀请时，不要尝试绕过权限或使用他人账号。

本次需求：
[填写需要开发的功能、页面、数据来源、计算口径、交互效果和业务规则]

验收标准：
[填写可以客观核验的结果，包括字段、公式、页面位置、筛选条件、样例输入、期望输出和性能要求]

二、接手仓库

1. 检查本机是否已安装Git、Node.js 22 LTS或24、pnpm 10、PostgreSQL 16、Python 3.11及以上。
2. 配置自己的Git身份，不得使用项目负责人的GitHub账号：
   git config --global user.name "你的GitHub用户名"
   git config --global user.email "你的GitHub邮箱"
3. 克隆仓库：
   git clone https://github.com/Kk-bot-zeng/CPS-.git
   cd CPS-
4. 阅读README.md、docs/DEVELOPMENT_HANDOFF.md、docs/AI_DEVELOPMENT_PROMPT.md、.env.example、package.json及涉及模块源码。
5. 更新并检查代码基线：
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   git status
6. 从最新main创建独立分支，不得直接修改main：
   git checkout -b feature/[功能英文短名称]
7. 如发现已有修改，先说明来源并保留，不得执行git reset --hard、git clean -fd或覆盖他人代码。

三、本地开发环境

1. 安装依赖：pnpm install --frozen-lockfile
2. 创建本地PostgreSQL数据库和独立开发账号，不得连接生产数据库。
3. 复制.env.example为.env.local，只填写本地配置；SESSION_SECRET使用至少32位随机字符串。
4. 严禁索取或使用生产数据库密码、生产.env文件、京东/B站真实账号、Cookie、Token、Cloudflare凭证及真实业务数据。
5. 在当前终端加载DATABASE_URL后执行：pnpm db:setup
6. 执行pnpm db:seed-demo，向本机数据库写入完全脱敏的演示数据，用于查看TV/显示器、京东/抖音、达人、型号、排行和日期趋势。不得将演示脚本指向远程或生产数据库。
7. 临时设置ADMIN_ACCOUNT和ADMIN_PASSWORD后执行：pnpm admin:create
8. 启动主系统：pnpm dev
9. 访问http://localhost:3000，确认登录、筛选、看板及演示数据均可见。

如需求涉及B站操盘看板，再执行：
   python -m venv .venv
   激活虚拟环境
   pip install -r monitor-dashboard/requirements.txt
   cd monitor-dashboard
   uvicorn server:app --host 127.0.0.1 --port 8090

如涉及京东采集，仅安装依赖并使用脱敏样本或模拟接口：
   pip install -r deploy/requirements.txt

未经项目负责人单独明确授权，不得执行真实京东同步、登录保活、B站私信或任何外部平台写操作。

四、开发前基线验证

修改代码前执行：
   pnpm build
   python monitor-dashboard/verify_package.py
   git status --short

记录基线结果。若原始版本存在报错，先报告错误、影响和复现步骤，不得把原有问题伪装成本次问题，也不得擅自大范围重构。

五、需求分析要求

写代码前先输出：
1. 对需求的完整理解。
2. 涉及的页面、组件、接口、数据库表和脚本。
3. 数据来源、筛选逻辑、计算公式、时间口径、渠道和品类边界。
4. 实施步骤及预计修改文件。
5. 兼容性、性能、权限、数据安全和历史数据风险。
6. 可操作、可量化的验收清单。
7. 仍需项目负责人提供的数据或业务选择。

涉及业务口径歧义时必须先确认，不得自行猜测；可以通过源码、SQL和测试数据确认的内容，应先自行检查。

六、开发约束

1. 保持现有Next.js 16、React 19、TypeScript、PostgreSQL和Python/FastAPI技术栈，非必要不升级框架和核心依赖。
2. TV与显示器必须隔离；京东、抖音、天猫渠道必须隔离；查询、导入、唯一键及统计均需检查product_category和platform/channel。
3. 不得改变GMV、GSV、销量、退款、计划白名单、SKU映射、达人/团长ID匹配等现有口径，除非需求明确要求并经确认。
4. 数据导入必须幂等，不能重复生成订单；保留导入批次、来源、有效数、跳过数、异常数和错误原因。
5. 数据库变更必须新增独立、可重复执行的增量SQL，不得修改旧迁移伪造历史。
6. 数据库迁移不得删除或覆盖历史数据；如确需调整，必须提供备份、迁移顺序、兼容期和回退方案。
7. 新接口必须验证登录、输入参数、渠道、品类、权限及错误边界，不能把密钥或完整内部错误返回前端。
8. 页面修改必须沿用现有设计语言，并整体检查1366×768、1920×1080、浏览器缩放、内容溢出、加载/空数据/错误状态、筛选、分页、搜索、展开、图表提示和大数据性能。
9. 大文件解析应异步执行并显示进度；列表使用分页、聚合或虚拟化，不能一次加载全部数据。
10. 不得提交.env、日志、数据库备份、真实订单/达人信息、密码、Cookie、Token、浏览器用户目录、node_modules、.next和虚拟环境。
11. 不得删除无关代码、覆盖他人修改，或通过伪造数据和隐藏错误通过测试。
12. 真实发送、真实同步、删除数据、部署或生产写入必须单独获得明确授权。

七、实施过程

1. 先完成最小闭环，再逐步扩展，不改动无关模块。
2. 每完成一个逻辑单元就进行对应验证。
3. 数据库、接口、页面和导出使用统一字段及口径。
4. 新增环境变量时更新.env.example，只提供空值或安全示例。
5. 新增Python依赖时更新requirements.txt；新增Node依赖时更新package.json及pnpm-lock.yaml。
6. 遇到阻塞时报告已确认事实、失败命令、错误信息、尝试方案和所需最小协助，不得长期盲目重试。

八、完成后的测试

至少执行：
   pnpm build
   python monitor-dashboard/verify_package.py
   git diff --check
   git status --short

根据修改范围回归验证：
1. 登录、退出及会话。
2. TV/显示器品类切换。
3. 京东/抖音/天猫渠道切换。
4. 日期、达人/团长、型号等筛选。
5. 导入、解析、匹配、排退、去重和异常提示。
6. 经营总览、达人工作台、动销预警、ROI、地图及B站看板中的受影响功能。
7. 导出结果与页面筛选及数据库结果一致。
8. 分页、搜索、展开、图表提示和空数据状态。
9. 常见分辨率、刷新、重复点击和大数据量下无明显卡顿。
10. 原有功能无明显回归。

某项测试因缺少授权或外部账号无法执行时，必须标记为“未验证”，说明原因及上线前验证步骤，不得写成已通过。

九、Git提交和Pull Request

1. 提交前检查git status、git diff和git diff --check，确保没有临时文件及敏感信息。
2. 只暂存本次需求文件，不要不经检查全量提交。
3. 使用清晰提交信息，例如feat: add xxx或fix: correct xxx。
4. 推送自己的分支：git push -u origin feature/[功能英文短名称]
5. 在GitHub创建以main为目标的Pull Request，但不要自行合并。
6. Pull Request必须包含需求背景、实现范围、修改文件、数据库迁移与回退、环境变量和依赖变化、测试结果、截图、未验证项、已知风险及部署注意事项。
7. 不得强制推送或删除main，不得修改生产服务器和生产数据库。
8. main已启用保护规则，必须由项目负责人Kk-bot-zeng审核批准后才能合并；不得绕过保护规则。

十、最终交付

最终提供：
1. feature分支名称。
2. 最新提交哈希。
3. Pull Request地址。
4. 修改摘要和文件清单。
5. 数据库迁移顺序及回退方案。
6. 环境变量及依赖变化。
7. 自动测试与手工测试结果。
8. UI改动前后截图。
9. 未验证项、已知风险和上线后观察项。
10. 生产部署建议，但不要执行部署。

完成交付后停止操作并等待项目负责人审核。未经确认，不要合并Pull Request、部署服务器、执行生产SQL或触发真实外部操作。
```

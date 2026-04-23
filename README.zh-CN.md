# Risk Atlas

English version: [README.md](README.md) | 香港繁体版：[README.zh-HK.md](README.zh-HK.md)

Risk Atlas 是一个面向港股和加密市场的市场结构研究产品。它把日频价格数据构建成离线关系矩阵，再围绕这些工件提供快照、快照序列、结构漂移对比、关系核查、溢出分析和隐藏分组等研究工作流。

当前公开 UI 里的品牌文案仍然是 “Risk Atlas HK”，但实际产品能力已经覆盖港股和加密市场。

## 线上示例

你可以直接访问线上部署示例：<https://risk-atlas.org>

- 这是当前已经部署并实际运行的版本，也是最快看到真实界面的方式。
- 如果你想先看成品，再决定是否本地启动或部署到自己的服务器，这个站点是最直接的参考入口。
- 仓库代码可能会继续向前演进，但这个网址仍然是当前最直观的在线示例。

## 运行截图

### 首页

![Risk Atlas 首页](imgs/home_page.png)

### 快照详情页

![Risk Atlas 快照详情页](imgs/snapshot_detail_page.png)

## 这个产品适合谁

- 想看“市场结构”和“联动关系”，而不只是看单只价格曲线的研究用户。
- 想比较分散度、拥挤度、漂移和隐藏分组变化的团队或个人。
- 想参考一套“离线构建 artifact + 在线读取”的真实落地方案的开发者。

## 当前用户已经可以做什么

- 浏览港股和加密市场的已保存快照。
- 打开由 `matrix.bsm`、`preview.json` 和 `manifest.json` 支撑的快照详情页。
- 在不同日期、不同窗口、不同 Universe 之间做快照对比。
- 查看关系结构、pair drift、spillover 和 grouped structure 相关读取结果。
- 通过邀请码控制 build / build series / analysis run 的创建与排队，同时保持只读路径开放。
- 在本地文件系统和 S3 两种 artifact 后端之间切换。

## 最新验证状态

以下状态已在 2026-04-23 本地验证通过：

- `pnpm bootstrap:local` 全流程成功，退出码为 0。
- bootstrap 复用了仓库里的 `data/real-hk` 和 `data/crypto` 基线数据，并将两个市场都 overlap-refresh 到 2026-04-23。
- 默认的 8 个全市场快照全部成功完成，窗口均为 `252`，覆盖港股 4 个 score method 和加密 4 个 score method。
- 港股最新快照共解析 2471 个 symbol。
- 加密最新快照共解析 654 个 symbol。
- 港股目录当前共有 1,408,608 行 EOD 数据；加密目录当前共有 248,371 行 EOD 数据。
- 首轮 build_run 已经开始稳定写入 `sourceDatasetMaxTradeDate`、`symbolSetHash` 和 `symbolStateHashesJson`。
- 手工对最新港股 `pearson_corr` 同配置重跑后，成功复用了 2471 行 parent prefix，并以 `buildStrategy=incremental` 完成。

## 当前默认数据面

- 港股主数据集：`hk_eod_yahoo_real_v1`。
- 港股默认全市场 Universe：`hk_all_common_equity`。
- 加密主数据集：`crypto_market_map_yahoo_v2`。
- 加密默认全市场 Universe：`crypto_market_map_all`。
- 额外的加密 Universe 包括市值分层 Universe 和流动性驱动 Universe，例如 `crypto_top_50_liquid`、`crypto_top_100_liquid`、`crypto_top_200_liquid`。
- 默认 bootstrap 会产出 8 个最新全市场快照：港股 4 个 score method，加密 4 个 score method，全部使用 `windowDays=252`。

## 构建面与产品工作流

### 支持的构建输入

- 市场：HK、CRYPTO。
- Score methods：`pearson_corr`、`ewma_corr`、`tail_dep_05`、`nmi_hist_10`。
- 窗口：`60`、`120`、`252`。
- Build Series 频率：`daily`、`weekly`、`monthly`。
- Artifact backend：`local_fs`、`s3`。
- 当前单次构建上限：4000 个 resolved symbols。

### 主要工作流

- Snapshot 列表与详情页。
- Snapshot series 调度与历史回放。
- Compare Builds：按时间、窗口、Universe 对比。
- 关系查询与 pair 级别核查。
- 从单个 anchor symbol 向外看的 spillover 分析。
- 隐藏分组和 clustered structure 视图。

### 访问模型

- 创建 build run 需要邀请码。
- 创建 build series 需要邀请码。
- 排队新的 analysis run 需要邀请码。
- 已有 build、analysis run、compare 结果和只读查询接口对外开放。

## 系统工作方式

1. 将 EOD 数据导入 PostgreSQL，并更新 dataset 元信息。
2. 按请求的日期和窗口解析 Universe。
3. 准备收益率输入，并交给 C++ 矩阵构建器。
4. 持久化标准 artifact bundle：`matrix.bsm`、`preview.json`、`manifest.json`。
5. API 和前端基于数据库元数据与 artifact 查询结果提供读取能力。

## Artifact bundle 是什么

- `matrix.bsm` 是矩阵类读取的数值真源。
- `preview.json` 保存 symbol 顺序、top pairs 和轻量摘要字段，便于前端快速读取。
- `manifest.json` 保存 bundle 元数据、字节大小、边界值和 preview 格式信息。

当前 C++ incremental builder 同时支持两种增量能力：

- 同一个 build-run 中断后的断点续跑。
- 跨 build-run 的 parent prefix 复用。

只要 symbol 顺序和逐 symbol 状态哈希仍然匹配，新的构建就可以直接复用父构建的前缀矩阵，而不是从头完整重算。

## 本地启动

### 前置要求

- Node.js 20+。
- pnpm 10+。
- Docker 与 Compose。
- CMake 3.20+。
- 支持 C++20 的编译器。

### 从空仓库到本地运行的最快路径

```bash
git clone <your-repo-url>
cd risk-atlas
cp .env.example .env
pnpm quickstart
```

`pnpm quickstart` 会自动完成：

- 安装 monorepo 依赖。
- 将根目录 `.env` 同步到 `apps/api/.env` 与 `apps/web/.env`。
- 通过 Docker Compose 启动 PostgreSQL。
- 配置并编译 C++ 目标。
- 执行 Prisma generate 和 migrations。
- 运行市场状态 bootstrap。
- 启动 API 与 Web 开发服务器。

默认本地地址：

- Web: http://localhost:5173。
- API: http://localhost:3000。
- Swagger UI: http://localhost:3000/docs。

如果你想把初始化和日常开发启动拆开执行：

```bash
pnpm bootstrap:local
pnpm dev:stack
```

## Bootstrap 默认会产出什么

`pnpm bootstrap:local` 现在默认走 `RISK_ATLAS_BOOTSTRAP_MARKET_STATE=1` 的市场状态 bootstrap 路径。

这条路径会：

- 优先复用仓库中已经存在的 `data/real-hk` 与 `data/crypto` 基线数据。
- 仅在必要时补齐港股 prerequisite。
- 对港股和加密都执行 overlap refresh，而不是每次从零重建。
- 按 `windowDays=252` 构建或复用最新 8 个全市场快照。
- 让你在 bootstrap 结束后就拥有可直接查询的最新 artifact bundle。

同一套刷新逻辑也用于每日任务：

```bash
pnpm --dir apps/api db:refresh-daily-market-state
```

AWS 部署文档里已经包含每 24 小时执行一次的 systemd timer 配置。

## 常用命令

```bash
pnpm env:sync
pnpm bootstrap:local
pnpm dev:stack
pnpm real-hk:refresh
pnpm real-hk:taxonomy
pnpm crypto:market-map:import
pnpm crypto:coinbase:import
pnpm --dir apps/api db:refresh-daily-market-state
```

命令说明：

- `pnpm env:sync`：将根目录 env 配置同步到前后端应用目录。
- `pnpm bootstrap:local`：准备本地数据库、数据集、artifact 和默认快照。
- `pnpm dev:stack`：启动本地 API 与 Web 开发服务。
- `pnpm real-hk:refresh`：刷新真实港股数据与 coverage 审计报告。
- `pnpm real-hk:taxonomy`：仅刷新港股 taxonomy 覆盖。
- `pnpm crypto:market-map:import`：导入更大的加密 market-map 数据集。
- `pnpm crypto:coinbase:import`：导入较小的 Coinbase POC 加密数据集。
- `pnpm --dir apps/api db:refresh-daily-market-state`：手工执行每日刷新任务。

## 关键配置项

在 bootstrap 或部署之前，先编辑根目录 `.env`。最关键的变量包括：

- `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_HOST`、`POSTGRES_PORT`。
- `API_PORT`、`WEB_PORT`。
- `VITE_API_BASE_URL`、`CORS_ALLOWED_ORIGINS`。
- `ARTIFACT_STORAGE_BACKEND`、`ARTIFACT_ROOT_DIR`、`ARTIFACT_CACHE_DIR`。
- `AWS_REGION`、`S3_ARTIFACT_BUCKET`、`S3_ARTIFACT_PREFIX`、`S3_SIGNED_URL_TTL_SECONDS`。
- `RISK_ATLAS_INVITE_CODES`、`RISK_ATLAS_INVITE_SALT`。
- `RISK_ATLAS_BOOTSTRAP_MARKET_STATE`。
- `RISK_ATLAS_BOOTSTRAP_REAL_HK`。

Artifact backend 行为：

- `local_fs`：artifact bundle 保存在本地目录。
- `s3`：artifact 上传到 S3，同时保留本地 matrix 缓存以兼容现有 C++ 查询链路。

修改根目录 env 之后，执行：

```bash
pnpm env:sync
```

## 数据管线

### 港股真实市场管线

- 仓库里已经有 `data/real-hk` 基线时会优先直接复用。
- 可通过 `pnpm real-hk:refresh` 从上游刷新数据并重写 benchmark 报告。
- 会维护 `security_master` 中的 taxonomy overlay，以支持 sector-aware 读取。

### 加密 market-map 管线

- 先用 CoinGecko market metadata 做候选排序。
- 再用 Yahoo chart history 批量拉取实际日频价格。
- 默认以 best-effort 模式运行，只要幸存资产数高于最小门槛就继续构建。
- 输出 CSV、symbols 与 taxonomy 文件到 `data/crypto`。

较大的 market-map 导入器会创建：

- dataset：`crypto_market_map_yahoo_v2`。
- static universes：`crypto_market_map_all`、`crypto_market_cap_50`、`crypto_market_cap_100`、`crypto_market_cap_200`。
- dynamic universes：如 `crypto_top_50_liquid`、`crypto_top_100_liquid`、`crypto_top_200_liquid` 及已填充的 sector basket。

## AWS 部署

当前推荐的生产形态是：

- 一台 Ubuntu EC2。
- 主机层 Nginx 暴露 80 / 443。
- Docker Compose 运行 API 与 PostgreSQL。
- 一个对外域名，走 same-origin 路由。
- 可选的 S3 artifact 存储与本地 matrix 缓存。
- 每 24 小时自动刷新的 systemd timer。

完整的生产部署说明、环境变量模板、Compose 文件、Nginx 配置和 S3 说明见 [aws/README.zh-CN.md](aws/README.zh-CN.md)。

## 研究边界

Risk Atlas 是研究辅助工具，不是直接的交易建议系统。

- 它描述的是联动和结构，不是因果解释。
- 它可以暴露集中度、漂移、spillover 和 clustering，但不保证这些关系持续存在。
- 它是基于 EOD 和离线 artifact 的研究系统，不是实时风控或执行引擎。
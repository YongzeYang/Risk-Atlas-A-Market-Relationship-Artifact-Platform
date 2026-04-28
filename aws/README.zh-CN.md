# AWS 上的 Risk Atlas

English version: [README.md](README.md) | 香港繁体版：[README.zh-HK.md](README.zh-HK.md)

这个目录包含面向单机 AWS 部署形态的生产资产：

- 一台 Ubuntu EC2 实例
- 主机层 Nginx，负责 80 和 443
- 使用 Docker Compose 运行 API 与 PostgreSQL
- 单域名 same-origin 路由
- Amazon S3 作为推荐的低成本 build artifact 真源
- EC2 本地保留一个 `matrix.bsm` 缓存目录，以兼容当前仍需文件路径的 C++ 查询链路

API 现在同时支持 `local_fs` 与 `s3` 两种 artifact storage backend。当前推荐的低预算生产形态是：持久化 artifact 放到 S3，本地只保留一个较小的 matrix cache。

## 部署生命周期总览

1. 首次主机 bootstrap：在全新的 Ubuntu EC2 主机上，先运行 `sudo DEPLOY_USER=ubuntu bash aws/scripts/bootstrap-ec2.sh`，安装 Docker、Nginx、Certbot、AWS CLI、Node.js 20、pnpm 和原生构建依赖。
2. 首次部署与初始化市场 bootstrap：把 `aws/.env.production.example` 复制为 `aws/.env.production`。如果希望服务器首次部署时复用仓库基线、刷新港股和加密市场，并直接产出最新 8 个默认全市场快照，就把 `RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY=1` 打开，然后运行 `bash aws/scripts/deploy-ec2.sh`。
3. 日常数据刷新：保持 `INSTALL_DAILY_MARKET_REFRESH_TIMER=1`，让内置的 24 小时 systemd timer 自动执行；如果你想立刻刷新一次，也可以手动运行 `bash aws/scripts/run-daily-market-refresh.sh`。
4. 日常维护：对已检出的 `main` 分支做 fast-forward 更新，重新运行 `bash aws/scripts/deploy-ec2.sh`，检查 Docker、Nginx 与每日 timer 状态，备份 PostgreSQL，并在磁盘压力增大时清理旧 artifact 或 cache 文件。

下面的章节会把这几个阶段展开说明。

## 1. 该买什么，以及为什么

### EC2

使用 x86_64 的 Ubuntu LTS 实例。这个项目会在镜像构建期间编译 C++ 二进制，因此最稳妥的目标仍然是：

- AMI：Ubuntu Server 24.04 LTS x86_64
- 实例族：突发型通用实例就足够个人项目使用
- 最低预算、以读取为主的规格：`t3.small`，前提是你主要浏览已有 artifact，且不会频繁在服务器上跑全市场构建
- 更平衡的单机部署起点：`t3.large`
- 如果你预期会重复跑较大的 HK 构建，或有多会话并发：`t3.xlarge`

为什么更便宜的规格只是“有条件可用”：

- 这个仓库当前会把 API、PostgreSQL、构建编排和 C++ matrix 工具全部放在同一台主机上
- 小型突发实例可以作为个人演示或轻读取流量的目标，但并不适合频繁生成大规模 HK 构建
- 如果你想把预算压到最低，最好尽量在本地预构建 artifact，让云端主机主要承担服务和轻量队列工作

为什么不优先 arm64：

- 你的本地工具链和仓库中的大多数 Docker 例子都默认更常见的 x86_64 路径
- 在 x86_64 上遇到 C++ 与原生依赖兼容问题的概率更低
- 当你镜像本仓库最常见的 Linux 目标时，故障排查会更直接

### EBS

如果你计划在本地长期保存 artifact，就不要用默认的很小系统盘。

推荐的 gp3 容量：

- 最低可用：80 GB
- 更稳妥的个人项目容量：120 GB
- 如果你预计会有很多 build series 且清理不及时：150 GB 到 200 GB

如果 S3 是 artifact 主存储，而 EC2 只保留一个临时 cache，可以缩小：

- 极限低预算系统盘：30 GB 到 40 GB
- 更稳妥的低预算系统盘：50 GB 到 60 GB

原因：

- PostgreSQL 数据在这个首版部署中仍然保存在本地
- 在线查询仍然需要本地磁盘上的 build artifact 或 cache
- Docker 镜像层、pnpm cache 和仓库本身也会占空间

### S3

为 build artifact 创建一个 bucket。

推荐设置：

- Bucket type：general purpose bucket
- Storage class：先用 Standard；如果你更希望自动控费，也可以直接用 Intelligent-Tiering
- Versioning：可选；如果你想提高恢复安全性就打开，如果你只想压低账单并简化 lifecycle 行为就保持关闭
- Block all public access：开启
- Bucket policy：除非你有非常明确的共享需求，否则不需要

这个仓库现在已经支持 S3-primary build artifact。只要把 `ARTIFACT_STORAGE_BACKEND=s3`，并填写 `AWS_REGION`、`S3_ARTIFACT_BUCKET`，以及可选的 `S3_ARTIFACT_PREFIX` 即可。

如果你希望 S3 成为 artifact 的 source of truth，不要把它理解成一个“只改配置”的动作。当前代码在若干运行路径里仍然假定本地文件存在。

当前低成本、可落地的目标形态是：

- S3 作为 build-run bundle 的 source of truth
- EC2 上保留一个较小的本地 cache 目录，用于存放 C++ 工具仍需查询的 `matrix.bsm`
- 下载接口通过 presigned URL 直接让浏览器从 S3 拉取

这种模式可以显著降低 EBS 压力，同时不要求你立刻重写 C++ 查询层。

## 1A. Free-tier-first 的现实检查

如果你想把账单压到最低，不要按“永久免费”来设计，而要按“尽可能低支出”来设计。

当前 AWS 计费现实要点：

- 按当前 AWS Free Tier 页面公开的信息，新账户拿到的是额度型 credits，而不是永久免费的生产环境
- 当前公开页面描述的是最多 200 USD 的新用户 credits，并带有免费计划期和过期窗口
- 当前 EC2 定价页也说明 public IPv4 和 Elastic IP 不是永久免费的，不要假设公网 IP 可以长期零成本
- 当前 EC2 定价页也说明了每月 100 GB 的对外免费流量额度，这对小型个人项目有帮助，但不能当作无限流量

对个人项目最重要的控费规则是：

1. 只用一台 EC2
2. 除非你有明确理由，否则不要引入 ALB、NAT gateway、RDS 或 CloudFront
3. 如果外部域名注册商更便宜，就不要执着于在 AWS 买域名
4. 只保留一个私有 S3 bucket
5. 除非你确实需要回滚安全性，否则不要默认打开 S3 versioning
6. 第一天就加上 billing alarm
7. 要积极清理或归档旧 artifact

## 1B. 当前实现里，S3-primary 支持到底意味着什么

当前实现支持下面这套运行模型：

1. 构建先在本地临时工作目录内完成
2. 构建成功后，把 `matrix.bsm`、`preview.json` 和 `manifest.json` 上传到 S3
3. 数据库 artifact 记录会写成 `storageKind=s3`，同时填充 `storageBucket` 和 `storagePrefix`
4. build detail 页面会直接从 S3 读取 `preview.json`
5. 当 artifact 位于 S3 时，`/build-runs/:id/download` 会重定向到 presigned S3 URL
6. 在 compare、exposure、pair-divergence、structure 或 matrix 查询流程真正通过 C++ 二进制读取时，`matrix.bsm` 会按需下载到本地 cache 目录
7. analysis-run 记录目前仍然保存在本地文件系统

这让你在不重写 C++ 查询层的前提下，拿到 S3-primary 存储的大部分 EBS 节省效果。

### 推荐的低成本实现形态

先使用这套模式：

- build bundle 在本地临时工作目录中创建
- build 成功后，把三个文件都上传到 S3
- 数据库 artifact 记录标记为 `s3`，并写入 `storageBucket` 和 `storagePrefix`
- `preview` 与 `manifest` 直接从 S3 读取
- 只有在 compare、exposure、pair-divergence、structure 或 download 真正需要时，才把 `matrix.bsm` 从 S3 惰性下载到本地 cache
- cache 使用 LRU 或基于年龄的清理策略，让 EC2 磁盘保持较小

这比把所有 build 永久放在 EBS 上便宜得多，同时仍然符合当前 C++ 查询设计。

### 最低成本下可接受的 storage class 策略

对于运行期经常访问的 artifact，先全部放在 S3 Standard。

原因：

- 行为最简单
- 没有恢复延迟
- 不会引入冷存储层的最短存储时长与提取模式复杂度

只有在系统稳定后，再考虑 lifecycle 规则，例如：

- 近期活跃 build bundle 保持在 Standard
- 很少再查询的旧 bundle 迁移到更冷的层级
- 或者直接删除旧 bundle，只保留你真正需要导出的结果

不要把仍在运行路径上的 matrix 文件放入 Glacier 类别，除非你愿意接受 restore latency 和更复杂的查询流程。

## 2. 生产架构

```text
Browser
  -> https://your-domain
  -> Nginx on EC2 :443
     -> /                static frontend from /var/www/risk-atlas
     -> /datasets        proxy to API container on 127.0.0.1:3000
     -> /build-runs      proxy to API container on 127.0.0.1:3000
     -> /analysis-runs   proxy to API container on 127.0.0.1:3000
     -> /docs            proxy to API container on 127.0.0.1:3000
     -> /health          proxy to API container on 127.0.0.1:3000

API container
  -> local artifact directory mounted from /var/lib/risk-atlas/artifacts
  -> PostgreSQL container on the same Docker network
  -> compiled BSM writer and query binaries inside the image

S3 bucket
  -> stores build artifacts as the source of truth when ARTIFACT_STORAGE_BACKEND=s3
```

另一种 S3-primary 形态：

```text
Browser
  -> Nginx on EC2
     -> static frontend
     -> API container

API container
  -> S3 for preview.json, manifest.json, matrix.bsm as the source of truth
  -> local cache directory for on-demand matrix.bsm downloads before C++ queries
  -> PostgreSQL container on the same host
```

EC2 主机上的目录布局：

```text
/opt/risk-atlas/app              git clone of this repository
/var/www/risk-atlas              built frontend files served by Nginx
/var/lib/risk-atlas/postgres     PostgreSQL data directory
/var/lib/risk-atlas/artifacts    build-runs and analysis-runs
/var/www/certbot                 ACME challenge directory for Let's Encrypt
```

## 3. 登录服务器之前，需要先创建的 AWS 资源

### Security group

为 EC2 实例创建一个 security group。

Inbound rules：

- TCP 22：只允许你的固定 IP
- TCP 80：`0.0.0.0/0`
- TCP 443：`0.0.0.0/0`

不要把 PostgreSQL 对公网开放。

Outbound rules：

- 对个人项目来说，默认 allow all 就够用

### Elastic IP

分配一个 Elastic IP，并把它绑定到实例。

原因：

- 你的 DNS A 记录应该指向一个稳定的公网 IPv4
- 实例重启后不需要重新改 DNS

### 用于访问 S3 artifact 的 IAM role

给 EC2 实例挂一个最小权限的 instance role，用于运行时读取和写入 S3 artifact。

示例 policy：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

如果你不想给删除权限，就移除 `s3:DeleteObject`，并在环境变量里保持 `S3_SYNC_DELETE=0`。

## 4. 域名购买与 DNS

对于一个轻量的个人项目，可以直接使用你已经熟悉、流程简单的域名注册商。

常见低摩擦选择：

- Cloudflare Registrar
- Porkbun
- Namecheap

推荐 DNS 记录：

- A record：`@` -> 你的 Elastic IP
- A record：`www` -> 你的 Elastic IP，或者后续把 `www` 重定向到 apex domain

只有在你明确配置了实例 IPv6 和 security group IPv6 规则时，才需要 AAAA 记录。

## 5. 启动 EC2 实例

推荐的 launch 选择：

- OS：Ubuntu Server 24.04 LTS x86_64
- 最低预算规格：`t3.small`，只适用于读取为主或轻量使用场景
- 更现实的一体机规格：`t3.large`
- Root disk：gp3 120 GB
- Auto-assign public IP：yes，之后再替换成 Elastic IP
- IAM role：现在就挂上前面提到的 S3 artifact role
- Security group：使用前文描述的那个

如果你采用的是 S3-primary artifact 存储并带本地 matrix cache，就可以把 root disk 推荐值下调到 30 GB 到 60 GB，具体取决于你清理 cache 的积极程度。

实例可连通后：

```bash
ssh ubuntu@YOUR_ELASTIC_IP
```

## 6. 在全新 EC2 主机上的首次 bootstrap

这个仓库已经在当前目录里提供了 bootstrap 脚本。

在服务器上执行：

```bash
sudo mkdir -p /opt/risk-atlas
sudo chown ubuntu:ubuntu /opt/risk-atlas
cd /opt/risk-atlas
git clone --recursive https://github.com/YongzeYang/Risk-Atlas-A-Market-Relationship-Artifact-Platform app
cd app
sudo DEPLOY_USER=ubuntu bash aws/scripts/bootstrap-ec2.sh
```

bootstrap 脚本会安装：

- Docker Engine
- Docker Compose 支持；如果主机上已经装了 Docker，脚本会先尝试补上 Compose，而不是立刻替换已有引擎
- Nginx
- Certbot 与 Nginx Certbot 插件
- AWS CLI v2；优先使用 Ubuntu 包，失败时回退到官方安装器
- Node.js 20
- 通过 Corepack 安装 pnpm
- CMake、build-essential、git、rsync、jq、gettext-base

bootstrap 结束后，立刻验证主机：

```bash
docker --version
docker compose version || docker-compose version
certbot --version
aws --version
pnpm --version
```

如果 bootstrap 卡在 Docker service 启动阶段，不要立刻重跑整个流程，而是先直接看服务状态：

```bash
sudo systemctl status docker --no-pager
sudo journalctl -u docker -n 50 --no-pager
```

如果日志里出现 `failed to load listeners: no sockets found via socket activation`，说明主机处于损坏的 Docker service/socket 状态。更新后的 bootstrap 脚本会在重启 `docker.service` 之前重置失败状态，并先拉起 `docker.socket`。

对于已经预装 Ubuntu Docker 包的主机，当前预期路径是：

- 如果已有 Docker engine 健康，就直接保留
- 单独安装 Docker Compose 支持
- 如果 Docker daemon 不处于 active 状态，bootstrap 立即失败，不再继续后面的步骤

bootstrap 完成后，退出 SSH 一次再重新登录，让当前用户拿到 Docker group membership。

注意：

如果仓库已经存在于服务器上，而你是在更新部署脚本，不要停在 `git fetch`。

`git fetch` 只会更新 remote refs，不会更新 `/opt/risk-atlas/app` 里当前检出的文件。

应当使用：

```bash
cd /opt/risk-atlas/app
git pull --ff-only origin main
git submodule update --init --recursive
```

这意味着：

- `git pull --ff-only origin main` 只会在服务器当前分支可以无合并地直接前进到远端提交时更新到最新 `main`
- 这对生产主机来说是最安全的更新行为，因为它不会用自动 merge 掩盖本地分叉
- 如果命令成功，那么 `/opt/risk-atlas/app` 里的文件才真正与远端 `main` 一致

如果失败了，应该怎么做：

- 先运行 `git status`
- 如果你预期的只是像 `aws/.env.production` 这样的忽略型 secret 文件，保持它们不动即可；被 ignore 的文件不会阻止 fast-forward pull
- 如果你看到服务器上有 tracked file 被修改，就要先决定这些修改是应该提交、另存，还是丢弃，然后再 pull
- 如果服务器上有不在 `origin/main` 上的本地 commit，先用 `git log --oneline --decorate --graph --max-count=10` 看清楚，再决定 rebase、reset，还是保留

如果 `git pull` 因本地 tracked file 改动而拒绝执行，请先用 `git status` 检查。生产 secrets 文件 `aws/.env.production` 已经被 ignore，不应该阻碍 fast-forward pull。

## 7. 配置生产环境文件

先复制示例文件：

```bash
cd /opt/risk-atlas/app
cp aws/.env.production.example aws/.env.production
```

然后认真编辑它。

最重要的字段：

- `DOMAIN_NAME`：你的最终公网域名
- `DOMAIN_SERVER_NAMES`：传给 Nginx `server_name` 的空格分隔域名；如果没有别名，保持与 `DOMAIN_NAME` 一致即可
- `LETSENCRYPT_EMAIL`：用于 Let's Encrypt 通知的邮箱
- `WEB_ROOT_DIR`：Nginx 提供静态文件的主机目录
- `POSTGRES_DATA_DIR`：持久化 PostgreSQL 数据的主机目录
- `ARTIFACT_ROOT_DIR`：临时 build bundle 和 analysis-run 记录所在的主机目录
- `ARTIFACT_CACHE_DIR`：启用 S3 存储时，本地 `matrix.bsm` cache 文件所在目录
- `ARTIFACT_STORAGE_BACKEND`：低预算部署建议设为 `s3`
- `DATABASE_URL`：API container 使用的数据库连接串
- `CORS_ALLOWED_ORIGINS`：应设为 `https://your-domain`
- `VITE_API_BASE_URL`：same-origin 部署时保持空字符串
- `RISK_ATLAS_INVITE_CODES` 和 `RISK_ATLAS_INVITE_SALT`：替换掉示例默认值
- `S3_ARTIFACT_BUCKET` 和 `AWS_REGION`：启用 S3 artifact storage 的必填项
- `S3_ARTIFACT_PREFIX`：可选前缀，例如 `prod`
- `S3_SIGNED_URL_TTL_SECONDS`：构建下载 presigned URL 的有效期
- `RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY`：如果你希望首次部署时复用仓库基线、把两个市场刷新到最新 overlap window，并自动构建最新 8 个全市场快照，就设为 `1`
- `INSTALL_DAILY_MARKET_REFRESH_TIMER`：如果你希望部署后主机安装拆分后的港股 / crypto 24 小时定时器，就设为 `1`
- `RISK_ATLAS_DAILY_REFRESH_RUN_HK` 与 `RISK_ATLAS_DAILY_REFRESH_RUN_CRYPTO`：允许你在保持 24 小时 timer 开启的同时，单独关闭某一侧市场
- `RISK_ATLAS_DAILY_REFRESH_CONTINUE_ON_MARKET_FAILURE`：设为 `1` 时，如果单个市场刷新失败，会自动降级成 warning，让另一侧市场继续完成
- `DAILY_REFRESH_API_CPUS`、`DAILY_REFRESH_API_MEMORY`、`DAILY_REFRESH_API_MEMORY_SWAP` 与 `DAILY_REFRESH_API_PIDS_LIMIT`：daily refresh 开始前施加到运行中 API container 的护栏，避免很小的主机把 CPU、内存和 PID 全吃满
- `RISK_ATLAS_DAILY_REFRESH_CRYPTO_*`：daily-only 的 crypto 刷新调优参数，用来单独控制目标资产数、候选页数、Yahoo 批大小、并发和请求间隔

在这个部署模型里，`VITE_API_BASE_URL` 保持为空。

原因：

- 前端会在同源下直接请求 `/datasets`、`/build-runs`、`/analysis-runs`、`/docs` 和 `/health`
- Nginx 会把这些路径代理到 API container
- 这样可以避免再开一个 API 子域名，也避免额外的 CORS 复杂度

## 8. 首次部署与初始化市场 bootstrap

运行仓库提供的部署脚本：

```bash
cd /opt/risk-atlas/app
bash aws/scripts/deploy-ec2.sh
```

如果你的服务器只有独立的 `docker-compose` 二进制，deploy 脚本现在会自动回退到它。

deploy 脚本会执行：

1. 加载 `aws/.env.production`
2. 更新 git submodule checkout
3. 用 pnpm 安装工作区依赖
4. 使用生产 Vite 变量构建前端
5. 把前端 `dist` 文件发布到 `WEB_ROOT_DIR`
6. 构建生产 API Docker 镜像
7. 用 Docker Compose 拉起 PostgreSQL
8. 在 API 镜像内执行 `prisma migrate deploy`
9. 按配置选择一个首次部署数据辅助流程：
   - `RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY=1`：复用 `data/` 下的仓库基线，把两个市场刷新到最新 overlap window，并总共运行或复用 8 个 snapshot build：港股 4 个 score method，加密 4 个 score method
   - 否则，如果 `RUN_SEED_ON_DEPLOY=1`，则只执行港股 seed 路径
10. 根据 `ARTIFACT_STORAGE_BACKEND`，以 `local_fs` 或 `s3` 模式启动或更新 API container
11. 从 `aws/nginx` 里的模板渲染 Nginx 站点配置
12. reload Nginx
13. 如果 `SYNC_ARTIFACTS_ON_DEPLOY=1`，可选执行一次 S3 artifact sync

### Seed 行为

如果这是第一次部署，而你只想自动执行港股 seed 路径，设置：

```dotenv
RUN_SEED_ON_DEPLOY=1
```

然后运行一次 deploy 脚本。

首次 seed 成功后，除非你明确想再次重跑，否则把它改回 `0`。

### 初始市场 bootstrap 行为

如果你希望服务器在首次部署时自动初始化两个市场，并直接产出全部 8 个单日期快照，设置：

```dotenv
RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY=1
RUN_SEED_ON_DEPLOY=0
```

这个 helper 按以下顺序执行：

1. 只有在 HK dataset 或 `hk_all_common_equity` universe 仍缺失时，才通过 `prisma/seed.ts` 补齐港股 seed prerequisite
2. 通过 `prisma/real-hk-benchmark.ts --skip-benchmarks` 和 merge 语义，从仓库基线加最新 overlap window 刷新港股数据集
3. 通过 `prisma/import-crypto-market-map.ts` 和 merge 语义，从仓库基线加最新 overlap window 刷新加密 market-map 数据集
4. 顺序执行或复用 8 个 `windowDays=252` 的 snapshot build：
   - Hong Kong market：`pearson_corr`、`ewma_corr`、`tail_dep_05`、`nmi_hist_10`
   - Crypto market：`pearson_corr`、`ewma_corr`、`tail_dep_05`、`nmi_hist_10`

这个 snapshot helper 使用的 dataset / universe 组合是：

- HK：优先使用 `hk_eod_yahoo_real_v1`，否则回退到 `hk_eod_demo_v1`；universe 使用 `hk_all_common_equity`
- Crypto：dataset 使用 `crypto_market_map_yahoo_v2`；universe 使用 `crypto_market_map_all`

如果你更希望手动执行这个 helper，而不是通过 deploy 脚本触发：

```bash
cd /opt/risk-atlas/app
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production run --rm --no-deps api \
  node --import tsx prisma/bootstrap-initial-market-state.ts
```

这与本地 `pnpm bootstrap:local` 当前默认走的 bootstrap 流程是同一套逻辑。

### 每 24 小时的循环市场刷新

如果你希望服务器在首次部署后每 24 小时都自动保持两个市场最新，在运行 deploy 脚本前，在 `aws/.env.production` 中设置：

```dotenv
INSTALL_DAILY_MARKET_REFRESH_TIMER=1
DAILY_REFRESH_API_CPUS=1.0
DAILY_REFRESH_API_MEMORY=1200m
DAILY_REFRESH_API_MEMORY_SWAP=1200m
DAILY_REFRESH_API_PIDS_LIMIT=256
RISK_ATLAS_DAILY_REFRESH_CONTINUE_ON_MARKET_FAILURE=1
RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS=0
```

对于 `t3.small` 这类很小的实例，建议保持 `RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS=0`，除非你明确希望 daily job 同时重建市场快照。

现在安装的 systemd service 会在刷新失败后 30 分钟重试一次；如果 6 小时内已经连续失败 2 次，就先停止抖动，等下一次正常 timer 周期再继续。

此外，刷新脚本会在任务开始前把上面的 API container 护栏应用上去，避免 refresh 在很小的实例上独占整台机器。

deploy 脚本现在安装的是两个错峰 timer，而不是一个 combined timer：

1. `aws/systemd/risk-atlas-hk-daily-market-refresh.timer` 先跑港股刷新
2. `aws/systemd/risk-atlas-crypto-daily-market-refresh.timer` 在数小时后再跑 crypto 刷新

这样可以把港股和 crypto 从同一个资源窗口里拆开，避免在很小的主机上互相抢资源。

对于很小的实例，建议先保持一组更保守的 daily crypto 刷新参数，确认仍有余量后再上调：

```dotenv
RISK_ATLAS_DAILY_REFRESH_CRYPTO_TARGET_COUNT=300
RISK_ATLAS_DAILY_REFRESH_CRYPTO_MIN_COUNT=80
RISK_ATLAS_DAILY_REFRESH_CRYPTO_CANDIDATE_PAGE_COUNT=3
RISK_ATLAS_DAILY_REFRESH_CRYPTO_HISTORY_BATCH_SIZE=80
RISK_ATLAS_DAILY_REFRESH_CRYPTO_HISTORY_CONCURRENCY=4
RISK_ATLAS_DAILY_REFRESH_CRYPTO_REQUEST_DELAY_MS=500
```

启用后，deploy 脚本会安装并启用 `aws/systemd/risk-atlas-hk-daily-market-refresh.service` / `aws/systemd/risk-atlas-hk-daily-market-refresh.timer` 以及 `aws/systemd/risk-atlas-crypto-daily-market-refresh.service` / `aws/systemd/risk-atlas-crypto-daily-market-refresh.timer`。

这两个 timer 会执行同一套 market-state refresh 编排，但放在不同时间窗口：

1. 港股 timer 会先确保港股 seed prerequisite 仍然存在，然后把港股数据 overlap-refresh 到最新可用交易日
2. crypto timer 会在后面的窗口里，把加密数据 overlap-refresh 到最新可用交易日，并使用上面那组 daily-only crypto 调优参数

当 `RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS=1` 时，每个 timer 只会为自己刚刚刷新的市场构建或复用 snapshot，不再把两个市场塞进同一个任务里重建。

当 `RISK_ATLAS_DAILY_REFRESH_CONTINUE_ON_MARKET_FAILURE=1` 时，如果某一侧市场刷新失败，系统会记录 degraded outcome，但不会把另一侧市场的刷新一起拖垮。只有当这次运行中所有被请求的市场都失败时，service 才会真正失败。

在 `t3.small` 上，把两个市场塞进同一个刷新窗口本身就会制造争抢，所以生产路径现在改成“拆分 timer + 默认只刷新数据”。

如果你希望在不依赖 systemd 的情况下手动执行同一流程：

```bash
cd /opt/risk-atlas/app
bash aws/scripts/run-daily-market-refresh.sh
```

这个 helper 会在需要时先拉起 PostgreSQL，然后用生产环境文件在 API container 内运行 `prisma/refresh-daily-market-state.ts`。

如果你只想手动刷新其中一个市场：

```bash
cd /opt/risk-atlas/app
bash aws/scripts/run-daily-market-refresh.sh aws/.env.production hk
bash aws/scripts/run-daily-market-refresh.sh aws/.env.production crypto
```

如果你更希望手动安装 timer：

```bash
sudo cp aws/systemd/risk-atlas-hk-daily-market-refresh.service /etc/systemd/system/
sudo cp aws/systemd/risk-atlas-hk-daily-market-refresh.timer /etc/systemd/system/
sudo cp aws/systemd/risk-atlas-crypto-daily-market-refresh.service /etc/systemd/system/
sudo cp aws/systemd/risk-atlas-crypto-daily-market-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now risk-atlas-hk-daily-market-refresh.timer
sudo systemctl enable --now risk-atlas-crypto-daily-market-refresh.timer
sudo systemctl status risk-atlas-hk-daily-market-refresh.timer
sudo systemctl status risk-atlas-crypto-daily-market-refresh.timer
```

如果你在首次安装后更新了 unit 文件，记得重新执行 `sudo systemctl daemon-reload`，再重启 timer 或 service，让新的失败退避策略生效。

如果你的 seed 使用了仓库内自带的 real-HK CSV，那么第一次导入会比较重：文件大约有 140 万行，在 EC2 上可能要几分钟后才会看到下一条导入日志。

现在 importer 每插入 100,000 行就会打印一次进度。

如果你想在 deploy 脚本仍在运行时，从另一个 SSH 会话中观察进度：

```bash
cd /opt/risk-atlas/app
set -a
source aws/.env.production
set +a
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT COUNT(*) FROM "eod_prices";'
```

## 9. 用 Let's Encrypt 启用 HTTPS

### 第 1 步：先部署仅 HTTP 的 Nginx 配置

如果当前还没有证书，deploy 脚本会自动渲染 HTTP 模板。

这一步先验证：

```bash
curl http://YOUR_DOMAIN/health
curl http://YOUR_DOMAIN/docs
```

如果你使用了 Cloudflare proxy，并在这里看到 HTTP 521，说明 Cloudflare 还连不到你的源站。在排查 Cloudflare 之前，先直接验证源站：

```bash
curl -H "Host: YOUR_DOMAIN" http://127.0.0.1/health
curl -H "Host: YOUR_DOMAIN" http://YOUR_EC2_PUBLIC_IP/health
sudo systemctl status nginx --no-pager
```

如果直接访问源站都失败，先修 EC2 主机本身。常见原因：

- 没跑 bootstrap 脚本，所以 Nginx、Certbot 或 Docker Compose 根本没装上
- deploy 脚本在渲染 Nginx 配置之前就中断了
- security group 没有放行 80 或 443
- 过早开启了 Cloudflare proxy，掩盖了源站侧问题

最干净的首次验证方式，是先把 Cloudflare 记录临时切到 DNS only，等源站 80 端口已经返回 200 再打开代理。

### 第 2 步：签发证书

当 DNS 已经指向 Elastic IP，且 80 端口可达后：

```bash
sudo certbot --nginx -d YOUR_DOMAIN -m YOUR_EMAIL --agree-tos --no-eff-email
```

如果你也想支持 `www`：

先在 `aws/.env.production` 中设置：

```dotenv
DOMAIN_SERVER_NAMES=YOUR_DOMAIN www.YOUR_DOMAIN
```

然后申请证书：

```bash
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN -m YOUR_EMAIL --agree-tos --no-eff-email
```

### 第 3 步：切换到 HTTPS 模板

Certbot 生成证书文件后，再跑一次 deploy 脚本：

```bash
bash aws/scripts/deploy-ec2.sh
```

deploy 脚本会自动检测证书文件是否存在，并从 `aws/nginx/risk-atlas-http.conf` 切换到 `aws/nginx/risk-atlas-https.conf`。

### 第 4 步：验证续期

```bash
sudo certbot renew --dry-run
```

## 10. 为 artifact storage 配置 S3 bucket

### 创建 bucket

在 S3 控制台中：

- 创建一个私有 bucket
- 保持 block public access 开启
- 除非你有明确理由，否则把它放在和 EC2 相同的 region

建议的 lifecycle rule：

- 当前版本先在 Standard 保留 30 天
- 如果你想进一步降低持续成本，再把更旧对象迁移到 Standard-IA 或 Intelligent-Tiering
- 也可以把非常老的 artifact 迁移到 Glacier Instant Retrieval 或 Glacier Flexible Retrieval

### 手动同步

当 `aws/.env.production` 已经填好后：

```bash
cd /opt/risk-atlas/app
bash aws/scripts/sync-artifacts-to-s3.sh
```

如果 `ARTIFACT_STORAGE_BACKEND=local_fs`，这个脚本会把 `build-runs` 同步到 S3。

如果 `ARTIFACT_STORAGE_BACKEND=s3`，那么 `build-runs` 本来就直接写入 S3，所以脚本会跳过它们；此时它更多只是给可选的 analysis-run 备份使用。

如果你设置了 `SYNC_ANALYSIS_RUNS_TO_S3=1`，它还会把 `analysis-runs` 同步过去。

### 通过 systemd timer 定时同步

安装仓库提供的 unit files：

```bash
sudo cp aws/systemd/risk-atlas-artifact-sync.service /etc/systemd/system/
sudo cp aws/systemd/risk-atlas-artifact-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now risk-atlas-artifact-sync.timer
sudo systemctl status risk-atlas-artifact-sync.timer
```

这个 timer 每 30 分钟运行一次。

## 10A. 如果你要的是 S3-primary，而不是 backup-only

这已经是当前推荐的低成本部署模式。

对一个预算优先的个人部署来说，最合理的 S3-primary 方案是：

1. 只保留一个私有 bucket
2. 只保留一个前缀，例如 `prod/build-runs`
3. 使用 EC2 instance role，而不是长期 access key
4. 对 build download 返回 presigned URL，而不是尽量让 Node 代理整份文件
5. 只 cache 当前仍会被查询的 matrix 文件
6. 自动删除或过期老 cache 文件

即使采用这种模式，仍然保留在本地的内容包括：

- PostgreSQL
- Nginx 提供的前端构建产物
- 一个较小的本地 `matrix.bsm` cache，供 C++ 查询二进制使用
- 可选的 analysis-run 记录，除非你后续继续重构这一层

这个模式能帮你节省：

- 更小的 EBS 需求
- build series 导致磁盘打满的风险更低
- 更轻松地保留长期 artifact

但它并不能帮你省掉：

- 运行 API 和 build job 的 EC2 计算成本
- S3 的 PUT、GET 和 LIST 请求费用
- 公网 IPv4 与域名相关成本

## 11. 与本地开发相比，生产环境必须改动的配置

这些设置不能沿用本地开发值：

- `NODE_ENV` 必须是 `production`
- same-origin 部署时，`VITE_API_BASE_URL` 应保持为空
- `CORS_ALLOWED_ORIGINS` 应该是你的 HTTPS 域名，而不是 localhost
- `DATABASE_URL` 要指向 EC2 部署里的 postgres Docker service
- `ARTIFACT_ROOT_DIR` 应指向持久化的主机挂载目录，而不是本地相对路径
- `BSM_WRITER_BIN` 和 `BSM_QUERY_BIN` 应使用生产镜像中的固定容器路径
- PostgreSQL 绝对不要对公网开放
- 邀请码与 salt 不能继续使用示例默认值

## 12. 日常维护与运维命令

### 把服务器更新到仓库里最新的已提交版本

```bash
cd /opt/risk-atlas/app
git pull --ff-only origin main
git submodule update --init --recursive
bash aws/scripts/deploy-ec2.sh
```

当部署脚本、前端静态资源、API 行为或环境变量处理逻辑发生变化，而你希望服务器与仓库最新版保持一致时，就用这一组命令。

### 手动执行一次每日刷新

```bash
cd /opt/risk-atlas/app
bash aws/scripts/run-daily-market-refresh.sh
```

当你不想等下一个 timer tick，或者在维护期暂时关闭 timer 时，这个命令很有用。

### 检查 Docker 服务

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production ps
```

如果你的主机只暴露 `docker-compose`，下面的手动命令都把 `docker compose` 换成 `docker-compose` 即可。

### 查看 API 日志

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production logs -f api
```

### 查看 PostgreSQL 日志

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production logs -f postgres
```

### 只重启 API

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production restart api
```

### 手动重跑数据库迁移

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production run --rm --no-deps api npx prisma migrate deploy
```

### 检查 Nginx 配置

```bash
sudo nginx -t
```

### 修改配置后 reload Nginx

```bash
sudo systemctl reload nginx
```

### 对公网站点做 smoke check

```bash
curl -I https://YOUR_DOMAIN
curl https://YOUR_DOMAIN/health
curl -I https://YOUR_DOMAIN/docs
```

## 13. PostgreSQL 备份

当前这个首版部署仍把 PostgreSQL 放在同一台 EC2 上，所以你至少应该建立一个简单备份习惯。

手动 dump 示例：

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > risk-atlas-$(date +%F).sql
```

对个人项目来说，即使只是每天导出一个 dump 再传到 S3，也远比完全没有备份强。

## 14. 当前存储行为与剩余边界

当前应用已经支持 S3-primary build artifact，但仍有一个边界需要记住：

- analysis-run 记录仍然是 filesystem-backed

对于 build artifact，当前有效行为是：

- `preview.json` 和 `manifest` 元数据可以位于 S3
- matrix 下载可以直接用 presigned S3 URL
- matrix 查询仍然需要一份本地 cache 文件，因为 C++ 工具当前是基于文件路径读取的

这对当前仓库来说，是一个很合理的预算与性能折中。

## 15. 首个稳定版本之后，最值得做的升级

当单机版本已经稳定后，接下来最值得投入的改进包括：

1. 把 PostgreSQL 迁到 Amazon RDS
2. 继续巩固 S3 作为主 artifact store，本地只保留 matrix query cache
3. 为镜像构建和部署加 CI/CD
4. 接入 CloudWatch 或其他日志管线
5. 给 EC2 本地磁盘加 artifact retention 和 pruning 规则

## 16. 推荐上线清单

正式公开前，请确认：

- DNS A 记录已经指向 Elastic IP
- Nginx 正确提供前端内容
- `/health` 通过 Nginx 返回 200
- `/docs` 通过 Nginx 可访问
- 在 EC2 上能成功跑一个真实 build-run
- artifact 已经出现在 `ARTIFACT_ROOT_DIR/build-runs`
- S3 sync 能上传 build-run artifact
- `certbot renew --dry-run` 通过
- 至少重启一次 EC2，确认 Docker 与 Nginx 都能自动恢复

如果你想发布一个最简单的首个版本，就不要过早优化。先把第一版云端部署做得朴素、明确、易排查。
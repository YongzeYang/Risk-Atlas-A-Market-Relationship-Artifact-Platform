# AWS 上的 Risk Atlas

English version: [README.md](README.md) | 簡體中文版本：[README.zh-CN.md](README.zh-CN.md)

這個目錄包含面向單機 AWS 部署形態的生產資產：

- 一台 Ubuntu EC2 實例
- 主機層 Nginx，負責 80 及 443
- 使用 Docker Compose 運行 API 與 PostgreSQL
- 單域名 same-origin 路由
- Amazon S3 作為推薦的低成本 build artifact 真源
- EC2 本機保留一個 `matrix.bsm` 快取目錄，以相容目前仍需要檔案路徑的 C++ 查詢鏈路

API 現在同時支援 `local_fs` 與 `s3` 兩種 artifact storage backend。當前推薦的低預算生產形態是：持久化 artifact 放到 S3，本機只保留一個較小的 matrix cache。

## 部署生命週期總覽

1. 首次主機 bootstrap：在全新的 Ubuntu EC2 主機上，先執行 `sudo DEPLOY_USER=ubuntu bash aws/scripts/bootstrap-ec2.sh`，安裝 Docker、Nginx、Certbot、AWS CLI、Node.js 20、pnpm 及原生構建依賴。
2. 首次部署與初始化市場 bootstrap：把 `aws/.env.production.example` 複製為 `aws/.env.production`。如果你希望伺服器首次部署時重用倉庫基線、刷新港股及加密市場，並直接產出最新 8 個預設全市場快照，就把 `RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY=1` 打開，然後執行 `bash aws/scripts/deploy-ec2.sh`。
3. 日常資料刷新：保持 `INSTALL_DAILY_MARKET_REFRESH_TIMER=1`，讓內建的 24 小時 systemd timer 自動執行；如果你想即時刷新一次，也可以手動執行 `bash aws/scripts/run-daily-market-refresh.sh`。
4. 日常維護：對已檢出的 `main` 分支做 fast-forward 更新，重新執行 `bash aws/scripts/deploy-ec2.sh`，檢查 Docker、Nginx 與每日 timer 狀態，備份 PostgreSQL，並在磁碟壓力上升時清理舊 artifact 或 cache 檔案。

下面的章節會把這幾個階段逐一展開。

## 1. 應該買什麼，以及原因

### EC2

使用 x86_64 的 Ubuntu LTS 實例。這個專案會在映像建構期間編譯 C++ 二進位，因此最穩妥的目標仍然是：

- AMI：Ubuntu Server 24.04 LTS x86_64
- 實例族：突發型通用實例已足夠個人項目使用
- 最低預算、以讀取為主的規格：`t3.small`，前提是你主要瀏覽現有 artifact，而且不會頻繁在伺服器上跑全市場構建
- 更平衡的單機部署起點：`t3.large`
- 如果你預期會反覆跑較大的 HK 構建，或有多個會話並行：`t3.xlarge`

為什麼更便宜的規格只是「有條件可用」：

- 這個倉庫目前會把 API、PostgreSQL、構建編排及 C++ matrix 工具全部放在同一台主機上
- 小型突發實例可以作為個人示範或輕量讀取流量的選擇，但並不適合頻繁生成大型 HK 構建
- 如果你想把預算壓到最低，最好盡量在本機預先構建 artifact，讓雲端主機主要承擔服務及輕量佇列工作

為什麼不優先 arm64：

- 你的本機工具鏈及倉庫中的大多數 Docker 例子都預設較常見的 x86_64 路徑
- 在 x86_64 上遇到 C++ 與原生依賴兼容問題的機率更低
- 當你鏡像本倉庫最常見的 Linux 目標時，疑難排解會更直接

### EBS

如果你打算在本機長期保留 artifact，就不要使用預設的細小系統碟。

建議的 gp3 容量：

- 最低可用：80 GB
- 更穩妥的個人項目容量：120 GB
- 如果你預期會有很多 build series 且清理較慢：150 GB 到 200 GB

如果 S3 是 artifact 主儲存，而 EC2 只保留一個臨時快取，可以縮小：

- 極限低預算系統碟：30 GB 到 40 GB
- 更穩妥的低預算系統碟：50 GB 到 60 GB

原因：

- PostgreSQL 資料在這個首版部署中仍然保存在本機
- 在線查詢仍然需要本機磁碟上的 build artifact 或 cache
- Docker 映像層、pnpm cache 及倉庫本身也會佔用空間

### S3

為 build artifact 建立一個 bucket。

建議設定：

- Bucket type：general purpose bucket
- Storage class：先用 Standard；如果你更希望自動控費，也可以直接用 Intelligent-Tiering
- Versioning：可選；如果你想提高復原安全性就打開，如果你只想壓低賬單並簡化 lifecycle 行為就保持關閉
- Block all public access：開啟
- Bucket policy：除非你有非常明確的分享需求，否則不需要

這個倉庫現在已經支援 S3-primary build artifact。只要把 `ARTIFACT_STORAGE_BACKEND=s3`，並填寫 `AWS_REGION`、`S3_ARTIFACT_BUCKET`，以及可選的 `S3_ARTIFACT_PREFIX` 即可。

如果你希望 S3 成為 artifact 的 source of truth，不要把它理解成一個「只改配置」的動作。當前程式碼在若干運行路徑中仍然假定本機檔案存在。

目前低成本、可落地的目標形態是：

- S3 作為 build-run bundle 的 source of truth
- EC2 上保留一個較小的本機快取目錄，用來存放 C++ 工具仍需查詢的 `matrix.bsm`
- 下載介面透過 presigned URL 直接讓瀏覽器從 S3 下載

這種模式可以明顯減少 EBS 壓力，同時不要求你立刻重寫 C++ 查詢層。

## 1A. Free-tier-first 的現實檢查

如果你想把賬單壓到最低，不要按「永久免費」來設計，而要按「盡可能低支出」來設計。

目前 AWS 計費現實重點：

- 按目前 AWS Free Tier 頁面公開資訊，新賬戶拿到的是額度型 credits，而不是永久免費的生產環境
- 目前公開頁面描述的是最多 200 USD 的新用戶 credits，並帶有免費計劃期與到期窗口
- 目前 EC2 定價頁亦說明 public IPv4 及 Elastic IP 不是永久免費，不要假設公網 IP 可以長期零成本
- 目前 EC2 定價頁亦說明每月 100 GB 的對外免費流量額度，這對小型個人項目有幫助，但不能當作無限流量

對個人項目最重要的控費規則是：

1. 只用一台 EC2
2. 除非你有明確理由，否則不要引入 ALB、NAT gateway、RDS 或 CloudFront
3. 如果外部域名註冊商更便宜，就不要執著於在 AWS 買域名
4. 只保留一個私有 S3 bucket
5. 除非你確實需要回滾安全性，否則不要預設打開 S3 versioning
6. 第一天就加上 billing alarm
7. 要積極清理或歸檔舊 artifact

## 1B. 目前實作中，S3-primary 支援到底代表什麼

目前實作支援下面這套運行模型：

1. 構建先在本機臨時工作目錄內完成
2. 構建成功後，把 `matrix.bsm`、`preview.json` 及 `manifest.json` 上傳到 S3
3. 資料庫 artifact 記錄會寫成 `storageKind=s3`，同時填入 `storageBucket` 及 `storagePrefix`
4. build detail 頁會直接從 S3 讀取 `preview.json`
5. 當 artifact 位於 S3 時，`/build-runs/:id/download` 會重定向到 presigned S3 URL
6. 在 compare、exposure、pair-divergence、structure 或 matrix 查詢流程真正透過 C++ 二進位讀取時，`matrix.bsm` 會按需下載到本機快取目錄
7. analysis-run 記錄目前仍然保存在本機檔案系統

這讓你在不重寫 C++ 查詢層的前提下，拿到 S3-primary 儲存的大部分 EBS 節省效果。

### 建議的低成本實作形態

先使用這套模式：

- build bundle 在本機臨時工作目錄中建立
- build 成功後，把三個檔案都上傳到 S3
- 資料庫 artifact 記錄標記為 `s3`，並寫入 `storageBucket` 與 `storagePrefix`
- `preview` 與 `manifest` 直接從 S3 讀取
- 只有在 compare、exposure、pair-divergence、structure 或 download 真正需要時，才把 `matrix.bsm` 由 S3 惰性下載到本機快取
- 快取使用 LRU 或基於年齡的清理策略，讓 EC2 磁碟保持較小

這比把所有 build 永久放在 EBS 上便宜得多，同時仍然符合目前 C++ 查詢設計。

### 最低成本下可接受的 storage class 策略

對運行期經常訪問的 artifact，先全部放在 S3 Standard。

原因：

- 行為最簡單
- 沒有恢復延遲
- 不會引入冷儲存層的最短存放時間與提取模式複雜度

只有在系統穩定後，再考慮 lifecycle 規則，例如：

- 近期活躍 build bundle 保持在 Standard
- 很少再查詢的舊 bundle 遷移到更冷的層級
- 或者直接刪除舊 bundle，只保留你真正需要導出的結果

不要把仍在運行路徑上的 matrix 檔案放入 Glacier 類別，除非你願意接受 restore latency 與更複雜的查詢流程。

## 2. 生產架構

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

另一種 S3-primary 形態：

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

EC2 主機上的目錄布局：

```text
/opt/risk-atlas/app              git clone of this repository
/var/www/risk-atlas              built frontend files served by Nginx
/var/lib/risk-atlas/postgres     PostgreSQL data directory
/var/lib/risk-atlas/artifacts    build-runs and analysis-runs
/var/www/certbot                 ACME challenge directory for Let's Encrypt
```

## 3. 登入伺服器之前，需要先建立的 AWS 資源

### Security group

為 EC2 實例建立一個 security group。

Inbound rules：

- TCP 22：只允許你的固定 IP
- TCP 80：`0.0.0.0/0`
- TCP 443：`0.0.0.0/0`

不要把 PostgreSQL 對公網開放。

Outbound rules：

- 對個人項目來說，預設 allow all 已足夠

### Elastic IP

分配一個 Elastic IP，並把它綁定到實例。

原因：

- 你的 DNS A 記錄應該指向一個穩定的公網 IPv4
- 實例重啟後不需要重新改 DNS

### 用於存取 S3 artifact 的 IAM role

為 EC2 實例掛上一個最小權限的 instance role，用於運行時讀取與寫入 S3 artifact。

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

如果你不想給刪除權限，就移除 `s3:DeleteObject`，並在環境變數內保持 `S3_SYNC_DELETE=0`。

## 4. 域名購買與 DNS

對一個輕量個人項目，可以直接使用你已經熟悉、流程簡單的域名註冊商。

常見低摩擦選擇：

- Cloudflare Registrar
- Porkbun
- Namecheap

建議的 DNS 記錄：

- A record：`@` -> 你的 Elastic IP
- A record：`www` -> 你的 Elastic IP，或者後續把 `www` 重定向到 apex domain

只有在你明確配置了實例 IPv6 及 security group IPv6 規則時，才需要 AAAA 記錄。

## 5. 啟動 EC2 實例

建議的 launch 選擇：

- OS：Ubuntu Server 24.04 LTS x86_64
- 最低預算規格：`t3.small`，只適用於讀取為主或輕量使用場景
- 更現實的一體機規格：`t3.large`
- Root disk：gp3 120 GB
- Auto-assign public IP：yes，之後再替換成 Elastic IP
- IAM role：現在就掛上前面提到的 S3 artifact role
- Security group：使用前文描述的那個

如果你採用的是 S3-primary artifact 儲存並帶本機 matrix cache，就可以把 root disk 建議值下調到 30 GB 到 60 GB，具體取決於你清理快取的積極程度。

實例可連通後：

```bash
ssh ubuntu@YOUR_ELASTIC_IP
```

## 6. 在全新 EC2 主機上的首次 bootstrap

這個倉庫已在當前目錄提供 bootstrap 腳本。

在伺服器上執行：

```bash
sudo mkdir -p /opt/risk-atlas
sudo chown ubuntu:ubuntu /opt/risk-atlas
cd /opt/risk-atlas
git clone --recursive https://github.com/YongzeYang/Risk-Atlas-A-Market-Relationship-Artifact-Platform app
cd app
sudo DEPLOY_USER=ubuntu bash aws/scripts/bootstrap-ec2.sh
```

bootstrap 腳本會安裝：

- Docker Engine
- Docker Compose 支援；如果主機上已裝 Docker，腳本會先嘗試補上 Compose，而不是立即替換現有引擎
- Nginx
- Certbot 與 Nginx Certbot plugin
- AWS CLI v2；優先使用 Ubuntu 套件，失敗時回退到官方安裝器
- Node.js 20
- 透過 Corepack 安裝 pnpm
- CMake、build-essential、git、rsync、jq、gettext-base

bootstrap 完成後，立即驗證主機：

```bash
docker --version
docker compose version || docker-compose version
certbot --version
aws --version
pnpm --version
```

如果 bootstrap 卡在 Docker service 啟動階段，不要立刻重跑整個流程，而是先直接查看服務狀態：

```bash
sudo systemctl status docker --no-pager
sudo journalctl -u docker -n 50 --no-pager
```

如果日誌中出現 `failed to load listeners: no sockets found via socket activation`，代表主機處於損壞的 Docker service/socket 狀態。更新後的 bootstrap 腳本會在重啟 `docker.service` 之前重置失敗狀態，並先拉起 `docker.socket`。

對已預裝 Ubuntu Docker 套件的主機，目前預期路徑是：

- 如果已有 Docker engine 健康，就直接保留
- 單獨安裝 Docker Compose 支援
- 如果 Docker daemon 不處於 active 狀態，bootstrap 會立即失敗，不再繼續後面步驟

bootstrap 完成後，登出 SSH 一次再重新登入，讓目前使用者拿到 Docker group membership。

注意：

如果倉庫已存在於伺服器上，而你是在更新部署腳本，不要停在 `git fetch`。

`git fetch` 只會更新 remote refs，不會更新 `/opt/risk-atlas/app` 內目前檢出的檔案。

應當使用：

```bash
cd /opt/risk-atlas/app
git pull --ff-only origin main
git submodule update --init --recursive
```

這代表：

- `git pull --ff-only origin main` 只會在伺服器目前分支可以不經 merge 而直接前進到遠端提交時更新到最新 `main`
- 這對生產主機來說是最安全的更新行為，因為它不會用自動 merge 掩蓋本機分叉
- 如果命令成功，`/opt/risk-atlas/app` 內的檔案才真正與遠端 `main` 一致

如果失敗了，應該怎麼做：

- 先執行 `git status`
- 如果你預期的只是像 `aws/.env.production` 這樣的忽略型 secret 檔案，保持它們不動即可；被 ignore 的檔案不會阻止 fast-forward pull
- 如果你看到伺服器上有 tracked file 被修改，就要先決定這些修改應該提交、另存，還是捨棄，再 pull
- 如果伺服器上有不在 `origin/main` 上的本機 commit，先用 `git log --oneline --decorate --graph --max-count=10` 看清楚，再決定 rebase、reset，還是保留

如果 `git pull` 因本機 tracked file 改動而拒絕執行，請先用 `git status` 檢查。生產 secrets 檔案 `aws/.env.production` 已被 ignore，不應阻礙 fast-forward pull。

## 7. 配置生產環境檔案

先複製示例檔案：

```bash
cd /opt/risk-atlas/app
cp aws/.env.production.example aws/.env.production
```

然後仔細編輯它。

最重要的欄位：

- `DOMAIN_NAME`：你的最終公網域名
- `DOMAIN_SERVER_NAMES`：傳給 Nginx `server_name` 的空格分隔域名；如果沒有別名，保持與 `DOMAIN_NAME` 一致即可
- `LETSENCRYPT_EMAIL`：用於 Let's Encrypt 通知的電郵
- `WEB_ROOT_DIR`：Nginx 提供靜態檔案的主機目錄
- `POSTGRES_DATA_DIR`：持久化 PostgreSQL 資料的主機目錄
- `ARTIFACT_ROOT_DIR`：臨時 build bundle 及 analysis-run 記錄所在的主機目錄
- `ARTIFACT_CACHE_DIR`：啟用 S3 儲存時，本機 `matrix.bsm` 快取檔案所在目錄
- `ARTIFACT_STORAGE_BACKEND`：低預算部署建議設為 `s3`
- `DATABASE_URL`：API container 使用的資料庫連接字串
- `CORS_ALLOWED_ORIGINS`：應設為 `https://your-domain`
- `VITE_API_BASE_URL`：same-origin 部署時保持空字串
- `RISK_ATLAS_INVITE_CODES` 與 `RISK_ATLAS_INVITE_SALT`：替換掉示例預設值
- `S3_ARTIFACT_BUCKET` 與 `AWS_REGION`：啟用 S3 artifact storage 的必填項
- `S3_ARTIFACT_PREFIX`：可選前綴，例如 `prod`
- `S3_SIGNED_URL_TTL_SECONDS`：構建下載 presigned URL 的有效期
- `RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY`：如果你希望首次部署時重用倉庫基線、把兩個市場刷新到最新 overlap window，並自動構建最新 8 個全市場快照，就設為 `1`
- `INSTALL_DAILY_MARKET_REFRESH_TIMER`：如果你希望部署後主機每 24 小時自動刷新一次兩個市場，就設為 `1`
- `RISK_ATLAS_DAILY_REFRESH_RUN_HK` 與 `RISK_ATLAS_DAILY_REFRESH_RUN_CRYPTO`：讓你在保持 24 小時 timer 開啟的同時，單獨停用某一側市場

在這個部署模型中，`VITE_API_BASE_URL` 保持為空。

原因：

- 前端會在同源下直接請求 `/datasets`、`/build-runs`、`/analysis-runs`、`/docs` 及 `/health`
- Nginx 會把這些路徑代理到 API container
- 這樣可以避免再開一個 API 子域名，也避免額外的 CORS 複雜度

## 8. 首次部署與初始化市場 bootstrap

執行倉庫提供的部署腳本：

```bash
cd /opt/risk-atlas/app
bash aws/scripts/deploy-ec2.sh
```

如果你的伺服器只有獨立的 `docker-compose` 二進位，deploy 腳本現在會自動回退到它。

deploy 腳本會執行：

1. 載入 `aws/.env.production`
2. 更新 git submodule checkout
3. 用 pnpm 安裝工作區依賴
4. 使用生產 Vite 變數構建前端
5. 把前端 `dist` 檔案發布到 `WEB_ROOT_DIR`
6. 構建生產 API Docker 映像
7. 用 Docker Compose 拉起 PostgreSQL
8. 在 API 映像內執行 `prisma migrate deploy`
9. 按配置選擇一個首次部署資料輔助流程：
   - `RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY=1`：重用 `data/` 下的倉庫基線，把兩個市場刷新到最新 overlap window，並總共執行或重用 8 個 snapshot build：港股 4 個 score method，加密 4 個 score method
   - 否則，如果 `RUN_SEED_ON_DEPLOY=1`，則只執行港股 seed 路徑
10. 根據 `ARTIFACT_STORAGE_BACKEND`，以 `local_fs` 或 `s3` 模式啟動或更新 API container
11. 從 `aws/nginx` 內的模板渲染 Nginx 站點配置
12. reload Nginx
13. 如果 `SYNC_ARTIFACTS_ON_DEPLOY=1`，可選執行一次 S3 artifact sync

### Seed 行為

如果這是第一次部署，而你只想自動執行港股 seed 路徑，設定：

```dotenv
RUN_SEED_ON_DEPLOY=1
```

然後執行一次 deploy 腳本。

首次 seed 成功後，除非你明確想再次重跑，否則把它改回 `0`。

### 初始市場 bootstrap 行為

如果你希望伺服器在首次部署時自動初始化兩個市場，並直接產出全部 8 個單日期快照，設定：

```dotenv
RUN_INITIAL_MARKET_BOOTSTRAP_ON_DEPLOY=1
RUN_SEED_ON_DEPLOY=0
```

這個 helper 會按以下順序執行：

1. 只有在 HK dataset 或 `hk_all_common_equity` universe 仍缺失時，才透過 `prisma/seed.ts` 補齊港股 seed prerequisite
2. 透過 `prisma/real-hk-benchmark.ts --skip-benchmarks` 及 merge 語義，從倉庫基線加最新 overlap window 刷新港股資料集
3. 透過 `prisma/import-crypto-market-map.ts` 及 merge 語義，從倉庫基線加最新 overlap window 刷新加密 market-map 資料集
4. 順序執行或重用 8 個 `windowDays=252` 的 snapshot build：
   - Hong Kong market：`pearson_corr`、`ewma_corr`、`tail_dep_05`、`nmi_hist_10`
   - Crypto market：`pearson_corr`、`ewma_corr`、`tail_dep_05`、`nmi_hist_10`

這個 snapshot helper 使用的 dataset / universe 組合是：

- HK：優先使用 `hk_eod_yahoo_real_v1`，否則回退到 `hk_eod_demo_v1`；universe 使用 `hk_all_common_equity`
- Crypto：dataset 使用 `crypto_market_map_yahoo_v2`；universe 使用 `crypto_market_map_all`

如果你更希望手動執行這個 helper，而不是透過 deploy 腳本觸發：

```bash
cd /opt/risk-atlas/app
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production run --rm --no-deps api \
  node --import tsx prisma/bootstrap-initial-market-state.ts
```

這與本機 `pnpm bootstrap:local` 目前預設走的 bootstrap 流程是同一套邏輯。

### 每 24 小時的循環市場刷新

如果你希望伺服器在首次部署後每 24 小時都自動保持兩個市場最新，在執行 deploy 腳本前，在 `aws/.env.production` 中設定：

```dotenv
INSTALL_DAILY_MARKET_REFRESH_TIMER=1
RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS=0
```

對於 `t3.small` 這類很小的實例，建議保持 `RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS=0`，除非你明確希望 daily job 同時重建市場快照。

啟用後，deploy 腳本會安裝並啟用 `aws/systemd/risk-atlas-daily-market-refresh.service` 及 `aws/systemd/risk-atlas-daily-market-refresh.timer`。

這個 timer 每 24 小時執行同一套 market-state refresh 流程：

1. 確保港股 seed prerequisite 仍然存在
2. 把港股資料 overlap-refresh 到最新可用交易日
3. 把加密資料 overlap-refresh 到最新可用交易日

當 `RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS=1` 時，這個任務才會繼續構建或重用最新的 8 個全市場快照。

在 `t3.small` 上，把這 8 個快照和資料刷新放在同一個定時任務裡，通常就是導致 CPU 與記憶體被打滿、站點逾時的主要原因，所以生產預設值現在改為「只刷新資料」。

如果你希望在不依賴 systemd 的情況下手動執行同一流程：

```bash
cd /opt/risk-atlas/app
bash aws/scripts/run-daily-market-refresh.sh
```

這個 helper 會在需要時先拉起 PostgreSQL，然後用生產環境檔案在 API container 內執行 `prisma/refresh-daily-market-state.ts`。

如果你更希望手動安裝 timer：

```bash
sudo cp aws/systemd/risk-atlas-daily-market-refresh.service /etc/systemd/system/
sudo cp aws/systemd/risk-atlas-daily-market-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now risk-atlas-daily-market-refresh.timer
sudo systemctl status risk-atlas-daily-market-refresh.timer
```

如果你的 seed 使用了倉庫內自帶的 real-HK CSV，那麼第一次導入會比較重：檔案大約有 140 萬行，在 EC2 上可能要幾分鐘後才會看到下一條導入日誌。

現在 importer 每插入 100,000 行就會打印一次進度。

如果你想在 deploy 腳本仍在運行時，從另一個 SSH 會話觀察進度：

```bash
cd /opt/risk-atlas/app
set -a
source aws/.env.production
set +a
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT COUNT(*) FROM "eod_prices";'
```

## 9. 用 Let's Encrypt 啟用 HTTPS

### 第 1 步：先部署只含 HTTP 的 Nginx 配置

如果目前還沒有證書，deploy 腳本會自動渲染 HTTP 模板。

這一步先驗證：

```bash
curl http://YOUR_DOMAIN/health
curl http://YOUR_DOMAIN/docs
```

如果你使用了 Cloudflare proxy，並在這裡看到 HTTP 521，表示 Cloudflare 還連不到你的源站。在排查 Cloudflare 之前，先直接驗證源站：

```bash
curl -H "Host: YOUR_DOMAIN" http://127.0.0.1/health
curl -H "Host: YOUR_DOMAIN" http://YOUR_EC2_PUBLIC_IP/health
sudo systemctl status nginx --no-pager
```

如果直接存取源站都失敗，先修 EC2 主機本身。常見原因：

- 沒有執行 bootstrap 腳本，所以 Nginx、Certbot 或 Docker Compose 根本未安裝
- deploy 腳本在渲染 Nginx 配置之前就中斷了
- security group 沒有放行 80 或 443
- 過早打開 Cloudflare proxy，掩蓋了源站端問題

最乾淨的首次驗證方式，是先把 Cloudflare 記錄臨時切到 DNS only，等源站 80 端口已返回 200 再打開代理。

### 第 2 步：簽發證書

當 DNS 已經指向 Elastic IP，且 80 端口可達後：

```bash
sudo certbot --nginx -d YOUR_DOMAIN -m YOUR_EMAIL --agree-tos --no-eff-email
```

如果你也想支援 `www`：

先在 `aws/.env.production` 中設定：

```dotenv
DOMAIN_SERVER_NAMES=YOUR_DOMAIN www.YOUR_DOMAIN
```

然後申請證書：

```bash
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN -m YOUR_EMAIL --agree-tos --no-eff-email
```

### 第 3 步：切換到 HTTPS 模板

Certbot 建立證書檔案後，再執行一次 deploy 腳本：

```bash
bash aws/scripts/deploy-ec2.sh
```

deploy 腳本會自動檢測證書檔案是否存在，並由 `aws/nginx/risk-atlas-http.conf` 切換到 `aws/nginx/risk-atlas-https.conf`。

### 第 4 步：驗證續期

```bash
sudo certbot renew --dry-run
```

## 10. 為 artifact storage 配置 S3 bucket

### 建立 bucket

在 S3 console 中：

- 建立一個私有 bucket
- 保持 block public access 開啟
- 除非你有明確理由，否則把它放在與 EC2 相同的 region

建議的 lifecycle rule：

- 目前版本先在 Standard 保留 30 天
- 如果你想進一步降低持續成本，再把更舊物件遷移到 Standard-IA 或 Intelligent-Tiering
- 亦可以把非常舊的 artifact 遷移到 Glacier Instant Retrieval 或 Glacier Flexible Retrieval

### 手動同步

當 `aws/.env.production` 已填好後：

```bash
cd /opt/risk-atlas/app
bash aws/scripts/sync-artifacts-to-s3.sh
```

如果 `ARTIFACT_STORAGE_BACKEND=local_fs`，這個腳本會把 `build-runs` 同步到 S3。

如果 `ARTIFACT_STORAGE_BACKEND=s3`，那麼 `build-runs` 本來就直接寫入 S3，所以腳本會跳過它們；此時它更多只是給可選的 analysis-run 備份使用。

如果你設定了 `SYNC_ANALYSIS_RUNS_TO_S3=1`，它亦會把 `analysis-runs` 同步過去。

### 透過 systemd timer 定時同步

安裝倉庫提供的 unit files：

```bash
sudo cp aws/systemd/risk-atlas-artifact-sync.service /etc/systemd/system/
sudo cp aws/systemd/risk-atlas-artifact-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now risk-atlas-artifact-sync.timer
sudo systemctl status risk-atlas-artifact-sync.timer
```

這個 timer 每 30 分鐘運行一次。

## 10A. 如果你要的是 S3-primary，而不是 backup-only

這已經是目前推薦的低成本部署模式。

對一個預算優先的個人部署來說，最合理的 S3-primary 方案是：

1. 只保留一個私有 bucket
2. 只保留一個前綴，例如 `prod/build-runs`
3. 使用 EC2 instance role，而不是長期 access key
4. 對 build download 返回 presigned URL，而不是盡量讓 Node 代理整份檔案
5. 只快取目前仍會被查詢的 matrix 檔案
6. 自動刪除或過期舊快取檔案

即使採用這種模式，仍然保留在本機的內容包括：

- PostgreSQL
- Nginx 提供的前端構建產物
- 一個較小的本機 `matrix.bsm` 快取，供 C++ 查詢二進位使用
- 可選的 analysis-run 記錄，除非你後續繼續重構這一層

這個模式能幫你節省：

- 更小的 EBS 需求
- build series 導致磁碟打滿的風險更低
- 更輕鬆地保留長期 artifact

但它不能幫你省掉：

- 運行 API 及 build job 的 EC2 計算成本
- S3 的 PUT、GET 及 LIST 請求費用
- 公網 IPv4 與域名相關成本

## 11. 與本地開發相比，生產環境必須調整的配置

這些設定不能沿用本地開發值：

- `NODE_ENV` 必須是 `production`
- same-origin 部署時，`VITE_API_BASE_URL` 應保持為空
- `CORS_ALLOWED_ORIGINS` 應該是你的 HTTPS 域名，而不是 localhost
- `DATABASE_URL` 要指向 EC2 部署中的 postgres Docker service
- `ARTIFACT_ROOT_DIR` 應指向持久化的主機掛載目錄，而不是本地相對路徑
- `BSM_WRITER_BIN` 及 `BSM_QUERY_BIN` 應使用生產映像中的固定容器路徑
- PostgreSQL 絕對不要對公網開放
- 邀請碼與 salt 不能繼續使用示例預設值

## 12. 日常維護與維運命令

### 把伺服器更新到倉庫中最新的已提交版本

```bash
cd /opt/risk-atlas/app
git pull --ff-only origin main
git submodule update --init --recursive
bash aws/scripts/deploy-ec2.sh
```

當部署腳本、前端靜態資產、API 行為或環境變數處理邏輯發生變化，而你希望伺服器與倉庫最新版保持一致時，就使用這一組命令。

### 手動執行一次每日刷新

```bash
cd /opt/risk-atlas/app
bash aws/scripts/run-daily-market-refresh.sh
```

當你不想等下一個 timer tick，或者在維護期暫時停用 timer 時，這個命令很有用。

### 檢查 Docker 服務

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production ps
```

如果你的主機只提供 `docker-compose`，下面的手動命令都把 `docker compose` 換成 `docker-compose` 即可。

### 檢視 API 日誌

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production logs -f api
```

### 檢視 PostgreSQL 日誌

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production logs -f postgres
```

### 只重啟 API

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production restart api
```

### 手動重跑資料庫 migration

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production run --rm --no-deps api npx prisma migrate deploy
```

### 檢查 Nginx 配置

```bash
sudo nginx -t
```

### 修改配置後 reload Nginx

```bash
sudo systemctl reload nginx
```

### 對公網站點做 smoke check

```bash
curl -I https://YOUR_DOMAIN
curl https://YOUR_DOMAIN/health
curl -I https://YOUR_DOMAIN/docs
```

## 13. PostgreSQL 備份

目前這個首版部署仍把 PostgreSQL 放在同一台 EC2 上，所以你至少應該建立一個簡單備份習慣。

手動 dump 示例：

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > risk-atlas-$(date +%F).sql
```

對個人項目來說，即使只是每天匯出一個 dump 再上傳到 S3，也遠比完全沒有備份強。

## 14. 目前儲存行為與剩餘邊界

目前應用已支援 S3-primary build artifact，但仍有一個邊界需要記住：

- analysis-run 記錄仍然是 filesystem-backed

對 build artifact 而言，目前有效行為是：

- `preview.json` 及 `manifest` 中繼資料可以放在 S3
- matrix 下載可以直接使用 presigned S3 URL
- matrix 查詢仍然需要一份本機快取檔案，因為 C++ 工具目前是基於檔案路徑讀取

這對目前倉庫來說，是一個很合理的預算與效能折中。

## 15. 首個穩定版本之後，最值得做的升級

當單機版本已穩定後，接下來最值得投入的改進包括：

1. 把 PostgreSQL 遷到 Amazon RDS
2. 繼續鞏固 S3 作為主 artifact store，本機只保留 matrix query 快取
3. 為映像構建及部署加入 CI/CD
4. 接入 CloudWatch 或其他日誌管線
5. 為 EC2 本機磁碟加上 artifact retention 及 pruning 規則

## 16. 建議上線檢查清單

正式公開前，請確認：

- DNS A 記錄已指向 Elastic IP
- Nginx 正確提供前端內容
- `/health` 經由 Nginx 返回 200
- `/docs` 經由 Nginx 可訪問
- 在 EC2 上能成功執行一個真實 build-run
- artifact 已出現在 `ARTIFACT_ROOT_DIR/build-runs`
- S3 sync 能上傳 build-run artifact
- `certbot renew --dry-run` 通過
- 至少重啟一次 EC2，確認 Docker 與 Nginx 都能自動恢復

如果你想發佈一個最簡單的首個版本，就不要過早優化。先把第一版雲端部署做得樸素、明確、容易排查。
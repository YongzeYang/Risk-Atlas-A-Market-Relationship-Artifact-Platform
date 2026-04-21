# Risk Atlas on AWS

This directory contains the production deployment assets for a single-host AWS setup:

- one Ubuntu EC2 instance
- host-level Nginx for port 80 and 443
- Docker Compose for the API and PostgreSQL
- same-origin routing on one public domain
- Amazon S3 as the recommended low-cost source of truth for build artifacts
- a local EC2 cache for matrix.bsm files that must still be queried by the C++ binaries

The API now supports both local_fs and s3 artifact storage backends. The recommended budget-first production shape is s3 for persisted build artifacts plus a small local matrix cache.

## 1. What to buy and why

### EC2

Use an x86_64 Ubuntu LTS instance. This project builds C++ binaries during image creation, so the least surprising target is:

- AMI: Ubuntu Server 24.04 LTS x86_64
- Instance family: burstable general purpose is fine for a personal project
- Lowest-budget read-heavy size: t3.small, only if you mainly browse existing artifacts and avoid frequent full-market builds on the server
- Start size for a balanced single-host deployment: t3.large
- Better size if you expect repeated full-HK builds or multiple concurrent sessions: t3.xlarge

Why the cheaper size is only conditional:

- this repository currently runs the API, PostgreSQL, build orchestration, and C++ matrix tools on the same host
- a small burstable instance can be acceptable for a personal demo or light read traffic, but it is not a comfortable target for repeated large HK build generation
- if you want the cheapest possible setup, prebuild artifacts locally whenever possible and let the cloud host focus on serving and light queue work

Why not arm64 first:

- your local toolchain and most Docker examples in this repository implicitly assume the common x86_64 path
- C++ and native dependency surprises are less likely on x86_64
- troubleshooting is easier when you are mirroring the most common Linux build target

### EBS

Do not use the default tiny root disk if you plan to keep artifacts locally.

Recommended gp3 sizes:

- minimum practical size: 80 GB
- safer personal-project size: 120 GB
- if you expect many build series and slow cleanup: 150 GB to 200 GB

If S3 becomes the primary artifact store and the EC2 host only keeps a temporary cache, you can size smaller:

- tight budget root disk: 30 GB to 40 GB
- safer budget root disk: 50 GB to 60 GB

Why:

- PostgreSQL data lives locally in this first deployment
- build artifacts stay on local disk for online queries
- Docker image layers, pnpm cache, and cloned repository also consume space

### S3

Create one bucket for build artifacts.

Recommended settings:

- Bucket type: general purpose bucket
- Storage class: Standard at first, or Intelligent-Tiering if you prefer hands-off cost control
- Versioning: optional; enable it if you want safer recovery, leave it off if you want the lowest bill and simpler lifecycle behavior
- Block all public access: enabled
- Bucket policy: none unless you have a very specific sharing use case

This repository now supports S3-primary build artifacts. Enable it by setting ARTIFACT_STORAGE_BACKEND=s3 and filling in AWS_REGION, S3_ARTIFACT_BUCKET, and optionally S3_ARTIFACT_PREFIX.

If you want S3 to be the source of truth for artifacts, do not treat it as a simple configuration flip. The current code still assumes local files for several runtime paths.

The practical low-cost target is:

- S3 as the source of truth for build-run bundles
- a small local cache directory on EC2 for matrix.bsm files that need to be queried by the C++ tools
- presigned download URLs for direct browser downloads

That model reduces EBS pressure without forcing you to rewrite the C++ query layer immediately.

## 1A. Free-tier-first reality check

If you are optimizing for the lowest possible bill, design for "very low spend" rather than "permanently free".

Important AWS pricing realities:

- as of the current AWS Free Tier model shown on the AWS free page, new accounts receive service credits rather than a forever-free production environment
- the current public AWS Free Tier page describes up to 200 USD in credits for new customers, with a free plan period and an expiry window for those credits
- the current EC2 pricing page also states that public IPv4 and Elastic IP usage are billable, so you should not assume a public IP is free forever
- the current EC2 pricing page also shows 100 GB per month of free data transfer out to the internet across AWS services and regions, which helps small personal projects but should not be treated as infinite

For a personal project, the main cost-control rules are:

1. use one EC2 instance only
2. do not add an ALB, NAT gateway, RDS, or CloudFront unless you have a clear reason
3. buy your domain outside AWS if that is cheaper for you
4. keep one private S3 bucket only
5. disable S3 versioning unless you truly need rollback safety
6. add billing alarms on day one
7. prune or archive old artifacts aggressively

## 1B. What S3-primary support means in the current implementation

The current implementation supports this runtime model:

1. a build is created in a temporary local working directory
2. on success, matrix.bsm, preview.json, and manifest.json are uploaded to S3
3. the artifact row is stored as storageKind=s3 with storageBucket and storagePrefix filled in
4. preview.json is read directly from S3 for build detail pages
5. /build-runs/:id/download redirects to a presigned S3 URL when the artifact is stored in S3
6. matrix.bsm is downloaded to a local cache directory on demand before compare, exposure, pair-divergence, structure, or matrix query flows run through the C++ binaries
7. analysis-run records still remain on the local filesystem

That gives you most of the EBS savings of S3-primary storage without forcing a rewrite of the C++ query layer.

### Recommended low-cost implementation shape

Use this pattern first:

- build bundle is created in a temporary local working directory
- after build success, all three files are uploaded to S3
- database artifact row is marked as s3 with storageBucket and storagePrefix filled in
- preview and manifest are read directly from S3
- matrix.bsm is lazily downloaded from S3 to a cache directory only when compare, exposure, pair-divergence, structure, or download requests need it
- the cache uses LRU or age-based cleanup so the EC2 disk stays small

This is much cheaper than keeping every build online on EBS, while still fitting the current C++ query design.

### Cheapest acceptable storage-class strategy

For runtime-active artifacts, keep them in S3 Standard first.

Why:

- it is the simplest behaviorally
- it avoids restore delays
- it avoids the minimum-duration and retrieval patterns of colder tiers for the active path

Only after the system is stable should you consider lifecycle rules, for example:

- keep recent active build bundles in Standard
- transition older bundles that you rarely query to a colder class
- or delete old bundles after exporting what you need

Do not move runtime-active matrix files into Glacier classes unless you are willing to accept restore latency and a more complex query path.

## 2. Production architecture

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

Alternative S3-primary shape:

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

Directory layout on the EC2 host:

```text
/opt/risk-atlas/app              git clone of this repository
/var/www/risk-atlas              built frontend files served by Nginx
/var/lib/risk-atlas/postgres     PostgreSQL data directory
/var/lib/risk-atlas/artifacts    build-runs and analysis-runs
/var/www/certbot                 ACME challenge directory for Let's Encrypt
```

## 3. AWS resources to create before logging into the server

### Security group

Create one security group for the EC2 instance.

Inbound rules:

- TCP 22 from your own IP only
- TCP 80 from 0.0.0.0/0
- TCP 443 from 0.0.0.0/0

Do not open PostgreSQL publicly.

Outbound rules:

- default allow all is fine for a personal project

### Elastic IP

Allocate one Elastic IP and associate it with the instance.

Why:

- your DNS A record should point to a stable public IPv4 address
- it avoids rebuilding DNS each time the instance restarts

### IAM role for S3 artifact access

Attach an EC2 instance role with the minimum S3 permissions needed for runtime artifact reads and writes.

Example policy:

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

If you do not want delete permissions, remove s3:DeleteObject and keep S3_SYNC_DELETE=0 in the environment file.

## 4. Domain purchase and DNS

For a lightweight personal project, use any low-friction registrar you already trust.

Good low-friction choices:

- Cloudflare Registrar
- Porkbun
- Namecheap

Recommended DNS records:

- A record: @ -> your Elastic IP
- A record: www -> your Elastic IP, or redirect www to the apex domain later

You only need AAAA if you explicitly configure IPv6 on the instance and in the security group.

## 5. Launch the EC2 instance

Recommended launch choices:

- OS: Ubuntu Server 24.04 LTS x86_64
- Instance size on the lowest budget: t3.small only for read-heavy or light-use scenarios
- Instance size for a more realistic all-in-one host: t3.large
- Root disk: gp3 120 GB
- Auto-assign public IP: yes, then replace with Elastic IP after launch
- IAM role: attach the S3 artifact role now
- Security group: the one described above

If you implement S3-primary artifact storage with a local matrix cache, you can reduce the root disk recommendation to 30 GB to 60 GB depending on how aggressively you clean the cache.

After the instance is reachable:

```bash
ssh ubuntu@YOUR_ELASTIC_IP
```

## 6. First-time bootstrap on a clean EC2 host

This repository provides a bootstrap script in this directory.

On the server:

```bash
sudo mkdir -p /opt/risk-atlas
sudo chown ubuntu:ubuntu /opt/risk-atlas
cd /opt/risk-atlas
git clone --recursive https://github.com/YongzeYang/Risk-Atlas-A-Market-Relationship-Artifact-Platform app
cd app
sudo DEPLOY_USER=ubuntu bash aws/scripts/bootstrap-ec2.sh
```

What the bootstrap script installs:

- Docker Engine
- Docker Compose plugin
- Nginx
- Certbot and the Nginx Certbot plugin
- AWS CLI
- Node.js 20
- pnpm via Corepack
- CMake, build-essential, git, rsync, jq, gettext-base

After bootstrap, log out once and SSH back in so your user picks up Docker group membership.

## 7. Configure the production environment file

Copy the example file:

```bash
cd /opt/risk-atlas/app
cp aws/.env.production.example aws/.env.production
```

Edit it carefully.

Most important fields:

- DOMAIN_NAME: your final public domain
- DOMAIN_SERVER_NAMES: space-separated names passed to Nginx server_name; keep this equal to DOMAIN_NAME unless you also want aliases such as www
- LETSENCRYPT_EMAIL: email used for Let's Encrypt notices
- WEB_ROOT_DIR: host directory that Nginx serves
- POSTGRES_DATA_DIR: host directory that persists PostgreSQL data
- ARTIFACT_ROOT_DIR: host directory for temporary build bundles and analysis-run records
- ARTIFACT_CACHE_DIR: host directory for matrix.bsm cache files when S3 storage is enabled
- ARTIFACT_STORAGE_BACKEND: set this to s3 for the budget-first deployment model
- DATABASE_URL: connection string used by the API container
- CORS_ALLOWED_ORIGINS: set this to https://your-domain
- VITE_API_BASE_URL: leave this blank for same-origin deployment
- RISK_ATLAS_INVITE_CODES and RISK_ATLAS_INVITE_SALT: replace the demo defaults
- S3_ARTIFACT_BUCKET and AWS_REGION: required for S3 artifact storage
- S3_ARTIFACT_PREFIX: optional namespace such as prod
- S3_SIGNED_URL_TTL_SECONDS: lifetime of presigned build download URLs

For this deployment, keep VITE_API_BASE_URL blank.

Why:

- the frontend will call /datasets, /build-runs, /analysis-runs, /docs, and /health on the same origin
- Nginx will proxy those paths to the API container
- this avoids a second API subdomain and avoids unnecessary CORS complexity

## 8. First deployment

Run the provided deployment script:

```bash
cd /opt/risk-atlas/app
bash aws/scripts/deploy-ec2.sh
```

What the deploy script does:

1. loads aws/.env.production
2. updates the git submodule checkout
3. installs workspace dependencies with pnpm
4. builds the frontend with production Vite variables
5. publishes the frontend dist files into WEB_ROOT_DIR
6. builds the production API Docker image
7. starts PostgreSQL with Docker Compose
8. runs Prisma migrate deploy inside the API image
9. optionally runs the seed step if RUN_SEED_ON_DEPLOY=1
10. starts or updates the API container with either local_fs or s3 artifact mode depending on ARTIFACT_STORAGE_BACKEND
11. renders the Nginx site config from the templates in aws/nginx
12. reloads Nginx
13. optionally runs the S3 artifact sync if SYNC_ARTIFACTS_ON_DEPLOY=1

### Seed behavior

If this is the first deploy and you want the seed script to run automatically, set:

```dotenv
RUN_SEED_ON_DEPLOY=1
```

Then run the deploy script once.

After the first successful seed, set it back to 0 unless you intentionally want to rerun it.

## 9. HTTPS with Let's Encrypt

### Step 1: deploy the HTTP-only Nginx config

The deploy script automatically renders the HTTP template when no certificate exists yet.

At this point, verify:

```bash
curl http://YOUR_DOMAIN/health
curl http://YOUR_DOMAIN/docs
```

### Step 2: issue the certificate

Once DNS is already pointing to the Elastic IP and port 80 is reachable:

```bash
sudo certbot --nginx -d YOUR_DOMAIN -m YOUR_EMAIL --agree-tos --no-eff-email
```

If you also want www:

Set this first in aws/.env.production:

```dotenv
DOMAIN_SERVER_NAMES=YOUR_DOMAIN www.YOUR_DOMAIN
```

Then request the certificate:

```bash
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN -m YOUR_EMAIL --agree-tos --no-eff-email
```

### Step 3: switch to the HTTPS site template

After Certbot has created the certificate files, rerun the deploy script:

```bash
bash aws/scripts/deploy-ec2.sh
```

The deploy script detects the certificate files and switches from aws/nginx/risk-atlas-http.conf to aws/nginx/risk-atlas-https.conf automatically.

### Step 4: verify renewal

```bash
sudo certbot renew --dry-run
```

## 10. S3 bucket setup for artifact storage

### Create the bucket

In the S3 console:

- create a private bucket
- keep block public access enabled
- choose the same region as the EC2 instance unless you have a clear reason not to

Suggested lifecycle rule:

- keep current versions in Standard for 30 days
- transition older objects to Standard-IA or Intelligent-Tiering if you want lower ongoing cost
- optionally move very old artifacts to Glacier Instant Retrieval or Glacier Flexible Retrieval

### Manual sync

After aws/.env.production is filled in:

```bash
cd /opt/risk-atlas/app
bash aws/scripts/sync-artifacts-to-s3.sh
```

If ARTIFACT_STORAGE_BACKEND=local_fs, this syncs build-runs into S3.

If ARTIFACT_STORAGE_BACKEND=s3, build-runs are already written to S3 directly, so the script skips build-runs and only becomes useful for optional analysis-run backup.

If you set SYNC_ANALYSIS_RUNS_TO_S3=1, it also syncs analysis-runs.

### Scheduled sync with systemd timer

Install the provided unit files:

```bash
sudo cp aws/systemd/risk-atlas-artifact-sync.service /etc/systemd/system/
sudo cp aws/systemd/risk-atlas-artifact-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now risk-atlas-artifact-sync.timer
sudo systemctl status risk-atlas-artifact-sync.timer
```

The timer runs every 30 minutes.

## 10A. If you want S3-primary artifacts instead of backup-only

That is now the recommended low-cost deployment mode.

For a budget-first personal deployment, this is the best version of S3-primary storage:

1. keep one private bucket
2. keep one prefix such as prod/build-runs
3. use the EC2 instance role instead of long-lived access keys
4. return presigned URLs for build downloads instead of proxying the whole file through Node when possible
5. cache only the matrix files that are actively queried
6. delete or age out cache files automatically

What stays local even in this mode:

- PostgreSQL
- the frontend build output served by Nginx
- a small cache for matrix.bsm files used by the C++ query binary
- optionally analysis-run records, unless you decide to redesign that layer too

What this saves you:

- much smaller EBS requirement
- less risk of disk fill from build series
- easier long-term artifact retention

What it does not save you from:

- EC2 compute costs for running the API and build jobs
- S3 request charges for PUT, GET, and LIST activity
- public IPv4 and domain-related costs

## 11. Required config changes from local development

These are the settings you must treat differently from local development:

- NODE_ENV should be production
- VITE_API_BASE_URL should stay blank for same-origin deployment
- CORS_ALLOWED_ORIGINS should be your HTTPS domain, not localhost
- DATABASE_URL should target the postgres Docker service on the EC2 host deployment
- ARTIFACT_ROOT_DIR should point to the persistent host mount, not a relative local path
- BSM_WRITER_BIN and BSM_QUERY_BIN should use the fixed container paths from the production image
- PostgreSQL must not be exposed publicly
- invite codes and salt must not stay on the demo defaults

## 12. Useful operating commands

### Check Docker services

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production ps
```

### API logs

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production logs -f api
```

### PostgreSQL logs

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production logs -f postgres
```

### Restart only the API

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production restart api
```

### Re-run database migrations manually

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production run --rm --no-deps api npx prisma migrate deploy
```

### Check Nginx config

```bash
sudo nginx -t
```

### Reload Nginx after a config change

```bash
sudo systemctl reload nginx
```

### Smoke-check the public site

```bash
curl -I https://YOUR_DOMAIN
curl https://YOUR_DOMAIN/health
curl -I https://YOUR_DOMAIN/docs
```

## 13. PostgreSQL backups

This first deployment keeps PostgreSQL on the same EC2 host, so you should have a simple backup habit.

Manual dump example:

```bash
docker compose -f aws/docker-compose.ec2.yml --env-file aws/.env.production exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > risk-atlas-$(date +%F).sql
```

For a personal project, even one daily dump copied to S3 is much better than having nothing.

## 14. Current storage behavior and remaining boundary

The current application now supports S3-primary build artifacts, but one boundary still matters:

- analysis-run records are still filesystem-backed

For build artifacts, the effective behavior is:

- preview.json and manifest metadata can live in S3
- matrix downloads can use presigned S3 URLs
- matrix queries still need a local cached file because the C++ tooling is file-path based

That is a good budget/performance tradeoff for this repository.

## 15. Suggested future upgrades after the first stable release

Once the single-host version is stable, the next improvements with the best payoff are:

1. move PostgreSQL to Amazon RDS
2. make S3 the primary artifact store with local caching for matrix queries
3. add CI/CD for image build and deploy
4. add CloudWatch or another log pipeline
5. add artifact retention and pruning rules on the EC2 disk

## 16. Recommended rollout checklist

Before public launch:

- DNS A record points to the Elastic IP
- Nginx serves the frontend correctly
- /health returns 200 through Nginx
- /docs works through Nginx
- a real build-run succeeds on EC2
- artifacts appear under ARTIFACT_ROOT_DIR/build-runs
- S3 sync uploads the build-run artifacts
- certbot renew --dry-run passes
- reboot the EC2 instance once and confirm Docker and Nginx recover automatically

If you want the simplest possible first release, do not optimize prematurely. Keep the first cloud deployment boring, explicit, and easy to debug.

#  MVP Scope

## Goal
Build and demo a financial pairwise artifact platform on top of bsm.

## In Scope
- Import one curated Hong Kong EOD dataset
- Select universe, as-of date, window, score method
- Trigger one offline build job
- Generate `.bsm` + `manifest.json`
- Upload artifacts to S3
- Register metadata in PostgreSQL
- Query artifact list, build detail, pair score, top-k neighbors, heatmap subset

## Out of Scope
- Auth
- Real-time data
- Compare / drift
- Retry / idempotency
- Dashboard / alerting
- ECS / RDS / Batch / Step Functions
- Custom universe editor
- Fancy charts

## Hard Limits
- One market only: Hong Kong equities
- One CSV format only: date,symbol,adj_close
- Max universe size: 50
- Max heatmap symbols: 12
- One build at a time
- Two score methods only: pearson_corr, cosine_similarity
#!/usr/bin/env bash
set -euo pipefail
set -a
source /srv/cps-data/app/.env.production
set +a
stamp=$(date +%Y%m%d-%H%M%S)
pg_dump "$DATABASE_URL" -Fc -f "/srv/cps-data/backups/cps-${stamp}.dump"
find /srv/cps-data/backups -type f -name 'cps-*.dump' -mtime +14 -delete

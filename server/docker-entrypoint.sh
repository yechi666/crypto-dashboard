#!/bin/sh
set -e

# Non-destructive: applies any pending migrations and exits. Safe to run on
# every container start, including against a DB that's already up to date.
npx prisma migrate deploy --schema server/prisma/schema.prisma

exec node server/dist/index.js

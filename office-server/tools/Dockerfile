# Node 22 plus the PostgreSQL client (any version ≥ 17 works with the PostgreSQL 17 database): runs migrations, backups, imports and the PDF file service.
FROM node:22-alpine
RUN apk add --no-cache postgresql-client tzdata
WORKDIR /repo

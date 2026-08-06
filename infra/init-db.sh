#!/bin/sh
# AD-14: database-per-service. One database per scaffolded service, created on first
# boot of the postgres container. Add a line here each time a new service is scaffolded
# (AD-1's scaffold-on-demand) and needs a database of its own.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE usavvy_core;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname usavvy_core -c 'CREATE EXTENSION IF NOT EXISTS vector;'

# Story 2.1 (Epic 2 start): courses (Course/Module/Topic/Concept, AD-14).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE usavvy_courses;
EOSQL

# Story 2.7: ingestion (UploadedDocument/ContentChunk, AD-14).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE usavvy_ingestion;
EOSQL

# Story 3.1 (Epic 3 start): board-orchestration (LearningSession/Beat/SessionEvent, AD-14).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE usavvy_board_orchestration;
EOSQL

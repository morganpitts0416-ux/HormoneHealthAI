---
name: Isolated PostgreSQL test safety
description: Inherited connection defaults can target the wrong identity in fresh local test clusters.
---

Use an explicit test database/user and a fresh private Unix socket for synthetic
PostgreSQL tests; never rely on inherited libpq connection defaults.

**Why:** This workspace inherits PostgreSQL defaults intended for an external
datastore. A fresh cluster initialized under the OS user did not have the
inherited client role, so `createdb` failed despite the local cluster running.
Implicit connection defaults also risk targeting a non-test database.

**How to apply:** Initialize with an explicit synthetic role, specify that role
and database in every client, disable TCP, constrain the socket to the newly
created private temporary directory, and clean up the isolated cluster afterward.
Never use existing application database URLs for these tests.

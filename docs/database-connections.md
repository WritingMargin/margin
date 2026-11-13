# PostgreSQL connection budget

Margin limits each engine process to 10 PostgreSQL query connections by default.
When all are busy, queries wait for a free connection and respect request
cancellation. Idle connections are limited to two, expire after five minutes,
and are recycled after a maximum lifetime of 30 minutes.

Set `MARGIN_DB_MAX_OPEN_CONNS` to a positive integer to change the query limit.
SQLite continues to use one connection and ignores this PostgreSQL setting.

Live article streams share one additional PostgreSQL LISTEN connection per
engine process. It closes when the last stream disconnects. Notifications stay
isolated by publication schema and article; reconnecting streams catch up with
the current revision. The shared notification channel requires all engine
replicas to run the same release; restart existing replicas when upgrading.

Budget up to `MARGIN_DB_MAX_OPEN_CONNS + 1` connections for each engine replica,
including separate publications using the same PostgreSQL server. Leave room
for other applications, maintenance tools, and PostgreSQL's reserved slots.
This setting cannot prevent another application from exhausting a shared server.

## Diagnosing exhausted connections

PostgreSQL error `53300`, including “remaining connection slots are reserved”,
means the server has no ordinary connection slots available. With a database
administrator connection, inspect the configured capacity and its consumers:

```sql
SHOW max_connections;
SHOW superuser_reserved_connections;
SELECT datname, usename, application_name, state, count(*) AS connections
FROM pg_stat_activity
GROUP BY datname, usename, application_name, state
ORDER BY connections DESC;
```

After updating Margin or changing its pool setting, recreate the app container
so the new binary and environment take effect. For the documented blog deployment:

```sh
docker compose -p margin-blog pull app
docker compose -p margin-blog up -d --no-deps --force-recreate app
```

Keep the deployment's existing image pin, database, storage volumes, and secrets.
If the image is pinned, update the pin to the release containing the fix first.

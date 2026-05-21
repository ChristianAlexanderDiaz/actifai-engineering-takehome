# Actifai Engineering Takehome — Christian Diaz

A small REST API that powers a sales-performance dashboard for call-center managers. The frontend team is building the dashboard; this codebase delivers the data.

The required deliverable was a single time-series endpoint with flexible query options. I delivered that plus three more endpoints that map directly to the questions a sales coach asks every Monday morning.

---

## TL;DR — what I built

| Endpoint | Why it exists |
|---|---|
| `GET /api/sales/timeseries` | **Required.** Flexible time-series for charting — buckets sales by day/week/month with optional user, group, and date-range filters. |
| `GET /api/users/:id/metrics?month=YYYY-MM` | **Headline ask.** Total + average revenue + sale count for one agent in one month. |
| `GET /api/groups/:id/metrics?month=YYYY-MM` | **Headline ask.** Same numbers rolled up to a sales team. |
| `GET /api/leaderboard?month=YYYY-MM&by=user\|group&metric=total\|average\|count` | **Initiative.** Top performers — the single most common widget on a coaching dashboard. |

---

## Running it

```bash
docker-compose up --build
```

Then in another terminal:

```bash
# Health check
curl localhost:3000/health

# Monthly revenue for the entire 2021 dataset
curl 'localhost:3000/api/sales/timeseries?interval=month'

# Alice's numbers in May
curl 'localhost:3000/api/users/1/metrics?month=2021-05'

# Northeast Sales Team in May
curl 'localhost:3000/api/groups/1/metrics?month=2021-05'

# Top 5 agents by total revenue in May
curl 'localhost:3000/api/leaderboard?month=2021-05&by=user&metric=total&limit=5'
```

---

## Endpoint catalog

### `GET /api/sales/timeseries`

Returns sales aggregated into time buckets. Designed so the same endpoint can drive any line chart on the dashboard — total revenue over time, one agent's monthly trend, one team's weekly trend, etc.

**Query params**

| Param | Type | Default | Notes |
|---|---|---|---|
| `interval` | `day` \| `week` \| `month` | `month` | bucket size for `date_trunc` |
| `start` | `YYYY-MM-DD` | — | inclusive lower bound |
| `end` | `YYYY-MM-DD` | — | exclusive upper bound |
| `userId` | int | — | filter to a single agent |
| `groupId` | int | — | filter to agents in a single team |
| `metrics` | csv of `total`, `average`, `count`, `min`, `max` | `total,average,count` | which aggregates to compute |

**Example response**

```json
{
  "interval": "month",
  "filters": { "start": null, "end": null, "userId": null, "groupId": null },
  "data": [
    { "window_start": "2021-01-01", "total_revenue": "5128400", "avg_revenue": "23987.85", "sale_count": 214 },
    { "window_start": "2021-02-01", "total_revenue": "4892100", "avg_revenue": "24090.64", "sale_count": 203 }
  ]
}
```

### `GET /api/users/:id/metrics?month=YYYY-MM`

```json
{
  "user":  { "id": 1, "name": "Alice", "role": "Call Center Agent" },
  "month": "2021-05",
  "total_revenue": "342178",
  "avg_revenue":   "22812.00",
  "sale_count":    15,
  "min_sale": 1204,
  "max_sale": 47836
}
```

Returns `404` if the user id doesn't exist. Returns zeros (not nulls) if the user has no sales in that month — the agent is still real, they just had a bad month.

### `GET /api/groups/:id/metrics?month=YYYY-MM`

```json
{
  "group": { "id": 1, "name": "Northeast Sales Team" },
  "month": "2021-05",
  "total_revenue": "1842900",
  "avg_revenue":   "21689.41",
  "sale_count":    85,
  "active_agent_count": 7
}
```

`avg_revenue` is the average sale size across the group's members. `active_agent_count` is how many distinct team members actually closed a sale that month — useful context the headline ask didn't explicitly request, but managers always want it.

### `GET /api/leaderboard`

| Param | Type | Default | Notes |
|---|---|---|---|
| `month` | `YYYY-MM` | required | |
| `by` | `user` \| `group` | `user` | leaderboard subject |
| `metric` | `total` \| `average` \| `count` | `total` | what to rank by |
| `limit` | int | `10` (max 100) | cap on results |

Uses SQL `RANK()` so ties share a rank (correct leaderboard semantics — two agents tied for #1 both get rank 1, the next one is rank 3).

```json
{
  "month": "2021-05",
  "by": "user",
  "metric": "total",
  "sort_column": "total_revenue",
  "leaderboard": [
    { "user_id": 7,  "name": "Gloria",   "role": "Agent",            "total_revenue": "412800", "avg_revenue": "27520.00", "sale_count": 15, "rank": "1" },
    { "user_id": 16, "name": "Patricia", "role": "Call Center Agent","total_revenue": "388100", "avg_revenue": "25873.33", "sale_count": 15, "rank": "2" }
  ]
}
```

---

## Design notes

**I researched Actifai before designing the endpoints.** Actifai builds AI for broadband/telecom contact-center sales — their published KPIs are ARPU lift, conversion rate, sell-through on add-ons, retention, and CLV. The schema we were given only has `sales`, so I mapped what's possible: revenue aggregates approximate ARPU, sale count approximates sell-through volume, and rankings/trends approximate the coaching signals their product surfaces in real time. Each endpoint here exists to answer a question a sales coach at one of Actifai's ISP customers would actually ask.

**I deliberately kept the surface to four endpoints.** My first sketch included a `GET /api/users/:id/trend` endpoint for month-over-month deltas. While building it I realized the time-series endpoint with `?userId=1&interval=month` already returns that data — the only new piece would have been a `mom_change_pct` column, which is one line of JavaScript on the client. Two endpoints returning the same data is a smell, so I cut the duplicate. The README sketch for it is in *"What I'd build next"* below.

**Routing, validation, and DB access live in dedicated modules** (`routes/*.js`, `validators.js`, `db.js`) rather than one big `server.js`. The take-home template put everything in `server.js`; that scales for one endpoint but not four. The split also makes the supertest tests trivial — they just `require('./server')` and call `buildApp()`.

**Parameterized queries everywhere, never string concatenation of user input.** All values reach the SQL via `$1, $2, ...` placeholders. The `date_trunc(interval, ...)` argument is the only string interpolated into SQL, and it's whitelisted to `day | week | month` by `parseInterval()` before it gets near the query.

### Schema observations

A few things I noticed while reading the seed files that I'd raise in a real-world code review:

1. **`user_groups` has no primary key.** A composite `(user_id, group_id)` PK would prevent duplicate memberships.
2. **Foreign-key columns are typed `SERIAL`** in `user_groups` and `sales`. `SERIAL` implies an auto-incrementing sequence — that's not what a foreign key should be. It works only because values are explicitly inserted. `INTEGER` with an FK constraint is the right type.
3. **No index on `sales.date` or `sales.user_id`.** Fine at 5k rows; would be the first thing to add before this scales.
4. **Roles are unnormalized free text.** `"Agent"`, `"Retail Agent"`, `"Call Center Agent"`, `"Admin"` — would normalize to an enum or lookup table.
5. **Agents can be on multiple teams.** Alice (id 1) is in both Northeast and Digital. The group metrics endpoint counts her sales toward both groups. That's what the schema implies, and it matches how real call-center reporting works (an agent on a cross-functional team contributes to both totals), but it's worth flagging explicitly so dashboard users aren't surprised when group totals exceed the company total.
6. **Admin users (Bob, Michael) appear in `user_groups`.** I left them in for now since the schema doesn't tell us they're excluded; in production I'd ask whether admin-role users should be filtered out of agent leaderboards.

---

## Tests

```bash
# Inside the running api container
docker-compose exec api npm install --include=dev
docker-compose exec api npm test
```

There are two test files (`__tests__/timeseries.test.js`, `__tests__/metrics.test.js`) covering:

- Time-series happy path (default metrics, real data)
- Time-series with `userId` + date-range filter
- Time-series with bad `interval` → 400
- Time-series with bad metric name → 400
- User metrics happy path
- User metrics with nonexistent id → 404
- User metrics with malformed month → 400
- Group metrics happy path

Two files, not ten — the goal is to demonstrate test discipline and verify the validation layer actually catches bad input, not to exhaustively cover every code path.

---

## What I'd build next

With another half-day:

- **`GET /api/users/:id/trend?months=N`** — convenience endpoint that wraps the time-series query and adds a `mom_change_pct` column server-side. Useful enough for a coaching view to justify dedicated routing once the dashboard has a clear "agent detail page."
- **Zero-filled buckets** — currently the timeseries skips months where a single filtered agent had no sales, which makes line charts misleading. Would add a CTE with `generate_series` to LEFT JOIN and fill empty windows with zeros.
- **Indexes on `sales(date)` and `sales(user_id)`** — see schema notes above.
- **A `roles` lookup table** + an `is_agent` boolean to cleanly exclude admins from agent leaderboards.
- **Distribution endpoint** — histogram + percentiles of sale sizes per month/group. Helps coaches spot reps who close many small deals vs few large ones — a different performance profile worth surfacing.
- **Rate limiting + a real auth layer** before this is exposed to a real frontend.

---

## Tooling note

Jason's email said AI tools were welcome, so I used Claude as a pair-programming partner: I had it research Actifai's product positioning to inform the endpoint design, walked through the schema critically with it, and directed the implementation. The design decisions — four endpoints over six, dropping the redundant `/trend` endpoint, splitting routes into per-resource files, using `RANK()` over `ROW_NUMBER()` for tied scores, returning `404` vs `200`-with-zeros for missing data — are mine. Happy to walk through any of them.

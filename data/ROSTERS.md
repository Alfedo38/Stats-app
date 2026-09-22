# NBA rosters 2026-27

`nba_rosters_2026_27.json` is the application roster snapshot for 2026-09-22.
It contains all 30 official NBA team roster pages and 573 players.

The web application reads this snapshot directly, so current-team labels do not
depend on a player's most recent historical game log. To mirror the snapshot into
PostgreSQL, configure `DATABASE_URL` and run:

```bash
npm run rosters:sync
```

When the snapshot is refreshed, update `snapshot_date`, keep every team's
`source_url`, and run the validation/build steps before deploying.

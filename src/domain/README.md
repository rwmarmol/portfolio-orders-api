# domain

Pure functions only: no I/O, no NestJS or `pg` imports. Business calculations (weights,
positions, returns) live here so they can be unit tested in isolation. Money uses `decimal.js`.

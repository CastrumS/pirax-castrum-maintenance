# Active implementation lessons

- **Own the connection, not the listening port — 2026-09-26:** local service discovery can open unrelated sockets on a test listener. Assert cleanup against the real client's endpoint and close event; never weaken deadlines to accommodate unrelated peers. [Case and evidence](history/2026-09-26-form-check.md).

# Cadence Packages

Shared code used by every Cadence app. Packages have no build step and don't depend on any app or framework.

| Package | Does |
|---|---|
| [`@cadence/domain`](./domain) | Planning rules: time, repeats, reminders, ordering |
| [`@cadence/contracts`](./contracts) | The shape of everything the API sends and receives (Zod) |
| [`@cadence/nlp`](./nlp) | Understands typed phrases like "gym tomorrow 6pm" |
| [`@cadence/search`](./search) | Search and ranking |
| [`@cadence/geometry`](./geometry) | Drawing math for the loading scene and website |
| [`tests`](./tests) | Tests for all of the above |

See also: [Workspace](../README.md)

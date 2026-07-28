# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (Linear, team GTM — see `issue-tracker.md`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

All five already exist as labels on the GTM team — apply them by name, don't create new ones.

The team also carries an older, overlapping vocabulary (`exec/agent-ready`, `exec/human`, `agent-ready`, `agent-assist`, `afk-ready`). The canonical five above are the ones these skills read and write; leave the `exec/*` family alone unless a human applies it.

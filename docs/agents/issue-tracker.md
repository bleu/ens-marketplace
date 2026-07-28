# Issue tracker: Linear

Issues and PRDs for this repo live in Linear, not GitHub Issues. Use the Linear MCP
tools (`mcp__claude_ai_Linear__*` in Claude Code) for all operations.

## Where issues go

- **Workspace**: `bleu-builders`
- **Team**: `GTM` (id `2923883f-9d0a-496c-aab5-a2ca730232d2`)
- **Project**: `web3-deals` — https://linear.app/bleu-builders/project/web3-deals-a5e6ddb5d475
  (id `b2f4a7b2-7046-4230-b35c-0ab23ca52fd4`)
- **Milestone**: `ENS Market Place` (id `a74b2dc0-e6d2-4b79-8eb1-f461dcc1c530`)

Every issue created for this repo goes on team GTM, in the web3-deals project, under
the ENS Market Place milestone. Set all three on creation; don't leave issues
project-less for later sorting.

## Conventions

- **Create an issue**: `save_issue` with `team: "GTM"`, `project: "web3-deals"`,
  `milestone: "ENS Market Place"`, a title, and a markdown description. Pass label
  names via `labels`.
- **Read an issue**: `get_issue` by identifier (e.g. `GTM-123`); `list_comments` for
  the discussion.
- **List issues**: `list_issues` filtered by `project: "web3-deals"` (add `milestone`
  or `labels` filters as needed).
- **Comment**: `save_comment` with the issue id.
- **Apply / remove labels**: `save_issue` with the updated `labels` list (it replaces
  the set, so read the current labels first and re-send the full list).
- **Close**: `save_issue` setting `state` to `Done` (or `Canceled` for wontfix), with
  a closing comment via `save_comment`.

## When a skill says "publish to the issue tracker"

Create a Linear issue per the conventions above.

## When a skill says "fetch the relevant ticket"

`get_issue` + `list_comments` for the given identifier.

# Environment Variable Proxy

Encrypted development bundles, service-based sharing UI, access history, and CLI. No production environments or deployment synchronization.

An organization owner saves a complete variable bundle using their existing browser session and the same-origin API:
PUT /api/orgs/:org/environments/development/:project
Body: {"API_KEY":"example","SERVICE_URL":"https://example.com"}

Only variable names are returned. All values are encrypted using the existing server encryption key. Replacing a bundle removes omitted variables.

The owner grants an agent selected names:
PUT /api/orgs/:org/environments/development/:project/grants
Body: {"agentId":"agent-id","names":["API_KEY","SERVICE_URL"]}

An empty names list revokes access. Grants are explicit, with no inherited connection defaults. Agents must belong to the same organization.

Open **Environments** for a service/environment overview: key count, people with access, last retrieval and successful retrievals over the full last 30 days. There is no Agents column. Opening a service expands its variables inline beneath the row; opening another service closes the previous one. Each variable expands separately for explicit value reveal and inline editing. Closing a variable or changing services clears revealed values. The Share dialog grants selected keys to people or agents; only the organization owner can change keys or permissions. Members can reveal only explicitly shared keys.

Service recognition uses variable names and the existing catalog, never secret values. Owners can correct the service and display name. Unrecognized keys are grouped under Other configuration. Existing bundles remain intact and retain their CLI project identifiers.

Reveals require an authenticated, same-origin POST, recheck current membership and key grants, write an audit entry before delivery, and return Cache-Control: no-store. Values are held only in page memory and hidden on navigation, window blur or after one minute. Edits and sharing events are separate from retrieval counts. History shows the latest 100 relevant events; counts use database aggregation over the entire window. A request retrieving multiple keys counts once per affected service. No secret values are stored in audit entries.

Removing a key prunes both person and agent grants. Removing a membership deletes its person grants, so rejoining does not restore them. Revocation prevents future retrievals; already copied keys must be rotated at the vendor. Proxy cannot observe their subsequent external use.

The original bundle PUT and agent grant endpoints below remain available. The UI adds per-key editing without overwriting other keys. New endpoints: GET /environments/overview; PUT /environments/development/:project/keys; DELETE /environments/development/:project/keys/:name; PUT /environments/development/:project/sharing; POST /environments/development/:project/reveal; POST /environments/development/:project/history. All are under /api/orgs/:org.

## One connection for MCP tools and development variables

Connect the agent to Proxy through MCP once. The owner grants development keys to that same agent in Environments → Share. Tool permissions and variable grants stay separate: connecting alone grants no secrets.

Through the existing MCP script tool, start a task and use:

```js
await pap.environments(); // only allowed projects and names; no values
await pap.prepareEnvironment({project: 'example'});
```

The second call returns a `launcherUrl`, `url`, `project`, `names`, `expiresAt` and a single-use `token`. Download the launcher from that same Proxy instance into the development workspace. Run it with Node 20+:

```sh
node proxy.mjs run --url https://proxy.example.com --project example --handoff-stdin -- bun run dev
```

Supply the handoff token on stdin through the agent's terminal/process tool. Do not pass it in a URL or argument, log it, commit it, or save it as an environment variable. No CLI login or session cookie is required. The launcher fetches variables directly and injects them into the child process without writing a `.env` file. MCP receives key names and the short-lived capability, never variable values. The process and code it executes can read the values; child output is not redacted.

The handoff expires after five minutes and can be redeemed once. A new handoff replaces an earlier unused one for the same agent/project. It is bound to the originating MCP OAuth grant: disconnecting it deletes outstanding handoffs. Agent revocation and current key grants are checked again at redemption; the handoff cannot gain keys granted after issuance. Retrieval is audited. Already-running processes keep their received values. The handoff cannot call MCP tools or access other projects.

This requires an agent with both an MCP connection and a terminal in its development environment. A chat-only agent cannot start a local process. A client may need to refresh its MCP tool list after deployment to discover the new methods. The legacy login flow below remains supported.

## Legacy standalone CLI

Sign in once with an existing agent login:

`node scripts/proxy.mjs login --url https://proxy.example.com`

The password prompt is hidden. The CLI stores the session in a per-origin file under ~/.config/personal-agent-proxy with mode 0600. It does not store the password. Sessions expire after seven days; resetting or revoking the agent invalidates its sessions.

Runtime:
node scripts/proxy.mjs run --url https://proxy.example.com --project example --env development -- bun run dev

The session file contains the Cookie header from an existing agent login, not a password or a Set-Cookie header. Protect it with file mode 0600. Use --session-file to supply an existing session explicitly, for example in a cloud development environment.

The CLI fetches variables without printing them or writing an environment file, then injects them into the child process. Child output is inherited and is not redacted. Code running in that process can read its secrets.

Access attempts with valid project names and authenticated agents are recorded in EnvironmentAccess with names and outcome only. Raw values are not exposed as an MCP tool. Apply all migrations, including v070 for MCP handoffs, before use. Workload identity and dynamic credential rotation are not included in this development-only version. Deleting a variable removes its grants; adding that name later requires a new grant. Deleting an organization removes its bundles and audit history.

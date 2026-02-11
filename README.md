# anthropic-multi-auth

Multi-account Anthropic auth plugin for OpenCode with quota-aware load balancing.

## Features

- **Multi-account support**: Add multiple Anthropic accounts (Claude Pro/Max)
- **Quota-aware load balancing**: Automatically selects the account with the lowest quota utilization at session start
- **Sticky sessions**: Stays on the same account throughout a session for consistency
- **Automatic failover**: On 429 rate limit errors, automatically switches to the next available account
- **Token refresh**: Automatically refreshes OAuth tokens when expired
- **Account management**: List and remove accounts via interactive CLI
- **First-time migration**: Automatically imports accounts from OpenAuth if available

## Installation

Add the plugin to your OpenCode configuration in `opencode.json`:

```json
{
  "plugins": ["anthropic-multi-auth"]
}
```

## Setup

### Adding Accounts

Run the OpenCode auth flow to add accounts:

```bash
opencode auth login
```

When prompted, select **"Claude Pro/Max"** to authorize a new account. After successful authorization, you'll be asked if you want to add another account. Repeat this process to add multiple Anthropic accounts.

### Managing Accounts

To view and manage your configured accounts:

```bash
opencode auth login
```

Select **"Manage Accounts"** to see your accounts and remove ones you no longer need.

## How It Works

### Account Selection
When a session starts, the plugin:
1. Loads your saved accounts from `~/.config/opencode/anthropic-accounts.json`
2. Checks the quota usage API for each account
3. Selects the account with the lowest utilization
4. Marks it as the active account for the session

### Session Stickiness
Once an account is selected at session start, it remains active throughout the session. This ensures consistent behavior within a single session.

### Rate Limit Handling
If an API request returns a 429 (Too Many Requests) response:
1. The plugin waits the specified retry period
2. Automatically switches to the next available account
3. Retries the request with the new account
4. If all accounts are rate-limited, returns an error with the shortest wait time

### Token Refresh
When tokens expire (checked via the `expires` timestamp):
1. The plugin automatically refreshes the OAuth token
2. Saves the new credentials to storage
3. Syncs with OpenAuth to maintain consistency

### Account Storage
Accounts are stored at:
```
~/.config/opencode/anthropic-accounts.json
```

Each account includes:
- `access`: OAuth access token
- `refresh`: OAuth refresh token
- `expires`: Token expiration timestamp (milliseconds)
- `addedAt`: When the account was added
- `enabled`: Whether this account is active
- `email`: (optional) User email from OAuth
- `label`: (optional) Friendly name for the account

## Comparison with Builtin Auth

This plugin extends the OpenCode builtin `opencode-anthropic-auth` with:
- Multi-account support (builtin only supports one account)
- Quota-aware account selection (builtin doesn't consider quota)
- Automatic failover on rate limits (builtin doesn't switch accounts)

If no accounts are configured, the plugin falls back to the builtin auth plugin, so the plugin is fully backward compatible.

## Troubleshooting

### No accounts configured

**Symptom**: Plugin doesn't seem to be working.

**Solution**: Run `opencode auth login` and select "Claude Pro/Max" to add at least one account.

### All accounts rate-limited

**Symptom**: Error: "All accounts rate-limited. Shortest wait: Xs."

**Solution**: Wait the specified time before trying again. If this happens frequently, consider adding more accounts.

### Token refresh failures

**Symptom**: Error during session with 401/403 status codes.

**Solution**: 
1. Verify your refresh tokens haven't been revoked
2. Run `opencode auth login` → "Manage Accounts" to remove and re-add affected accounts
3. Make sure your internet connection is stable

### Plugin not loading

**Symptom**: Plugin doesn't appear to be active.

**Solution**:
1. Check `opencode.json` has the correct plugin name: `"anthropic-multi-auth"`
2. Run `bun install` (or `npm install`) to ensure dependencies are installed
3. Check OpenCode version is compatible (requires `@opencode-ai/plugin@^0.4.45`)

## License

MIT

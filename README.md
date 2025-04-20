# Auth0 Cloudflare Workers MCP Integration

## Features

- Auth0 authentication integration
- Secure session management with Workers KV
- Client-side user information display
- MCP endpoints for AI-powered features
- Server-Sent Events (SSE) endpoint for real-time communication

## Prerequisites

- Cloudflare account with Workers access
- Auth0 account and application
- Node.js and npm installed locally
- Wrangler CLI installed (`npm install -g wrangler`)

## Setup Instructions

### 1. Configure Auth0

1. Create a new Regular Web Application in your Auth0 dashboard
2. Configure the following in your application settings:
   - **Allowed Callback URLs**: `http://127.0.0.1:8787/auth` (for local development)
   - **Allowed Logout URLs**: `http://127.0.0.1:8787` (for local development) 
   - **Allowed Web Origins**: `http://127.0.0.1:8787` (for local development)
   - **Application Login URI**: Leave empty for local development (Auth0 requires HTTPS for this field)
3. Make note of your Auth0 domain, Client ID, and Client Secret

### 2. Configure Environment Variables

For local development, create a `.dev.vars` file in the project root with the following variables:

```
AUTH0_DOMAIN="your-auth0-domain.auth0.com"
AUTH0_CLIENT_ID="your-auth0-client-id"
AUTH0_CLIENT_SECRET="your-auth0-client-secret"
AUTH0_CALLBACK_URL="http://127.0.0.1:8787/auth"
SALT="random-secure-salt-value"
```

For production deployment, set these as secrets using Wrangler:

```bash
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_CLIENT_SECRET
wrangler secret put AUTH0_CALLBACK_URL
wrangler secret put SALT
```

### 3. Configure Workers KV

1. Create a new KV namespace using Wrangler:
   ```
   wrangler kv namespace create AUTH_STORE
   ```
   This will return an ID value.

2. Create a preview KV namespace for local development:
   ```
   wrangler kv namespace create AUTH_STORE --preview
   ```
   This will return a preview_id value.

3. Update the `wrangler.toml` file with your KV namespace IDs:
   ```toml
   kv_namespaces = [
     { binding = "AUTH_STORE", id = "your-kv-namespace-id", preview_id = "your-preview-id" }
   ]
   ```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Application

Start the local development server:

```bash
npm run dev
# or
npx wrangler dev
```

This will start the application at `http://127.0.0.1:8787`.

## Using the Application

1. Navigate to `http://127.0.0.1:8787` in your browser (or your deployed domain)
2. Click "Log In" to authenticate with Auth0
3. After successful authentication, you'll be redirected back to the application
4. Your profile information will be displayed
5. Click "Fetch Data via MCP" to test the MCP integration

### 6. Deploy

To deploy the application to Cloudflare Workers (optional):

```bash
npm run deploy
# or
wrangler deploy
```

## Project Structure

```
auth0-cloudflare-poc/
├── public/              # Static assets
├── src/
│   ├── auth0.js         # Auth0 integration
│   ├── index.js         # Main application entry point
│   ├── mcp-agent.js     # MCP agent implementation
│   └── utils.js         # Utility functions
├── wrangler.toml        # Cloudflare Workers configuration
├── .dev.vars.example    # Local environment variables (which you will populate)
├── .gitignore           # Git ignore file
├── package.json         # Project dependencies
└── README.md            # Project documentation
```

## MCP Integration

The application provides two MCP-related endpoints:

1. `/mcp` - HTTP endpoint for direct MCP requests
2. `/api/data` - Simplified endpoint that uses the MCP agent to fetch data

The MCP agent is defined in `src/mcp-agent.js` and provides the following tools:

- `get_profile` - Retrieves the authenticated user's profile information
- `get_data` - Retrieves sample data associated with the authenticated user


## Implementation Details

### Authentication Flow

1. The user clicks "Log In" and is redirected to Auth0
2. After authentication, Auth0 redirects back to the `/auth` endpoint
3. The application validates the token, extracts user info, and creates a session
4. The session ID is stored in a secure cookie
5. User data is displayed on the page

### MCP Implementation

1. The MCP agent provides tools for interacting with the application
2. The `/api/data` endpoint demonstrates using MCP to fetch data
3. The `/mcp-sse` endpoint supports real-time MCP connections with AI assistants

### Security Considerations

- Tokens are validated using JWT verification
- Sessions are stored in Workers KV and referenced by ID
- Cookies are secure, with HttpOnly and SameSite attributes
- State parameters protect against CSRF attacks

## Troubleshooting

See the console logs in both the browser and Wrangler CLI output for debugging information.

## License

MIT 

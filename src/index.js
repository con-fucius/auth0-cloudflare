import { Router } from 'itty-router';
import { initAuth, getLoginUrl, handleCallback, verifySession, handleLogout } from './auth0';
import mcpAgent from './mcp-agent';
import { injectUserData, renderError, jsonResponse, handleSSE } from './utils';

// Create a new router
const router = Router();

// Helper function to get static assets
async function serveAsset(request, env) {
  try {
    // In development mode, just serve the index.html directly
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Auth0 MCP Integration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .button {
            display: inline-block;
            background: #0F172A;
            color: white;
            border: none;
            padding: 10px 20px;
            margin: 5px;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            font-size: 1rem;
        }
        .button:hover {
            background: #1E293B;
        }
        .profile {
            display: none;
        }
        pre {
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
            overflow: auto;
        }
        .hidden {
            display: none;
        }
        .error {
            color: #c53030;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Auth0 MCP Integration Demo</h1>
        <p>Simple demonstration of Auth0 integration with Cloudflare MCP</p>
    </div>

    <div class="card">
        <h2>Authentication Status</h2>
        <div id="login-container">
            <p>You are not logged in.</p>
            <button id="login-button" class="button">Log In</button>
        </div>
        <div id="profile-container" class="hidden">
            <p>You are logged in as: <span id="user-name">Unknown</span></p>
            <button id="logout-button" class="button">Log Out</button>
        </div>
    </div>

    <div id="profile" class="card profile">
        <h2>User Profile</h2>
        <pre id="profile-data">Loading...</pre>
    </div>

    <div class="card">
        <h2>MCP Demo</h2>
        <p>Use this MCP-enabled feature to interact with your data:</p>
        <button id="mcp-button" class="button">Fetch Data via MCP</button>
        <div id="mcp-result" style="margin-top: 20px;"></div>
    </div>

    <script id="edge_state" type="application/json">
      {}
    </script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Get user info from edge state
            const edgeStateElement = document.getElementById('edge_state');
            let userInfo = {};
            try {
                userInfo = JSON.parse(edgeStateElement.textContent);
            } catch (e) {
                console.error('Failed to parse edge state:', e);
            }

            const loginButton = document.getElementById('login-button');
            const logoutButton = document.getElementById('logout-button');
            const loginContainer = document.getElementById('login-container');
            const profileContainer = document.getElementById('profile-container');
            const userName = document.getElementById('user-name');
            const profile = document.getElementById('profile');
            const profileData = document.getElementById('profile-data');
            const mcpButton = document.getElementById('mcp-button');
            const mcpResult = document.getElementById('mcp-result');

            // Check if user is logged in
            if (userInfo && userInfo.name) {
                loginContainer.classList.add('hidden');
                profileContainer.classList.remove('hidden');
                userName.textContent = userInfo.name || userInfo.email;
                profile.style.display = 'block';
                profileData.textContent = JSON.stringify(userInfo, null, 2);
            }

            // Login button handler
            loginButton.addEventListener('click', function() {
                window.location.href = '/login';
            });

            // Logout button handler
            logoutButton.addEventListener('click', function() {
                window.location.href = '/logout';
            });

            // MCP button handler
            mcpButton.addEventListener('click', async function() {
                mcpResult.innerHTML = 'Loading...';
                try {
                    console.log('Fetching data from /api/data...');
                    const response = await fetch('/api/data');
                    console.log('Response received:', response.status, response.statusText);
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('API error:', response.status, errorText);
                        mcpResult.innerHTML = \`<p class="error">Error \${response.status}: \${errorText || response.statusText}</p>\`;
                        return;
                    }
                    
                    const contentType = response.headers.get('content-type');
                    console.log('Content-Type:', contentType);
                    
                    if (!contentType || !contentType.includes('application/json')) {
                        const text = await response.text();
                        console.error('Response is not JSON:', text);
                        mcpResult.innerHTML = \`<p class="error">Expected JSON but received \${contentType || 'unknown type'}</p><pre>\${text}</pre>\`;
                        return;
                    }
                    
                    const text = await response.text();
                    console.log('Raw response:', text);
                    
                    try {
                        const data = JSON.parse(text);
                        console.log('Parsed data:', data);
                        mcpResult.innerHTML = \`<pre>\${JSON.stringify(data, null, 2)}</pre>\`;
                    } catch (parseError) {
                        console.error('JSON parse error:', parseError);
                        mcpResult.innerHTML = \`<p class="error">Failed to parse JSON: \${parseError.message}</p><pre>\${text}</pre>\`;
                    }
                } catch (error) {
                    console.error('Fetch error:', error);
                    mcpResult.innerHTML = \`<p class="error">Error: \${error.message}</p>\`;
                }
            });
        });
    </script>
</body>
</html>`,
        {
          headers: {
            "Content-Type": "text/html"
          }
        }
      );
    }
    return new Response("Not found", { status: 404 });
  } catch (error) {
    console.error("Asset error:", error);
    return new Response("Not found", { status: 404 });
  }
}

// Middleware to check authentication
const withAuth = async (request, env) => {
  // Get the user from the session
  const user = await verifySession(request);
  
  // Add the user to the request object
  request.user = user;
  
  return request;
};

// Define routes - place specific routes before the catch-all
router.get('/login', async (request, env) => {
  console.log("Login route hit");
  try {
    // Get the return URL from the query parameters
    const url = new URL(request.url);
    const returnUrl = url.searchParams.get('returnUrl') || '/';
    
    // Generate a login URL
    const loginUrl = await getLoginUrl(returnUrl);
    console.log("Generated login URL:", loginUrl);
    
    // Redirect to the login URL
    return Response.redirect(loginUrl, 302);
  } catch (error) {
    console.error("Login error:", error);
    return renderError("Failed to initiate login: " + error.message, 500);
  }
});

// Route for handling the callback from Auth0
router.get('/auth', async (request, env) => {
  console.log("Auth callback route hit");
  try {
    // Handle the callback
    const result = await handleCallback(request);
    
    // If there's an error, show it
    if (result.error) {
      return renderError(result.error, result.status || 400);
    }
    
    // Otherwise, follow the redirect
    return new Response(null, {
      status: result.status,
      headers: result.headers
    });
  } catch (error) {
    console.error("Auth callback error:", error);
    return renderError("Authentication failed: " + error.message, 500);
  }
});

// Route for logging out
router.get('/logout', async (request, env) => {
  console.log("Logout route hit");
  try {
    // Handle the logout
    const result = await handleLogout(request);
    
    // Follow the redirect
    return new Response(null, {
      status: result.status,
      headers: result.headers
    });
  } catch (error) {
    console.error("Logout error:", error);
    return renderError("Logout failed: " + error.message, 500);
  }
});

// API routes require authentication
router.get('/api/data', async (request, env) => {
  console.log("API data route hit");
  
  // Initialize auth with environment
  initAuth(env);
  
  // Manual session check instead of using middleware
  const user = await verifySession(request);
  
  // If the user is not authenticated, return an error
  if (!user) {
    console.log("API data: User not authenticated");
    return new Response(
      JSON.stringify({ error: "Not authenticated" }), 
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  
  console.log("API data: User authenticated:", user.email);
  
  // Return simple data directly
  const data = {
    items: [
      { id: 1, name: "Sample Item 1" },
      { id: 2, name: "Sample Item 2" },
      { id: 3, name: "Sample Item 3" }
    ],
    count: 3,
    user: user.email || user.name || "authenticated user"
  };
  
  console.log("API data: Returning data");
  
  // Return properly formatted response
  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
});

// MCP endpoint
router.post('/mcp', async (request, env) => {
  console.log("MCP POST route hit");
  
  // Initialize auth with environment
  initAuth(env);
  
  // Manual session check
  const user = await verifySession(request);
  
  // Process the MCP request with user info
  return mcpAgent.processRequest(request, user);
});

// MCP SSE endpoint
router.get('/mcp-sse', async (request, env) => {
  console.log("MCP SSE route hit");
  
  // Initialize auth with environment
  initAuth(env);
  
  // Manual session check
  const user = await verifySession(request);
  
  // If the user is not authenticated, return an error
  if (!user) {
    console.log("MCP SSE: User not authenticated");
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  
  console.log("MCP SSE: User authenticated:", user.email);
  
  // Handle the SSE connection
  return handleSSE(request, async function* (req) {
    // Send the available tools
    yield { type: "tools", tools: mcpAgent.getTools() };
    
    // You could implement a long-running connection here
    // For this example, we just close after sending the tools
  });
});

// Catch-all route for static assets
router.get('*', async (request, env) => {
  console.log("Catch-all route hit for path:", new URL(request.url).pathname);
  // Get the user from the session
  const user = await verifySession(request);
  
  try {
    // Get the static asset
    const response = await serveAsset(request, env);
    
    // Inject user data if available
    if (user) {
      return injectUserData(response, user);
    }
    
    return response;
  } catch (error) {
    console.error("Static asset error:", error);
    return renderError("Failed to load page", 500);
  }
});

// 404 handler for routes that don't match
router.all('*', () => {
  console.log("404 route handler hit");
  return new Response('Not Found', { status: 404 });
});

// Export a fetch handler for Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    try {
      console.log("Request received for:", request.url);
      
      // Initialize auth module with environment
      initAuth(env);
      
      // Handle the request with the router
      return router.handle(request, env);
    } catch (error) {
      console.error("Unhandled error:", error);
      return renderError("An unexpected error occurred: " + error.message, 500);
    }
  }
}; 
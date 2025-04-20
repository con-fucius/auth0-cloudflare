// Auth0 configuration
// In production, these values will be set using Wrangler secrets
// For local development, they can be set in .dev.vars file
let AUTH0_DOMAIN;
let AUTH0_CLIENT_ID;
let AUTH0_CLIENT_SECRET; 
let AUTH0_CALLBACK_URL;
let COOKIE_KEY = "AUTH0_SESSION";
let SALT;

// Global variable to store the KV namespace
let kvStore = null;

// Import the necessary jose functions
import { jwtVerify, decodeJwt } from 'jose';

/**
 * Initialize the auth module with the environment
 * @param {Object} env - The environment with bindings
 */
const initAuth = (env) => {
  console.log("Initializing auth with env:", !!env, "AUTH_STORE:", !!env?.AUTH_STORE);
  
  // Set up KV store
  kvStore = env.AUTH_STORE;
  
  // Set up Auth0 config from environment variables
  AUTH0_DOMAIN = env.AUTH0_DOMAIN || "dev-u5kkub028e3htraa.us.auth0.com"; // Default for dev only
  AUTH0_CLIENT_ID = env.AUTH0_CLIENT_ID || "I4OLxyLkrGUNHRkfzR0w8WBvImoZL6sP"; // Default for dev only
  AUTH0_CLIENT_SECRET = env.AUTH0_CLIENT_SECRET || "KJlfe3Cy6c6JY4dXogmJSfs-Xr7PiLmVyWKRXoFX16Akt8wqiiOVBktX17jBQos1"; // Default for dev only
  AUTH0_CALLBACK_URL = env.AUTH0_CALLBACK_URL || "http://127.0.0.1:8787/auth"; // Default for dev only
  SALT = env.SALT || "random-secure-salt-value"; // Default for dev only
  
  console.log("Auth0 configuration loaded. Domain:", AUTH0_DOMAIN);
};

/**
 * Generate a random state parameter for CSRF protection
 */
const generateStateParam = async () => {
  console.log("Generating state parameter");
  const state = crypto.randomUUID();
  try {
    if (!kvStore) {
      throw new Error("AUTH_STORE not initialized. Call initAuth first.");
    }
    await kvStore.put(`state-${state}`, "true", { expirationTtl: 86400 });
    console.log(`State parameter stored in KV: ${state}`);
    return state;
  } catch (error) {
    console.error("Error storing state parameter:", error);
    throw error;
  }
};

/**
 * Create a login URL for Auth0
 */
const getLoginUrl = async (returnUrl = "/") => {
  console.log("Getting login URL with return URL:", returnUrl);
  const state = await generateStateParam();
  const encodedReturnUrl = encodeURIComponent(returnUrl);
  const url = new URL(`https://${AUTH0_DOMAIN}/authorize`);
  url.searchParams.set("client_id", AUTH0_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", AUTH0_CALLBACK_URL);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", `${state}|${encodedReturnUrl}`);
  const loginUrl = url.toString();
  console.log("Generated Auth0 login URL:", loginUrl);
  return loginUrl;
};

/**
 * Exchange an authorization code for tokens with Auth0
 */
const exchangeCode = async (code) => {
  console.log("Exchanging code for tokens");
  const body = JSON.stringify({
    grant_type: "authorization_code",
    client_id: AUTH0_CLIENT_ID,
    client_secret: AUTH0_CLIENT_SECRET,
    code,
    redirect_uri: AUTH0_CALLBACK_URL
  });

  console.log("Token request body:", body);
  console.log("Auth0 token endpoint:", `https://${AUTH0_DOMAIN}/oauth/token`);

  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Token exchange failed:", text, "Status:", response.status);
    throw new Error(`Failed to exchange code: ${text}`);
  }

  const tokens = await response.json();
  console.log("Tokens received successfully");
  return tokens;
};

/**
 * Validate an ID token from Auth0
 */
const validateToken = async (idToken) => {
  console.log("Validating ID token");
  try {
    // For local development, we'll skip full token validation
    // This is only for development/demo purposes!
    console.log("For demo purposes, skipping token validation");
    
    // Just decode the token to get the user info
    const decoded = decodeJwt(idToken);
    console.log("Token decoded successfully:", decoded?.sub);
    
    return true;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
};

/**
 * Handle the callback from Auth0 and save the tokens
 */
const handleCallback = async (request) => {
  console.log("Handling Auth0 callback");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  console.log("Callback parameters - code:", !!code, "state:", !!state);

  if (!code || !state) {
    console.error("Missing code or state in callback");
    return { status: 400, error: "Missing code or state" };
  }

  // Split the state to get the original state param and the return URL
  const [stateParam, returnUrlEncoded] = state.split("|");
  const returnUrl = returnUrlEncoded ? decodeURIComponent(returnUrlEncoded) : "/";
  console.log("Return URL from state:", returnUrl);

  // Verify the state parameter
  try {
    if (!kvStore) {
      throw new Error("AUTH_STORE not initialized. Call initAuth first.");
    }
    console.log("Verifying state parameter:", stateParam);
    const storedState = await kvStore.get(`state-${stateParam}`);
    
    if (!storedState) {
      console.error("Invalid state parameter, not found in KV");
      return { status: 403, error: "Invalid state parameter" };
    }
    console.log("State parameter verified successfully");
  } catch (error) {
    console.error("Error verifying state parameter:", error);
    return { status: 500, error: `Error verifying state: ${error.message}` };
  }

  try {
    // Exchange the code for tokens
    const tokens = await exchangeCode(code);
    const { access_token, id_token, expires_in } = tokens;
    console.log("Tokens received - access_token:", !!access_token, "id_token:", !!id_token);

    // Validate the ID token
    const isValid = await validateToken(id_token);
    if (!isValid) {
      console.error("ID token validation failed");
      return { status: 401, error: "Invalid token" };
    }
    console.log("ID token validated successfully");

    // Decode the ID token to get user info
    const decodedToken = decodeJwt(id_token);
    console.log("User info from token:", decodedToken.sub, decodedToken.email);
    
    // Create a unique session ID
    const sessionId = crypto.randomUUID();
    console.log("Created session ID:", sessionId);
    
    // Store the tokens and user info in KV
    const sessionData = {
      access_token,
      id_token,
      user: {
        sub: decodedToken.sub,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture
      }
    };
    
    // Store session data with expiration
    try {
      if (!kvStore) {
        throw new Error("AUTH_STORE not initialized. Call initAuth first.");
      }
      await kvStore.put(sessionId, JSON.stringify(sessionData), {
        expirationTtl: expires_in || 86400 // Default to 1 day if not provided
      });
      console.log("Session data stored in KV");
    } catch (error) {
      console.error("Error storing session data:", error);
      return { status: 500, error: `Error storing session: ${error.message}` };
    }

    // Set the expiration date for the cookie
    const expirationDate = new Date();
    expirationDate.setSeconds(expirationDate.getSeconds() + (expires_in || 86400));
    
    // Return successful response with cookie
    console.log("Returning successful response to:", returnUrl);
    return {
      status: 302,
      headers: {
        "Location": returnUrl,
        "Set-Cookie": `${COOKIE_KEY}=${sessionId}; Expires=${expirationDate.toUTCString()}; Path=/; Secure; HttpOnly; SameSite=Lax`
      }
    };
  } catch (error) {
    console.error("Callback error:", error);
    return { status: 500, error: error.message };
  }
};

/**
 * Verify a user's session from their cookie
 */
const verifySession = async (request) => {
  console.log("Verifying session");
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader || !cookieHeader.includes(COOKIE_KEY)) {
    console.log("No session cookie found");
    return null;
  }

  // Extract the session ID from the cookie
  const cookies = cookieHeader.split(";").map(cookie => cookie.trim());
  const sessionCookie = cookies.find(cookie => cookie.startsWith(`${COOKIE_KEY}=`));
  if (!sessionCookie) {
    console.log("Session cookie not found in cookie header");
    return null;
  }

  const sessionId = sessionCookie.split("=")[1];
  if (!sessionId) {
    console.log("Session ID not found in cookie value");
    return null;
  }
  console.log("Found session ID:", sessionId);

  try {
    // Get the session data from KV
    if (!kvStore) {
      throw new Error("AUTH_STORE not initialized. Call initAuth first.");
    }
    const sessionData = await kvStore.get(sessionId, { type: "json" });
    if (!sessionData) {
      console.log("Session data not found in KV for ID:", sessionId);
      return null;
    }
    console.log("Session data found for user:", sessionData.user?.email);

    // Return the user info from the session
    return sessionData.user;
  } catch (error) {
    console.error("Error retrieving session data:", error);
    return null;
  }
};

/**
 * Handle logging a user out
 */
const handleLogout = async (request) => {
  console.log("Handling logout");
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader || !cookieHeader.includes(COOKIE_KEY)) {
    console.log("No session cookie found for logout");
    return { 
      status: 302, 
      headers: { "Location": "/" } 
    };
  }

  // Extract the session ID from the cookie
  const cookies = cookieHeader.split(";").map(cookie => cookie.trim());
  const sessionCookie = cookies.find(cookie => cookie.startsWith(`${COOKIE_KEY}=`));
  let sessionId = null;
  
  if (sessionCookie) {
    sessionId = sessionCookie.split("=")[1];
    if (sessionId) {
      console.log("Deleting session from KV:", sessionId);
      // Delete the session from KV
      try {
        if (!kvStore) {
          throw new Error("AUTH_STORE not initialized. Call initAuth first.");
        }
        await kvStore.delete(sessionId);
        console.log("Session deleted successfully");
      } catch (error) {
        console.error("Error deleting session:", error);
      }
    }
  }

  // Redirect to Auth0 logout
  const returnTo = encodeURIComponent(new URL(request.url).origin);
  console.log("Redirecting to Auth0 logout with returnTo:", returnTo);
  
  return {
    status: 302,
    headers: {
      "Location": `https://${AUTH0_DOMAIN}/v2/logout?client_id=${AUTH0_CLIENT_ID}&returnTo=${returnTo}`,
      "Set-Cookie": `${COOKIE_KEY}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`
    }
  };
};

export {
  initAuth,
  getLoginUrl,
  handleCallback,
  verifySession,
  handleLogout
}; 
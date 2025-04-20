/**
 * Injects user data into the HTML response
 * @param {Response} response - The original response
 * @param {Object} userData - The user data to inject
 * @returns {Response} - The modified response
 */
const injectUserData = async (response, userData) => {
  // Only process HTML responses
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  // Get the HTML content
  const html = await response.text();

  // Look for the edge_state script tag
  const edgeStateRegex = /<script id="edge_state" type="application\/json">(.*?)<\/script>/s;
  const match = html.match(edgeStateRegex);

  if (!match) {
    return new Response(html, response);
  }

  // Replace the empty JSON with user data
  const userDataJson = JSON.stringify(userData || {});
  const updatedHtml = html.replace(
    edgeStateRegex,
    `<script id="edge_state" type="application/json">${userDataJson}</script>`
  );

  // Return the updated response
  return new Response(updatedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
};

/**
 * Renders an error page
 * @param {string} message - The error message
 * @param {number} status - The HTTP status code
 * @returns {Response} - The error response
 */
const renderError = (message, status = 500) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Error - Auth0 MCP Integration</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          line-height: 1.6;
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
        .error {
          color: #c53030;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1 class="error">Error</h1>
        <p>${message}</p>
        <a href="/" class="button">Return Home</a>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html"
    }
  });
};

/**
 * Creates an HTML response
 * @param {string} html - The HTML content
 * @param {number} status - The HTTP status code
 * @param {Object} headers - Additional headers
 * @returns {Response} - The HTML response
 */
const htmlResponse = (html, status = 200, headers = {}) => {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html",
      ...headers
    }
  });
};

/**
 * Creates a JSON response
 * @param {Object} data - The data to serialize
 * @param {number} status - The HTTP status code
 * @returns {Response} - The JSON response
 */
const jsonResponse = (data, status = 200) => {
  console.log("Creating JSON response:", JSON.stringify(data));
  
  try {
    const json = JSON.stringify(data);
    return new Response(json, {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("JSON response error:", error);
    return new Response(JSON.stringify({ error: "Failed to create JSON response" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
};

/**
 * Implements an SSE (Server-Sent Events) handler for MCP
 * @param {Request} request - The HTTP request
 * @param {Function} messageGenerator - Function that generates messages
 * @returns {Response} - The SSE response
 */
const handleSSE = (request, messageGenerator) => {
  const stream = new ReadableStream({
    async start(controller) {
      // Send the initial connection message
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("event: open\ndata: connected\n\n"));
      
      try {
        // Generate and send messages
        for await (const message of messageGenerator(request)) {
          const data = typeof message === 'string' ? message : JSON.stringify(message);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      } catch (error) {
        console.error("SSE error:", error);
        controller.enqueue(encoder.encode(`event: error\ndata: ${error.message}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
};

export {
  injectUserData,
  renderError,
  htmlResponse,
  jsonResponse,
  handleSSE
}; 
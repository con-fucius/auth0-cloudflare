/**
 * MCP Agent Implementation
 * 
 * This class implements a simple MCP agent for interacting with Auth0 and other APIs.
 * It can be extended with more tools as needed.
 */
class MCPAgent {
  constructor() {
    this.tools = {
      // Tool for fetching user profile
      get_profile: async ({ request }) => {
        console.log("MCP get_profile tool called with user:", request.user);
        const user = request.user;
        if (!user) {
          console.log("MCP get_profile: User not authenticated");
          return {
            error: "Not authenticated. Please log in first."
          };
        }
        
        console.log("MCP get_profile: Returning user profile");
        return {
          result: {
            name: user.name,
            email: user.email,
            sub: user.sub,
            picture: user.picture
          }
        };
      },
      
      // Tool for fetching sample data
      get_data: async ({ request }) => {
        console.log("MCP get_data tool called with user:", request.user);
        const user = request.user;
        if (!user) {
          console.log("MCP get_data: User not authenticated");
          return {
            error: "Not authenticated. Please log in first."
          };
        }
        
        // This would be where you'd fetch real data from an API
        console.log("MCP get_data: Returning sample data");
        return {
          result: {
            items: [
              { id: 1, name: "Sample Item 1" },
              { id: 2, name: "Sample Item 2" },
              { id: 3, name: "Sample Item 3" }
            ],
            count: 3,
            user: user.email
          }
        };
      },
      
      // Add more tools as needed
    };
  }

  /**
   * Process an MCP request
   * @param {Request} request - The HTTP request
   * @param {Object} user - The authenticated user info (if available)
   * @returns {Response} - The HTTP response
   */
  async processRequest(request, user = null) {
    try {
      console.log("MCP processRequest called with user:", user);
      
      // Parse the request body
      let body;
      try {
        body = await request.json();
        console.log("MCP request body:", body);
      } catch (error) {
        console.error("MCP request body parse error:", error);
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      
      // Validate the request
      if (!body.tool || !this.tools[body.tool]) {
        console.log("MCP invalid tool specified:", body.tool);
        return new Response(
          JSON.stringify({ error: "Invalid tool specified" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      
      // Add the user to the request
      const requestWithUser = {
        ...body,
        user
      };
      
      // Call the appropriate tool
      console.log("MCP calling tool:", body.tool);
      const result = await this.tools[body.tool](requestWithUser);
      console.log("MCP tool result:", result);
      
      // Return the result
      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      console.error("MCP processing error:", error);
      
      return new Response(
        JSON.stringify({ error: "Failed to process MCP request: " + error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
  
  /**
   * Get a list of available tools
   * @returns {Array} - List of available tools
   */
  getTools() {
    const tools = Object.keys(this.tools).map(tool => ({ name: tool }));
    console.log("MCP available tools:", tools);
    return tools;
  }
}

export default new MCPAgent(); 
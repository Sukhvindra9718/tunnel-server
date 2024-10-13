const WebSocket = require('ws');
const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');

const TUNNEL_PORT = 3000;

// Map to store clients, their respective tunnel paths, and the local ports
const clients = new Map();

// Create an HTTP proxy server
const proxy = httpProxy.createProxyServer({ changeOrigin: true });

// Handle incoming HTTP requests to the tunnel server
const handleHttpRequest = (req, res) => {
  const pathname = url.parse(req.url).pathname;

  if (req.method === 'POST' && req.url === '/request-tunnel') {
    // Generate a unique tunnel path for this client
    const tunnelPath = Math.random().toString(36).substring(2, 10);

    // Generate a public tunnel URL using the correct domain
    const tunnelUrl = `https://tunnel-server-ojd4.onrender.com/${tunnelPath}`;

    // Respond with the tunnel URL
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: tunnelUrl }));

    console.log(`Tunnel created: ${tunnelUrl}`);
  } else {
    // Check if the incoming request matches any active tunnel path
    console.log("pathname", pathname)
    const client = clients.get(pathname.substring(1)); // Remove the leading '/' from the pathname

    if (client) {
      console.log(`Routing request for path: ${pathname} via WebSocket to client on port ${client.port}`);

      // Collect the incoming request data
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        // Forward the request to the client via WebSocket
        // console.log("req",req)
        client.ws.send(JSON.stringify({
          url: `${req.url}`,
          method: req.method,
          headers: req.headers,
          body: body || null,
        }));

        // Attach a one-time listener for the client's response via WebSocket
        client.ws.once('message', (message) => {
          const { statusCode, headers, body } = JSON.parse(message);

          // Send the response back to the original HTTP request
          res.writeHead(statusCode, headers);
          res.end(body);
        });
      });
    } else {
      // If no matching tunnel is found, send a 404 response
      if (!res.headersSent) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Tunnel Not Found');
      }
    }
  }
};

// Create the server and bind the request handler
const server = http.createServer(handleHttpRequest);

// WebSocket server to handle client connections
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New client connected');

  // Listen for incoming messages from the client
  ws.on('message', (message) => {
    try {
      // Convert the buffer to a string and then parse the JSON
      const parsedMessage = JSON.parse(message.toString());

      console.log('Received WebSocket message:', parsedMessage);
      const { tunnelPath, port } = parsedMessage;
      console.log(`Parsed WebSocket message: tunnelPath=${tunnelPath}, port=${port}`);

      if (tunnelPath && port) {
        // If the client reconnects with the same tunnelPath, ensure we clean up the old connection
        if (clients.has(tunnelPath)) {
          const oldClient = clients.get(tunnelPath);
          oldClient.ws.close(); // Close the old WebSocket connection
          clients.delete(tunnelPath); // Remove the old client
        }
        // Store the client details with the correct tunnelPath and port
        clients.set(tunnelPath, { ws, port });
        console.log(`Client registered for tunnel path: ${tunnelPath} on port: ${port}`);
      } else {
        console.log('Received invalid tunnelPath or port');
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');

    // Remove the client from the map when it disconnects
    for (const [key, client] of clients.entries()) {
      if (client.ws === ws) {
        clients.delete(key);
        console.log(`Removed tunnel for path: ${key}`);
        break;
      }
    }
  });
});

// Start the server on the tunnel port
server.listen(TUNNEL_PORT, () => {
  console.log(`Tunnel server listening on port ${TUNNEL_PORT}`);
});

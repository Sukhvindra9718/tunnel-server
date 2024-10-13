const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const TUNNEL_PORT = 3000;

// Map to store clients, their respective tunnel paths, and the local ports
const clients = new Map();
const pendingRequests = new Map(); // Store pending HTTP responses by tunnel path

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
    console.log("Received request with pathname:", pathname);

    const tunnelPath = pathname.substring(1); // Remove the leading '/' from the pathname
    const client = clients.get(tunnelPath);

    if (client) {
      console.log(`Routing request for path: ${pathname} via WebSocket to client on port ${client.port}`);

      // Collect the incoming request data
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        // Store the pending HTTP response for later use when the WebSocket client responds
        pendingRequests.set(tunnelPath, res);

        // Forward the request to the client via WebSocket
        client.ws.send(JSON.stringify({
          url: `${req.url}`,
          method: req.method,
          headers: req.headers,
          body: body || null,
        }));
      });

      req.on('error', (error) => {
        console.error(`Error in request handling for path ${pathname}:`, error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error while forwarding request');
      });
    } else {
      console.error(`No client found for path: ${pathname}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Tunnel Not Found');
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
      const parsedMessage = JSON.parse(message.toString());

      // Check if the message is a registration message (tunnelPath and port)
      if (parsedMessage.tunnelPath && parsedMessage.port) {
        // Registration message
        const { tunnelPath, port } = parsedMessage;
        clients.set(tunnelPath, { ws, port });
        console.log(`Client registered for tunnel path: ${tunnelPath} on port: ${port}`);
      } else if (parsedMessage.statusCode) {
        // HTTP response message from the client
        const { statusCode, headers, body } = parsedMessage;

        // Retrieve the pending HTTP response object using the tunnelPath
        const res = pendingRequests.get(parsedMessage.url.split('/').pop());

        if (res) {
          // Send the response back to the original HTTP request
          res.writeHead(statusCode, headers);
          res.end(body);

          // Remove the pending response from the map
          pendingRequests.delete(parsedMessage.url.split('/').pop());
        } else {
          console.error('No pending request found for this tunnel path');
        }
      } else {
        console.log('Received invalid message');
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

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Start the server on the tunnel port
server.listen(TUNNEL_PORT, () => {
  console.log(`Tunnel server listening on port ${TUNNEL_PORT}`);
});

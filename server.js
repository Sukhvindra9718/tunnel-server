const WebSocket = require('ws');
const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');

const TUNNEL_PORT = 3000;
const clients = new Map(); // Store connected clients with their tunnel path and ports

// Create an HTTP proxy server
const proxy = httpProxy.createProxyServer({ changeOrigin: true });

// Handle incoming HTTP requests to the tunnel server
const handleHttpRequest = (req, res) => {
  const pathname = url.parse(req.url).pathname;
  const client = clients.get(pathname.substring(1)); // Get the client by tunnel path

  if (client) {
    console.log(`Routing request for path: ${pathname} to localhost:${client.port}`);

    // Proxy the request to the client's local server on the specified port
    proxy.web(req, res, { target: `http://localhost:${client.port}` }, (error) => {
      if (error) {
        console.error('Error proxying request:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      }
    });
  } else {
    // If no matching tunnel is found, send a 404 response
    if (!res.headersSent) {
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
    const { tunnelPath, port } = JSON.parse(message);

    // Store the WebSocket connection for the generated tunnel path and port
    clients.set(tunnelPath, { ws, port });
    console.log(`Client registered for tunnel path: ${tunnelPath} on port: ${port}`);
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

// Endpoint for clients to request a tunnel
server.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/request-tunnel') {
    const requestBody = [];
    req.on('data', chunk => requestBody.push(chunk));
    req.on('end', () => {
      const { port } = JSON.parse(Buffer.concat(requestBody).toString());
      const tunnelPath = Math.random().toString(36).substring(2, 10);
      const tunnelUrl = `https://tunnel-server-ojd4.onrender.com/${tunnelPath}`;
      
      // Respond with the tunnel URL
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: tunnelUrl }));

      console.log(`Tunnel created: ${tunnelUrl} for port: ${port}`);
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Start the server on the tunnel port
server.listen(TUNNEL_PORT, () => {
  console.log(`Tunnel server listening on port ${TUNNEL_PORT}`);
});

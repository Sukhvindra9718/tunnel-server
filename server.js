const WebSocket = require('ws');
const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');

const TUNNEL_PORT = 3000;
const LOCAL_SERVER_PORT = 8080;

// Map to store clients and their respective tunnel paths
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
    const client = clients.get(pathname.substring(1)); // Remove the leading '/' from the pathname

    if (client) {
      console.log(`Routing request for path: ${pathname} to localhost:${LOCAL_SERVER_PORT}`);
      
      // Proxy the request to the local server running on port 8080
      proxy.web(req, res, { target: `http://localhost:${LOCAL_SERVER_PORT}` }, (error) => {
        if (error) {
          console.error('Error proxying request:', error);
          if (!res.headersSent) { // Ensure headers haven't been sent before responding
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        }
      });
    } else {
      // If no matching tunnel is found, send a 404 response
      if (!res.headersSent) { // Ensure headers haven't been sent before responding
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
    const { tunnelPath } = JSON.parse(message);

    // Store the WebSocket connection for the generated tunnel path
    clients.set(tunnelPath, ws);
    console.log(`Client registered for tunnel path: ${tunnelPath}`);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    
    // Remove the client from the map when it disconnects
    for (const [key, client] of clients.entries()) {
      if (client === ws) {
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

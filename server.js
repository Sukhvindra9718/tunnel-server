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

const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname;

  if (req.method === 'POST' && pathname === '/request-tunnel') {
    // Generate a unique tunnel path for this client
    const tunnelPath = Math.random().toString(36).substring(2, 10);
    const tunnelUrl = `http://localhost:3000/${tunnelPath}`;

    // Associate the tunnel path with the WebSocket client
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: tunnelUrl }));

    console.log(`Tunnel created: ${tunnelUrl}`);
  } else {
    // Check if the incoming request matches any active tunnel path
    const pathname = url.parse(req.url).pathname;

    // Check if the incoming request matches any active tunnel path
    const client = clients.get(pathname.substring(1)); // Remove the leading '/' from the pathname

    if (client) {
      console.log(`Routing request for path: ${pathname} to localhost:${LOCAL_SERVER_PORT}`);

      // Proxy the request to the local server running on port 8080
      proxy.web(req, res, { target: `http://localhost:${LOCAL_SERVER_PORT}` }, (error) => {
        if (error) {
          console.error('Error proxying request:', error);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });
    } else {
      // If no matching tunnel is found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Tunnel Not Found');
    }
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New client connected');

  // Store the WebSocket client and its tunnel path in the clients map
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

server.listen(TUNNEL_PORT, () => {
  console.log(`Tunnel server listening on port ${TUNNEL_PORT}`);
});

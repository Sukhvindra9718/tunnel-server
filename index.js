const WebSocket = require('ws');
const http = require('http');

const TUNNEL_PORT = 4000;

// Create a single HTTP server
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/request-tunnel') {
    const tunnelUrl = `http://localhost:4000/${Math.random().toString(36).substring(2, 10)}`;
    
    // Store the tunnel URL in the clients map (for later routing)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: tunnelUrl }));
    
    console.log(`Tunnel created: ${tunnelUrl}`);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Attach WebSocket server to the HTTP server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);
    ws.send(`Echo: ${message}`);
  });

  ws.send('Welcome to the WebSocket server!');
});

// Start the combined HTTP and WebSocket server on the same port
server.listen(TUNNEL_PORT, () => {
  console.log(`Tunnel server and WebSocket server listening on port ${TUNNEL_PORT}`);
});

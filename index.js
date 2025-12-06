const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http'); // Use built-in http instead of express
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
const interval = (settings.restartIntervalMinutes || 60) * 60 * 1000;
let botProcess;
const PORT = 3000; // Define the port

function restartBot() {
  if (botProcess) {
    botProcess.kill('SIGTERM');
    botProcess = null;
  }
  botProcess = spawn('node', ['gerald.js'], { stdio: 'inherit' });
  botProcess.on('exit', (code) => {
    console.log(`[AutoRestart] Bot exited with code ${code}. Restarting...`);
    restartBot(); 
  });
}

// Create a simple HTTP server (minimalist version of what Express provides)
const server = http.createServer((req, res) => {
  // A simple health check response
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Auto-reloader is running.\n');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  restartBot(); // Start the bot after the server is listening
});

setInterval(() => {
  console.log('[AutoRestart] Restarting bot...');
  restartBot();
}, interval);

module.exports = restartBot;

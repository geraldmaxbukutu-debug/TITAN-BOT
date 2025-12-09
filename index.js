/* This file is responsible for spawning and managing the bot process. */
const { spawn } = require('child_process');
const fs = require('fs');
// Removed express/http, as port management must be consolidated in the main bot process
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
// Ensure the correct bot file is spawned here (was 'gerald.js' in prior code)
const BOT_FILE = 'main.js'; // Assuming your main bot file is now called main.js/index.js
const interval = (settings.restartIntervalMinutes || 60) * 60 * 1000;
let botProcess;

function restartBot() {
  if (botProcess) {
    botProcess.kill('SIGTERM');
    botProcess = null;
  }
  // Spawn the main bot file which manages its own monitor/port
  botProcess = spawn('node', [BOT_FILE], { stdio: 'inherit' });
  botProcess.on('exit', (code) => {
    // Only restart if the exit was unexpected (not SIGTERM/SIGINT)
    if (code !== 0 && code !== null) {
      console.log(`[AutoRestart] Bot exited with code ${code}. Restarting...`);
      restartBot(); 
    } else {
      console.log(`[AutoRestart] Bot exited gracefully.`);
    }
  });
}

// Start immediately without waiting for a server bind
restartBot();

// Set the timed restart interval
setInterval(() => {
  console.log('[AutoRestart] Restarting bot...');
  restartBot();
}, interval);

// Export the function so the updater can call it
module.exports = { restartBot };

/* This is the content of the file that was previously causing the conflict. */
const { spawn } = require('child_process');
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
const interval = (settings.restartIntervalMinutes || 60) * 60 * 1000;
let botProcess;

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

// Remove the `app.listen` or `server.listen` call from this file.
// The bot will now start immediately when called by the main file.
restartBot(); 

setInterval(() => {
  console.log('[AutoRestart] Restarting bot...');
  restartBot();
}, interval);

module.exports = restartBot;

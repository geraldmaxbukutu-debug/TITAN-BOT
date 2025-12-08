const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- CONFIGURATION ---
// IMPORTANT: Change 'index.js' to the name of your MAIN bot file (e.g., 'mateo.js')
const MAIN_FILE = 'index.js'; 
const SETTINGS_FILE = './settings.json';

// Load Settings
let settings = { restartIntervalMinutes: 60 };
try {
    if (fs.existsSync(SETTINGS_FILE)) {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
} catch (e) {
    console.error("Error reading settings.json, using defaults.");
}

// --- WEB SERVER (The "Port") ---
const app = express();
const port = process.env.PORT || 3000;
const startTime = Date.now();

app.get('/', (req, res) => {
    const uptime = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1>🤖 Titan Bot is Active</h1>
            <p>Status: <span style="color: green; font-weight: bold;">Running</span></p>
            <p>Port: ${port}</p>
            <p>Uptime: ${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s</p>
        </div>
    `);
});

app.listen(port, () => {
    console.log(`[Server] Web server running on port ${port}`);
});

// --- BOT PROCESS MANAGEMENT ---
let botProcess = null;
let lastCrashTime = 0;
const CRASH_THRESHOLD = 10000; // 10 seconds

function startBot() {
    if (botProcess) return; // Already running

    console.log(`[Mateo] Spawning ${MAIN_FILE}...`);

    // Spawn the bot process
    botProcess = spawn('node', [MAIN_FILE], { stdio: 'inherit' });

    // Handle bot exit
    botProcess.on('exit', (code, signal) => {
        botProcess = null;
        const now = Date.now();

        // 1. Crash Loop Detection
        if (code !== 0 && (now - lastCrashTime < CRASH_THRESHOLD)) {
            console.error(`[Mateo] ⚠️ Bot crashed too quickly (Exit Code: ${code}). Waiting 10 seconds before restart...`);
            setTimeout(startBot, 10000);
            lastCrashTime = now;
            return;
        }

        lastCrashTime = now;

        // 2. Standard Restart
        if (code === 0) {
            console.log(`[Mateo] Bot stopped intentionally (Code 0). Restarting...`);
        } else if (signal === 'SIGTERM' || signal === 'SIGINT') {
            console.log(`[Mateo] Bot was killed by signal. Restarting...`);
        } else {
            console.error(`[Mateo] 🚨 Bot crashed with code ${code}. Auto-restarting...`);
        }
        
        startBot();
    });
}

// --- SCHEDULED RESTART ---
// Convert minutes to milliseconds
const restartInterval = (settings.restartIntervalMinutes || 60) * 60 * 1000;

setInterval(() => {
    console.log('[Mateo] ⏰ Triggering scheduled restart...');
    if (botProcess) {
        // We kill the process; the 'exit' listener above will handle the restart logic automatically
        botProcess.kill('SIGTERM'); 
    } else {
        startBot();
    }
}, restartInterval);

// --- INITIALIZATION ---
startBot();

// --- GRACEFUL SHUTDOWN ---
// Kill child process if the launcher is stopped
process.on('SIGINT', () => {
    console.log('\n[Launcher] Stopping launcher and killing bot process...');
    if (botProcess) botProcess.kill();
    process.exit();
});

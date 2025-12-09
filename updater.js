const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { restartBot } = require('./index.js'); 
const execPromise = promisify(exec);
const REPO_DIR = path.resolve(__dirname);
const BRANCH = 'main';
const REMOTE = 'origin';
const INTERVAL_MS = 6 * 60 * 60 * 1000; 
const REPO_URL = 'https://github.com/geraldmaxbukutu-debug/TITAN-BOT.git'; 

async function gitExecute(command) {
  try {
    const { stdout } = await execPromise(`git -C ${REPO_DIR} ${command}`, {
        timeout: 60000 
    });
    return stdout.trim();
  } catch (error) {
    const errorMessage = error.stderr || error.message;
    console.error(`[Updater] ❌ Git command failed: ${command}\nError: ${errorMessage}`);
    
    return { error: true, message: errorMessage };
  }
}

let updaterError = false; 

async function checkForUpdates() {
  if (updaterError) {
      console.log("[Updater] Skipping update check because the environment is not a Git repository.");
      return;
  }
    
  console.log(`\n[Updater] Checking for updates on branch ${BRANCH}...`);

  const remoteSetOutput = await gitExecute(`remote set-url ${REMOTE} ${REPO_URL}`);
  if (remoteSetOutput.error) return; 

  const fetchResult = await gitExecute(`fetch ${REMOTE} ${BRANCH}`);
    
  if (fetchResult.error) {
    if (fetchResult.message && fetchResult.message.includes("not a git repository")) {
        console.warn("[Updater] ⚠️ WARNING: Bot directory is not a Git repository. Auto-updater disabled.");
        updaterError = true; 
    }
    return; 
  }

  const countResult = await gitExecute(`rev-list --count HEAD..${REMOTE}/${BRANCH}`);
  if (countResult.error) return; 

  const updatesPending = parseInt(countResult, 10);
    
  if (updatesPending > 0) {
    console.log(`\n===============`);
    console.log(`🚨 UPDATE FOUND! Local branch is behind by ${updatesPending} commit(s).`);
    console.log(`===============`);
    
    const pullResult = await gitExecute(`pull --rebase ${REMOTE} ${BRANCH}`);
      
    if (pullResult.error) {
        console.error("❌ Git Pull failed. Please check for local conflicts or network issues.");
        return;
    }
      
    console.log(`✅ Git Pull successful. Output:\n${pullResult}`);
    
    console.log(`\n🚀 Restarting bot to apply updates...`);
    
    if (typeof restartBot === 'function') {
        restartBot();
    } else {
        console.error("❌ Critical: 'restartBot' function is not available or not a function. Cannot apply update.");
    }
    
  } else {
    console.log(`✅ [Updater] No updates found. Local branch is up-to-date.`);
  }
}

function startUpdater() {
  checkForUpdates(); 
  return setInterval(checkForUpdates, INTERVAL_MS);
}

module.exports = { startUpdater, error: updaterError };

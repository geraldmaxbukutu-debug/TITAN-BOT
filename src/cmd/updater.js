const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execPromise = promisify(exec);
const REPO_DIR = path.resolve(__dirname);
const BRANCH = 'main';
const REMOTE = 'origin';
const INTERVAL_MS = 6 * 60 * 60 * 1000;

module.exports = {
  name: "update",
  description: "Check for updates in bot repo and restart bot if updates are found",
  role: 0,
  category: "admin",
  cooldown: 5,
  execute: async ({ api, event, args, dbHelpers, settings, getText }) => {
    const threadID = event.threadID;

    async function gitExecute(command) {
      try {
        const { stdout } = await execPromise(`git -C ${REPO_DIR} ${command}`);
        return stdout.trim();
      } catch (error) {
        api.sendMessage(`[Updater] Git command failed: ${command}\nError: ${error.stderr || error.message}`, threadID);
        return "";
      }
    }

    console.log(`\n[Updater] Checking for updates on branch ${BRANCH}...`);
    api.sendMessage(`[Updater] Checking for updates on branch ${BRANCH}...`, threadID);

    const fetchOutput = await gitExecute(`fetch ${REMOTE} ${BRANCH}`);
    if (fetchOutput.includes("fatal: not a git repository")) {
      console.warn("[Updater] WARNING: Bot directory is not a Git repository. Auto-updater disabled.");
      api.sendMessage("[Updater] WARNING: Bot directory is not a Git repository. Auto-updater disabled.", threadID);
      return;
    }

    const count = await gitExecute(`rev-list --count HEAD..${REMOTE}/${BRANCH}`);
    const updatesPending = parseInt(count, 10);

    if (updatesPending > 0) {
      console.log(`\n===============`);
      console.log(`🚨 UPDATE FOUND! Local branch is behind by ${updatesPending} commit(s).`);
      console.log(`===============`);
      api.sendMessage(`\n===============`, threadID);
      api.sendMessage(`🚨 UPDATE FOUND! Local branch is behind by ${updatesPending} commit(s).`, threadID);
      api.sendMessage(`===============`, threadID);

      const pullOutput = await gitExecute(`pull ${REMOTE} ${BRANCH}`);
      console.log(`✅ Git Pull successful. Output:\n${pullOutput}`);
      api.sendMessage(`✅ Git Pull successful. Output:\n${pullOutput}`, threadID);

      console.log(`\n🚀 Restarting bot to apply updates...`);
      api.sendMessage(`\n🚀 Restarting bot to apply updates...`, threadID);
      require('../../index.js').restartBot(); // uncomment this line to restart the bot
    } else {
      console.log(`✅ [Updater] No updates found. Local branch is up-to-date.`);
      api.sendMessage(`✅ [Updater] No updates found. Local branch is up-to-date.`, threadID);
    }
  },
};
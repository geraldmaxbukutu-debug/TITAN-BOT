const { bold, red, blue, yellow, green } = require('chalk');
const MateoBot = bold('[Team Titan]× ');

function log(text) {
  const sign = "💬";
  return console.log(`${MateoBot} ${text}`).trim;
}

function warnc(text) {
  const sign = "⚠️";
  let output = bold("WARNING: ") + text;
  return console.log(yellow(sign + ' ' + MateoBot + ' ' + output)).trim;
}

function errorc(text) {
  const sign = "🔴";
  let output = bold("ERROR: ") + text;
  return console.log(red(sign + ' ' + MateoBot + ' ' + output)).trim;
}

function infoc(text) {
  const sign = "ℹ️";
  let output = bold("INFO: ") + text;
  return console.log(blue(sign + ' ' + MateoBot + ' ' + output)).trim;
}

function successc(text) {
  const sign = "✅";
  let output = bold("SUCCESS: ") + text;
  return console.log(green(sign + ' ' + MateoBot + ' ' + output)).trim;
}

const logger = log;
logger.warn = warnc;
logger.error = errorc;
logger.info = infoc;
logger.success = successc;

module.exports = logger; 
'use strict';
// .env 로더 (의존성 없음). 스크립트와 e2e 가 같이 쓴다.
// 이미 설정된 프로세스 환경변수(CI·운영)가 .env 보다 우선한다.
const fs = require('node:fs');
const path = require('node:path');

function parseEnvText(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    env[key] = value;
  }
  return env;
}

function loadEnv(root, processEnv = process.env) {
  const file = path.join(root, '.env');
  const env = fs.existsSync(file)
    ? parseEnvText(fs.readFileSync(file, 'utf8'))
    : {};
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined && value !== '') env[key] = value;
  }
  return env;
}

module.exports = { parseEnvText, loadEnv };

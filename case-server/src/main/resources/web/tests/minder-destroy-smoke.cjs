// 独立运行真实 SVG 生命周期回归，不启动服务，也不读取任何业务数据。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const chrome = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(candidate => fs.existsSync(candidate));
assert(chrome, '需要已安装 Chrome/Chromium，或设置 CHROME_PATH；不自动安装依赖');
const projectRoot = path.resolve(__dirname, '../../../../../..');
const profileRoot = path.join(projectRoot, 'temp/task-source-edit/chrome-smoke');
fs.mkdirSync(profileRoot, { recursive: true });
const profile = fs.mkdtempSync(path.join(profileRoot, 'destroy-'));
const fixture = pathToFileURL(path.join(__dirname, 'fixtures/minder-destroy-smoke.html')).href;
const run = spawnSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', `--user-data-dir=${profile}`,
  '--dump-dom', fixture,
], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
assert.ifError(run.error);
assert.strictEqual(run.status, 0, 'Chrome 未正常退出');
const result = run.stdout.match(/<div id="result" data-status="([^"]+)">([^<]*)<\/div>/);
assert(result, '未得到生命周期回归结果');
console.log(result[2]);
assert.strictEqual(result[1], 'passed', '真实 Minder 生命周期回归失败');

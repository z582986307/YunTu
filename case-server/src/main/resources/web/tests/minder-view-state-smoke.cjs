// 短时仅本地 fixture 服务；使用项目已有浏览器驱动，不启动业务服务。
const fs = require('fs');
const http = require('http');
const path = require('path');
const webRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(__dirname, '../../../../../..');
const puppeteer = require(path.join(projectRoot, '项目依赖/YunTu-Web/node_modules/puppeteer-core'));
const server = http.createServer((request, response) => {
  let file = path.resolve(webRoot, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!file.startsWith(webRoot + path.sep)) { response.writeHead(403).end(); return; }
  if (!path.extname(file)) file += '.js';
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'text/javascript');
    response.end(data);
  });
});
(async () => {
  let browser;
  let deadline;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profileRoot = path.join(projectRoot, 'temp/task-source-edit/chrome-smoke');
    fs.mkdirSync(profileRoot, {recursive:true});
    browser = await puppeteer.launch({
      executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless:true, userDataDir:fs.mkdtempSync(path.join(profileRoot,'view-')),
      args:['--no-first-run','--disable-background-networking'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/minder-view-state-smoke.html`);
    await page.waitForFunction('typeof window.runViewStateSmoke === "function"');
    const results = await Promise.race([
      page.evaluate(() => window.runViewStateSmoke()),
      new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('真实视图回归超过 30 秒失败上限')),30000);
      }),
    ]);
    results.forEach(result => console.log(`PASS: ${result}`));
  } finally {
    clearTimeout(deadline);
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

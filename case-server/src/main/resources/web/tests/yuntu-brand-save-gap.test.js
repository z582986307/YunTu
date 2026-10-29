/* eslint-env jest */
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import sass from 'node-sass';
import Headers from '../src/layouts/headers';
import Login from '../src/pages/landing/login';
import { Banner30DataSource, Footer00DataSource } from '../src/pages/landing/data.source';
import config from '../.umirc';

jest.mock('../src/utils/getCookies', () => ({ getCookie: () => '测试用户' }));

const render = element => {
  const holder = document.createElement('div');
  holder.innerHTML = ReactDOMServer.renderToStaticMarkup(element);
  return holder;
};

test('全站页头的首页链接显示精确 YunTu', () => {
  expect(render(<Headers light />).querySelector('header > a').textContent.trim()).toBe('YunTu');
});

test('登录页只替换品牌，仍显示登录注册操作', () => {
  const page = render(<Login />);
  expect(page.querySelector('.title').firstChild.textContent.trim()).toBe('YunTu');
  expect(page.querySelector('.onBtn').textContent.replace(/\s/g, '')).toBe('登录');
  expect(page.textContent).toContain('注册');
});

test('首页宣传、图标替代文字与页脚统一 YunTu，开始使用入口保留', () => {
  const banner = render(<div>{Banner30DataSource.textWrapper.children.map(item => <section key={item.name}>{item.children}</section>)}</div>);
  expect(banner.querySelector('.banner3-logo').alt).toBe('YunTu');
  expect(banner.querySelector('section span').textContent).toBe('YunTu');
  expect(banner.textContent).toContain('开始使用');
  expect(render(Footer00DataSource.copyright.children).textContent).toBe('YunTu');
});

test('初始 HTML 和路由标题契约均精确 YunTu，无平台后缀', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/pages/document.ejs'), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  expect(parsed.title).toBe('YunTu');
  expect(config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'umi-plugin-react')[1].title).toBe('YunTu');
});

test('favicon 图像可访问名称为 YunTu', () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/favicon.svg'), 'utf8');
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(parsed.documentElement.getAttribute('aria-label')).toBe('YunTu');
});

test('共享编辑页头给保存按钮上下各 3px，按钮和剩余画布伸缩契约不变', () => {
  const style = document.createElement('style');
  style.textContent = sass.renderSync({ file: path.join(__dirname, '../src/components/case/casemgt/index.scss') }).css.toString();
  document.head.appendChild(style);
  const holder = document.createElement('div');
  holder.innerHTML = '<div class="case-detail-page"><div class="case-detail-shell"><div class="case-detail-heading"><button class="case-detail-save ant-btn-primary">保存</button></div><div class="case-detail-content"><div class="kityminder-editor-container"></div></div></div></div>';
  document.body.appendChild(holder);
  try {
    const heading = getComputedStyle(holder.querySelector('.case-detail-heading'));
    const button = getComputedStyle(holder.querySelector('button'));
    expect(heading.paddingTop).toBe('3px');
    expect(heading.paddingBottom).toBe('3px');
    expect(heading.paddingLeft).toBe('12px');
    expect(button.height).toBe('32px');
    expect(button.borderRadius).toBe('10px');
    expect(getComputedStyle(holder.querySelector('.case-detail-content')).flex).toBe('1 1 auto');
    expect(getComputedStyle(holder.querySelector('.kityminder-editor-container')).minHeight).toBe('0');
  } finally {
    holder.remove();
    style.remove();
  }
});

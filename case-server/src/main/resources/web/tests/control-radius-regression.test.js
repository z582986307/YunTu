const assert = require('assert')
const fs = require('fs')
const path = require('path')

test('全局控件与脑图工具条使用当前圆角规范', () => {
const layout = fs.readFileSync(
  path.resolve(__dirname, '../src/layouts/index.js'),
  'utf8',
)
const styles = fs.readFileSync(
  path.resolve(__dirname, '../src/layouts/index.scss'),
  'utf8',
)
const editorStyles = fs.readFileSync(
  path.resolve(__dirname, '../src/components/react-mindmap-editor/toolbar/DoGroup.scss'),
  'utf8',
)
const editor = fs.readFileSync(
  path.resolve(__dirname, '../src/components/react-mindmap-editor/index.js'),
  'utf8',
)
const themes = fs.readFileSync(
  path.resolve(__dirname, '../src/components/react-mindmap-editor/constants/index.js'),
  'utf8',
)

assert(layout.includes("import './index.scss'"), '全局控件圆角样式应从页面布局统一加载')
assert(styles.includes('--control-radius: 10px;'), '普通按钮和输入框应统一使用 10px 圆角令牌')
assert(styles.includes('.ant-btn:not(.ant-btn-circle)'), '普通按钮应继承统一圆角并排除圆形按钮')
assert(styles.includes('.ant-input'), '输入框应继承统一圆角')
assert(styles.includes('.ant-select-selection'), '选择框应继承统一圆角')
assert(styles.includes('.ant-modal-content'), '弹窗应继承统一圆角')
assert(editorStyles.includes('border-radius: 8px;'), '撤销和重做应使用当前轻量圆角工具条样式')
assert(editor.includes("className=\"mindmap-outlook-toggle\""), '外观入口应保留统一样式类')
assert(themes.includes("'byte-blue': '天蓝色（新）'"), '天蓝色主题应以当前中文名称展示')

console.log('control radius regression checks passed')
})

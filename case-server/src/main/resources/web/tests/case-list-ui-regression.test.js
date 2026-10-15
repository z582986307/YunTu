const assert = require('assert')
const fs = require('fs')
const path = require('path')

test('用例列表沿用当前视觉风格且不嵌套测试任务', () => {
const list = fs.readFileSync(
  path.resolve(__dirname, '../src/components/case/caselist/index.js'),
  'utf8',
)
const styles = fs.readFileSync(
  path.resolve(__dirname, '../src/components/case/caselist/index.scss'),
  'utf8',
)
const listTable = fs.readFileSync(
  path.resolve(__dirname, '../src/components/case/caselist/list.js'),
  'utf8',
)
const landingStyles = fs.readFileSync(
  path.resolve(__dirname, '../src/pages/landing/less/index.less'),
  'utf8',
)
const caseEditor = fs.readFileSync(path.resolve(__dirname, '../src/components/case/casemgt/index.js'), 'utf8')

assert(list.includes('className="all-content byte-case-list"'), '用例列表应使用独立的字节风格作用域')
assert(styles.includes('.byte-case-list'), '用例列表应提供字节风格容器样式')
assert(styles.includes('border-radius: 12px;'), '列表卡片和弹窗应使用更大的圆角')
assert(styles.includes('.ant-select-selection'), '下拉框应统一优化边框和圆角')
assert(styles.includes('.ant-modal-content'), '弹窗应统一优化边框和圆角')
assert(!listTable.includes('expandedRowRender'), '用例列表不应再嵌套展示测试任务')
assert(styles.includes('.delete-action') && styles.includes('#f53f3f'), '删除按钮应使用红色危险色')
assert(caseEditor.includes("'ink-black'"), '用例编辑页外观颜色样式应包含经典黑')
assert(styles.includes('.case-list-actions') && styles.includes('flex-wrap: nowrap'), '用例操作应保持在同一行并露出更多')
assert(listTable.includes('scroll={{ x: 1100 }}') && listTable.includes("fixed: 'right'"), '用例列宽应收紧且操作列固定在右侧')
assert(styles.includes('.ant-select-selection__choice') && styles.includes('border-radius: 10px;'), '已选用例集标签应使用统一圆角')
assert(landingStyles.includes('border-radius: 10px;'), '退出登录下拉和用户按钮应使用统一圆角')

console.log('case list UI regression checks passed')
})

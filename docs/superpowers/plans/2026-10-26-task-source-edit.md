# 测试任务编辑源用例实施计划

> 实施方式：使用 subagent-driven-development，逐项实现并进行规格与质量评审；测试先失败再实现。已获用户“开干”授权，不重复请求方案批准。

**目标：** 任务页可在原位置编辑完整源用例，并保留任务并行执行、结果隔离和防冲突能力。

**架构：** 复用源用例编辑器和源房间，通过编辑器实例切换隔离执行/内容状态；服务端独立记录源版本并向任务发送更新通知。位置状态以节点 ID、祖先链和屏幕锚点恢复。

**技术栈：** React、Ant Design、Kityminder、Socket.IO、Spring Boot、MyBatis、JDK 8、Node 14 构建。

**规格：** `docs/superpowers/specs/2026-10-26-task-source-edit-design.md`。

## 全局约束

- 各任务结果、执行备注、任务外观独立；普通执行不占用源内容锁。
- 内容编辑连接完整源用例房间，`recordId=undefined, sourceTaskId=<任务ID>`；同一时间只挂载一个编辑器。
- 服务端核对任务与源用例关系、源锁及版本；只有成功落库后确认内容编辑成功。
- 他人任务收到 `source_case_updated` 只提示更新，不自动换画面；刷新后加载新内容。
- 当前编辑者结束编辑自动显示最新任务数据，保持执行位置、缩放与选中节点。
- 不升级依赖、不改数据库结构、不触碰业务数据；凭据不进入日志、测试报告或版本库。
- 所有临时文件和测试数据库位于本项目；生产构建完成交付；源码提交前进行 OCR 主代理评审，最终推送由主代理统一执行。

### Task 1: 服务端源编辑连接、持久化和任务源版本

**文件：** 修改 `handler/SocketIOServiceImpl.java`、`EditIngressTask.java`、`SaveIngressTask.java`、`RoomEntity.java`、`RecordEntity.java`、`RecordFactory.java`；可新建单一职责的 `SourceCaseUpdateNotifier.java`；测试放 `src/test/java/com/xiaoju/framework/handler/`。

**接口：**

```java
// RecordEntity: 源版本与任务编辑 base 分开。
int getSourceVersion();
boolean refreshFromSourceIfChanged();
// RecordFactory: 返回同一源用例的活动任务房间，不向外暴露可变 map。
Collection<RecordEntity> roomsForCase(Long caseId);
// 新事件：source_case_updated，PushMessage.message 为源版本十进制字符串。
// 源内容编辑连接：sourceTaskId + recordId=undefined；验证任务 caseId。
```

- [ ] 写失败测试：任务源编辑申请与普通用例编辑共锁，其他任务执行房间不被锁；错误任务 ID 不被授权。
- [ ] 写失败测试：任务源编辑补丁先落库再发送成功确认；失败不改变源内存，不通知关联任务。
- [ ] 实现查询标记验证和原子获取源锁；源编辑不绕过现有版本校验。
- [ ] 实现实际内容持久化后通知关联活动任务；无变化保存不通知。
- [ ] 实现任务新连接时按源版本重新合并，并阻止同任务旧快照继续提交；其他任务保持原快照直到自己刷新。
- [ ] 测试保留任务结果、执行备注、展开状态及独立外观；任务 base 与源版本分开，刷新任务 base 单调递增。
- [ ] 聚焦验证：项目 JDK/Maven 下 `compiler:compile compiler:testCompile surefire:test -Dtest=TaskSourceEditingTests,RecordEntityPersistenceTests,RoomFreshnessTests`。
- [ ] 自评审并调用 OCR 规则后仅提交本任务后端文件；写报告到 `temp/task-source-edit/task-1-report.md`。

### Task 2: 任务页编辑模式、位置恢复、优先级和标签

**文件：** 修改 `components/case/casemgt/index.js` 及样式、`react-mindmap-editor/index.js`、`socket.js`、`toolbar/TagGroup.js`、必要的 `PriorityGroup.js` 和 `DoGroup.js` 历史命令确认；必要时精准修复现有 core 的销毁监听；新建 `util/viewState.js`、必要的任务范围标识 helper；测试放现有 web/tests。

**接口：**

```javascript
// 编辑器实例：保存确认失败时 reject，不能默默 resolve。
saveAndWait(): Promise<void>
captureViewState(): { selectedIds, ancestorIds, zoom, anchor, movement }
// 编辑器 props：
initialViewState, viewStateKey, sourceEditing, assignedNodeIds,
onSaveAcknowledged, onLockStateReceived, onSourceCaseUpdated
// socket：新增导入完成回调 onImported；source_case_updated -> onSourceCaseUpdated。
```

- [ ] 写位置恢复行为测试：修改布局后仍按节点 ID 恢复锚点，已删节点按祖先 ID 回退；sessionStorage 不含正文/凭据。
- [ ] 实现视图捕获和导入完成后的恢复，页面刷新前保存当前位置；沿用已有初次打开中心定位，仅有已保存视图时覆盖。
- [ ] 写保存确认失败、在途编辑、卸载的 Promise 行为测试；实现 `saveAndWait`，源模式锁拒绝不能允许写入。
- [ ] Casemgt 任务页新增“编辑用例 / 结束编辑”按钮；进入前等待任务保存、捕获执行视图，切换为完整源编辑器；结束等待源保存确认，再切回任务编辑器读取最新内容。
- [ ] 完整源模式保留原位置并标识未分配任务节点；源锁开关不可在模式中途释放，退出时关闭源连接释放。
- [ ] 复用用例编辑图片能力，任务普通执行仍仅预览图片；执行结果面板在内容编辑模式隐藏。
- [ ] 外观菜单接入优先级、标签，非可写内容模式禁用；修复 TagGroup 空值/重复/移除/监听清理，标签落到节点 `resource`，创建任务现有筛选直接消费。
- [ ] 收到源更新仅显示通知和刷新入口；刷新入口及浏览器刷新恢复视图。
- [ ] 前端用 Node 24 运行 `npm test -- --runInBand --all`；用项目 Node 14 运行 `npm run build`。不升级项目依赖。
- [ ] 自评审、OCR 规则后仅提交本任务源码测试；报告到 `temp/task-source-edit/task-2-report.md`。

### Task 3: 联动验收、最终评审、合并和交付

**文件：** 按验收发现修复对应责任层；更新生产 dist、计划进度；Windows 包仍只放一个 ZIP 到 `打包/`。

- [ ] 读取前两任务报告，逐项规格和质量评审；有高风险问题修复后定向复审。
- [ ] 构建隔离生产实例，用生成的临时登录变量进行浏览器验证；报告仅输出非敏感断言。
- [ ] 两个独立任务并行标记；一个编辑源节点/模块/图片，另一个继续执行且只显示更新通知。
- [ ] 验证源页与任务内容编辑争锁、断开释放、保存失败、过期写入拒绝及当前页面无误报。
- [ ] 验证标签/优先级设置与创建任务筛选；部分任务进入完整源编辑保留未分配节点。
- [ ] 验证结束编辑无刷新显示最新内容，重新载入及手动刷新恢复位置，节点删除回退父节点。
- [ ] 全部前后端测试、生产构建通过后，OCR 主代理评审整组变更并安排独立最终评审。
- [ ] 功能分支快进合回 master，通过 GitHub 代理兜底包装器推送；备份标签不移动。
- [ ] 更新 Windows 独立包并校验 ZIP 每个文件；当前用户先前要求停止本地服务，因此交付时保持本地服务停止，除非用户另行要求启动。
- [ ] 停止所有本次测试进程；逐项报告已解决/部分解决/未解决及证据。

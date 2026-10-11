#### 云图用例管理平台
![image](https://dpubstatic.udache.com/static/dpubimg/RQnYIFAwEd/logo.png)

[![License](https://img.shields.io/badge/license-Apache%202-4EB1BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)
[![GitHub issues](https://img.shields.io/github/issues/z582986307/YunTu.svg)](https://github.com/z582986307/YunTu/issues)

#### 简介

>云图用例管理平台支持测试用例管理、执行计划管理、进度计算和多人实时协同，帮助测试人员编写、执行与沉淀用例。产品以脑图方式编辑，支持关联需求与组件化引用。

#### 功能描述

##### 测试用例集管理
>云图用例管理平台能够将用例集与需求关联，支持 xmind/xmind zen 导入导出，也可根据用例集名称、创建人、管理需求和创建时间搜索。

##### 用例编辑
>云图用例管理平台支持多人实时协同编辑用例集、用例优先级和自定义标签标记，并通过连接探活与自动保存降低连接异常时的数据丢失风险。

##### 测试任务管理
>用户可以根据用例中的优先级和标签圈选测试用例，组合成自身需要的测试任务。用户可以在测试任务中标记用例测试状态，并查看测试任务的整体进展。

##### 如何使用
##### 环境依赖
- mac/linux/windows
- java 1.8
- mysql 服务端

##### 下载
```
git clone https://github.com/z582986307/YunTu.git
或者 直接Download ZIP
```

##### 准备
- 创建依赖数据库，application-dev.properties中配置数据库名称为case_manager `create database case_manager`
- 利用sql中的脚本配置对应表。创建脚本路径：`case-server/sql/case-server.sql`
- 修改application-dev.properties中spring.datasource的配置。默认数据库端口号为3306

##### 运行
- `mvn spring-boot:run` （在case-server目录下执行）
- 浏览器打开 http://localhost:8094/case/caseList/1

#### 整体架构
<img width="60%" height="60%" src="https://dpubstatic.udache.com/static/dpubimg/7ad7eef0-0bbb-49c5-80fe-52aa192b02a9.png"/>

> 使用说明见 [云图使用说明.md](云图使用说明.md)。

#### 联系我们
群成员超200，需要扫描二维码添加客服，邀请入群

![image](https://dpubstatic.udache.com/static/dpubimg/1caac875-675a-4078-a946-6680f30553ef.png)

#### 注意
请避免将本项目部署到公网，如需部署，请完善身份认证功能的安全性。如果部署公网出现安全问题，本项目概不负责。 


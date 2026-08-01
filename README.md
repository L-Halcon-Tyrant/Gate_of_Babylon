# 学习库

一个以本地学习资料管理为起点、可逐步同步至微信小程序的学习资料系统。

## 当前结构

- `apps/web`：响应式 Web 管理界面，也是桌面应用的基础界面。
- `apps/api`：后端 API，后续负责账号、同步、文件元数据与搜索。
- `apps/miniapp`：微信小程序预留目录。
- `packages/shared`：Web、API 和小程序共用的数据模型。
- `docs`：产品和架构文档。

## 准备环境

需要 Node.js 22+ 和 pnpm 11+。

```powershell
pnpm install
pnpm dev:api
pnpm dev:web
```

Web 开发服务器默认地址为 `http://localhost:5173`，API 健康检查地址为 `http://localhost:3000/health`。

## 设计原则

- 原始学习文件默认只建立索引，不擅自移动、重命名或删除。
- 用标签、专题和笔记组成虚拟分类，避免破坏原有目录结构。
- 云同步和微信小程序通过同一套 API 接入；小程序不直接访问电脑磁盘。

# 架构说明

## MVP 边界

第一版只处理资料导入、元数据、分类标签、笔记和搜索。文件本体保留在用户指定的位置，系统记录路径和内容哈希，以避免误操作和重复导入。

## 数据流

```text
本地文件 → 导入器 → Document / Tag / Note → 本地索引与搜索
                                       ↓
                                 统一 API（后续）
                                       ↓
                              云端数据库与对象存储
                                       ↓
                                  微信小程序
```

## 技术选择

- Web：Vue 3、Vite、TypeScript
- API：Fastify、TypeScript
- 本地存储：SQLite（下一阶段引入）
- 云端：PostgreSQL + 对象存储（接入微信前引入）

当前机器尚未安装 Rust，因此暂不初始化 Tauri。Web 界面与业务逻辑会保持可复用，后续安装 Rust 后可将 `apps/web` 包装为桌面应用。

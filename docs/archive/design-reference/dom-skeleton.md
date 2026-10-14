# DOM 骨架树

> 数据来源：`Monthly Budget` 页面（含内联数据库），采集方式为遍历带 `notion-*` 语义类的元素并计算相对 `<html>` 的深度。
> 缩进表示父子关系，已省略无语义类的中间包装层（Notion 大量使用无类名的 `div` 做布局）。

## 1. 顶层骨架

```
notion-dark-theme                     ← 主题根（浅色时对应 notion-light-theme）
└── notion-app-inner
    ├── notion-cursor-listener        ← 全局光标/事件监听层
    ├── notion-print-ignore           ← 打印时忽略的 UI 层
    │   ├── notion-sidebar-container  (nav)
    │   │   └── notion-sidebar
    │   │       ├── notion-sidebar-switcher        ← 顶部工作区切换器
    │   │       │   ├── notion-record-icon
    │   │       │   └── notion-close-sidebar
    │   │       ├── notion-selectable-container
    │   │       │   └── notion-scroller
    │   │       │       ├── notion-draggable-list-collapse-empty   ← 可拖拽排序
    │   │       │       ├── notion-outliner-private-header-container
    │   │       │       │   ├── notion-outliner-private-header
    │   │       │       │   └── notion-outliner-private            ← 页面树容器
    │   │       │       │       └── notion-selectable.notion-page-block   ← 树里的每一页
    │   │       │       │           ├── notion-record-icon
    │   │       │       │           └── notion-sidebar-page-menu   ← 悬停出现的 ⋯ 菜单
    │   │       │       └── notion-selectable.notion-page-block    ← 折叠区（私人/共享等）
    │   │       └── notion-topbar
    │   │           └── notion-selectable-container
    │   │               ├── notion-topbar-breadcrumb-region   ← 面包屑 + 页面标题
    │   │               │   └── notion-record-icon
    │   │               └── notion-topbar-action-buttons
    │   │                   ├── notion-topbar-share-menu
    │   │                   ├── notion-topbar-favorite-button
    │   │                   └── notion-topbar-more-button
    │   └── notion-frame              (main)   ← 正文滚动容器
    │       └── notion-selectable-container
    │           └── notion-scroller
    │               ├── notion-selectable-hover-menu-item   ← 块的悬浮手柄（+ / ⋮⋮）
    │               ├── notion-page-cover         (img)     ← 封面图
    │               ├── notion-record-icon                  ← 页面图标
    │               ├── notion-page-controls                ← 封面/图标操作条
    │               ├── notion-selectable.notion-page-block ← 页面标题块
    │               └── notion-page-content                 ← ★ 块列表容器
    │                   └── …（见下）
    ├── notion-presence-container          ← 在线协作者头像
    ├── notion-peek-renderer               ← 侧边 peek 预览渲染器
    ├── notion-assistant-corner-origin-container
    │   └── notion-ai-button               ← 右下角 AI 入口
    └── notion-overlay-container.notion-default-overlay-container   ← 统一弹层容器
```

## 2. 正文块列表（`notion-page-content` 内部）

`Monthly Budget` 正文是"一段说明文字 + 左右两栏，每栏一个数据库"：

```
notion-page-content
├── notion-selectable.notion-text-block              ← 说明段落
│   ├── notion-enable-hover (span)                   ← 可 hover 高亮的行内片段
│   └── notion-inline-code-container                 ← 行内 code（如 Income / SUM）
├── notion-selectable.notion-column_list-block       ← 分栏列表
│   └── notion-selectable.notion-column-block        ← 单栏
│       └── notion-selectable.notion-collection_view-block   ← ★ 数据库
│           ├── notion-selectable.notion-collection_view-block   ← 数据库外壳
│           │   ├── notion-record-icon                ← 数据库图标
│           │   ├── notion-collection-add-view        ← 视图 tab 栏的 +
│           │   └── notion-collection-edit-view       ← 视图设置
│           └── notion-scroller.notion-collection-view-body
│               └── notion-table-view                 ← ★ 当前是"表格视图"
│                   ├── notion-selectable.notion-collection_view-block
│                   │   ├── notion-table-view-header-row
│                   │   │   └── notion-table-view-header-cell
│                   │   └── notion-table-view-add-column
│                   ├── notion-table-view-frozen-column-repositioner  ← 首列冻结拖拽条
│                   └── notion-selectable.notion-collection_view-block   ← 行容器
│                       └── notion-selectable.notion-page-block.notion-collection-item   ← ★ 行 = 页面
│                           └── notion-table-view-row
│                               └── notion-table-view-cell
│                                   └── notion-record-icon
│                   └── notion-table-view-add-row     ← 底部 + 新增行
└── notion-selectable.notion-text-block
```

## 3. 语义类名词汇表

### 3.1 应用外壳

| 类名 | 职责 |
| --- | --- |
| `notion-html` / `notion-body` | 根元素标记 |
| `notion-dark-theme` / 浅色对应主题类 | 主题根，整棵 UI 挂在下面 |
| `notion-app-inner` | 应用内层容器 |
| `notion-cursor-listener` | 全局光标/事件监听层 |
| `notion-print-ignore` | 打印时忽略 |
| `notion-overlay-container` / `notion-default-overlay-container` | 统一弹层宿主 |
| `notion-scroller` | 通用滚动容器（多处复用） |

### 3.2 左侧边栏

| 类名 | 职责 |
| --- | --- |
| `notion-sidebar-container` (nav) | 侧边栏最外层 |
| `notion-sidebar` | 侧边栏本体 |
| `notion-sidebar-switcher` | 顶部工作区切换器 |
| `notion-close-sidebar` | 收起按钮 |
| `notion-outliner-private-header-container` / `-header` / `-private` | 页面树的分组头与树容器 |
| `notion-draggable-list-collapse-empty` | 可拖拽/折叠的列表容器 |
| `notion-sidebar-page-menu` | 页面行悬停出现的 ⋯ 菜单 |

### 3.3 顶栏

| 类名 | 职责 |
| --- | --- |
| `notion-topbar` | 顶栏 |
| `notion-topbar-breadcrumb-region` | 面包屑 + 标题 |
| `notion-topbar-action-buttons` | 右侧动作区 |
| `notion-topbar-share-menu` / `-favorite-button` / `-more-button` | 共享 / 收藏 / 更多 |

### 3.4 页面与块

| 类名 | 职责 |
| --- | --- |
| `notion-frame` (main) | 正文容器 |
| `notion-page-cover` | 封面图 |
| `notion-page-controls` | 封面/图标操作条 |
| `notion-record-icon` | 页面/记录/数据库图标（多处复用） |
| `notion-page-content` | ★ 块列表容器 |
| `notion-selectable` | ★ 所有可选中对象（块）的基类 |
| `notion-selectable-container` | 可选中对象的容器 |
| `notion-selectable-hover-menu-item` | ★ 块悬停手柄（`+` 与 `⋮⋮`） |
| `notion-enable-hover` | 行内片段 hover 高亮 |
| `notion-inline-code-container` | 行内 code |

### 3.5 块类型（`notion-<type>-block`）

| 类名 | 备注 |
| --- | --- |
| `notion-text-block` | 文本 |
| `notion-to_do-block` | 待办（注意下划线命名） |
| `notion-toggle-block` | 折叠 |
| `notion-column_list-block` / `notion-column-block` | 分栏 |
| `notion-collection_view-block` | 数据库（内联） |
| `notion-page-block` | 页面/标题；**也用于数据库的行** |

> 命名规律：块类型 = `notion-` + 类型名（下划线分词）+ `-block`。斜杠菜单里的类型远不止这些，未逐一采样。

### 3.6 数据库与视图

| 类名 | 职责 |
| --- | --- |
| `notion-collection_view-block` | 数据库（含外壳与视图渲染） |
| `notion-collection-add-view` / `notion-collection-edit-view` | 视图 tab 栏的 + / 设置 |
| `notion-collection-view-body` | 视图内容区 |
| `notion-collection-item` | 单元格内容；**与 `notion-page-block` 同时出现在行上** |
| `notion-table-view` | 表格视图 |
| `notion-table-view-header-row` / `-header-cell` | 表头行 / 表头单元格 |
| `notion-table-view-row` / `-cell` | 数据行 / 数据单元格 |
| `notion-table-view-add-row` / `-add-column` | 底部加行 / 右侧加列 |
| `notion-table-view-frozen-column-repositioner` | 首列冻结拖拽条 |

### 3.7 协作与 AI

| 类名 | 职责 |
| --- | --- |
| `notion-presence-container` | 在线协作者头像组 |
| `notion-peek-renderer` | 侧边 peek 预览（点开行/链接不跳走） |
| `notion-ai-button` | 右下角 AI 入口 |
| `notion-assistant-corner-origin-container` | AI 入口的定位容器 |

## 4. 对复刻最有价值的 4 条结论

1. **块系统是一套"可选中文档对象"**：所有块共享 `notion-selectable` 基类，靠 `notion-<type>-block` 区分类型，靠 `notion-selectable-hover-menu-item` 提供统一操作入口。这是一套**正交设计**——新增块类型不用改操作层。
2. **数据库 = 块 + 视图壳**：`collection_view-block` 拆成"外壳（图标/tab/设置）"和"视图体（table-view / board-view / …）"两层，切视图只换视图体。
3. **行就是页面**：`notion-page-block notion-collection-item` 一词道破——行不是"记录"，而是货真价实的页面，所以行能开 peek、能有子页面。这是 Notion 数据库模型的精髓，也是最值得抄的一条。
4. **布局靠无名容器，语义靠 `notion-*` 钩子**：Notion 用大量无类名 `div` 承担布局，只给"有语义的对象"挂类名。我们复刻时可以直接借这个分层思路。

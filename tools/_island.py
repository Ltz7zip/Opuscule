# -*- coding: utf-8 -*-
"""正文编辑器孤岛（BlockNote）的探针助手。

**为什么需要它：** P3 把旧 vanilla 正文渲染链（`renderBlock` / 斜杠菜单 / 格式栏 /
块工具条）整条拆了，正文改由 React + BlockNote 的孤岛渲染。于是探针里原来那套
选择器（`.block-text` / `.block-menu` / `.slash-pop` / `.format-bar` / `.block-tools`）
全都点不到东西了。要碰正文的探针统一改用这里的常量与助手，别再各写一份。

**选择器（实测自 0.5.2 的孤岛产物）：**

    选择器                                含义
    ------------------------------------  --------------------------------------------
    .opuscule-editor-island               孤岛外壳（正文区的挂载点）
    .bn-editor                            正文根，也是 ProseMirror 的 contenteditable
    .bn-block-outer                       一个块；列表 / 折叠项会再嵌套出更多层
    .bn-block-content[data-content-type]  块内容，`data-content-type` 就是块类型
    .bn-inline-content                    块里的文本节点：点它落光标、读它取文本
    .bn-side-menu                         悬停块时浮出的侧菜单（两个按钮）
      button[aria-label="添加块"]           → 打开斜杠菜单（不可拖）
      button[aria-label="打开菜单"]         → 打开块菜单（删除 / 颜色），**同时是拖拽手柄**
                                              （`draggable="true"`，拖它就是挪块）
    .bn-drag-handle-menu                  块菜单本体
    .bn-suggestion-menu                   斜杠菜单本体
    .bn-suggestion-menu-item              菜单项（共 23 项）
    .bn-mt-suggestion-menu-item-title     菜单项标题文字
    .bn-formatting-toolbar                选中文字后浮出的格式条
    .mentions-inline[data-target]         名字自动识别贴上的链接（值是目标卡片 id）

**数据面的变化（很重要）：** 正文的权威存储是 `Card.blocks_doc`（BlockNote 原生
JSON）。探针想改一张卡的正文时必须 PUT `{"blocks_doc": [...]}`——老探针写
`{"blocks": [...]}` 已经无效（`blocks` 现在是服务端从 `blocks_doc` 派生出来的只读视图）。
"""

from __future__ import annotations

# ── 选择器 ────────────────────────────────────────────────────────────────────
ISLAND = ".opuscule-editor-island"
EDITOR = ".bn-editor"
BLOCK = ".bn-block-outer"
BLOCK_CONTENT = ".bn-block-content"
BLOCK_TEXT = ".bn-inline-content"
SIDE_MENU = ".bn-side-menu"
ADD_BLOCK_BTN = '.bn-side-menu button[aria-label="添加块"]'
OPEN_MENU_BTN = '.bn-side-menu button[aria-label="打开菜单"]'
# 块菜单那个按钮同时挂着 draggable="true"，拖它就是挪块。
DRAG_HANDLE = '.bn-side-menu button[draggable="true"]'
BLOCK_MENU = ".bn-drag-handle-menu"
SLASH_MENU = ".bn-suggestion-menu"
SLASH_ITEM = ".bn-suggestion-menu-item"
SLASH_ITEM_TITLE = ".bn-mt-suggestion-menu-item-title"
FORMAT_BAR = ".bn-formatting-toolbar"
MENTION = ".mentions-inline[data-target]"

# 块类型 → 选择器
def content_of(block_type: str) -> str:
    """某个块类型的内容选择器，例如 content_of("codeBlock")。"""
    return f'{BLOCK_CONTENT}[data-content-type="{block_type}"]'


# ── 块与文本 ──────────────────────────────────────────────────────────────────
def block_count(page) -> int:
    """块数。注意列表 / 折叠项的嵌套块也算在内。"""
    return page.locator(BLOCK).count()


def texts(page) -> list[str]:
    """按文档顺序取每个块的纯文本。"""
    return page.eval_on_selector_all(BLOCK_TEXT, "els => els.map(e => e.textContent)")


def text_at(page, index: int = 0) -> str:
    return page.locator(BLOCK_TEXT).nth(index).inner_text()


def place_cursor(page, index: int = 0) -> None:
    """点第 index 个块的文本，把光标落进去（随后就可以 keyboard.type）。"""
    page.locator(BLOCK_TEXT).nth(index).click()


def block_types(page) -> list[str]:
    return page.eval_on_selector_all(
        BLOCK_CONTENT, "els => els.map(e => e.getAttribute('data-content-type'))")


def has_editor(page) -> bool:
    """孤岛是否挂起来了（正文区有没有渲染成 BlockNote）。"""
    return page.locator(EDITOR).count() > 0


# ── 侧菜单 / 斜杠菜单 / 块菜单 / 格式条 ───────────────────────────────────────
def hover_block(page, index: int = 0) -> None:
    """悬停某个块——侧菜单（拖拽手柄 + 加号）只在这时出现。"""
    page.locator(BLOCK_CONTENT).nth(index).hover()
    page.wait_for_timeout(350)


def open_slash_menu(page, index: int = 0) -> bool:
    """点侧菜单的「添加块」打开斜杠菜单。

    **不改文档**：只是把菜单弹出来，不选任何一项就不会有块被插进去。"""
    hover_block(page, index)
    page.locator(ADD_BLOCK_BTN).click()
    page.wait_for_timeout(700)
    return page.locator(SLASH_MENU).count() > 0


def slash_items(page) -> list[str]:
    """当前斜杠菜单里的条目标题。"""
    return page.eval_on_selector_all(
        SLASH_ITEM_TITLE, "els => els.map(e => e.textContent.trim())")


def close_menus(page) -> None:
    page.keyboard.press("Escape")
    page.wait_for_timeout(350)


def open_block_menu(page, index: int = 0) -> bool:
    """点侧菜单的「打开菜单」打开块菜单（实测项为「删除」「颜色」）。

    **注意**：旧 vanilla 块菜单里的「复制这一块」不在孤岛的菜单里，孤岛的块菜单
    只有删除与颜色两项。探针不要再断言「复制这一块」。"""
    hover_block(page, index)
    page.locator(OPEN_MENU_BTN).click()
    page.wait_for_timeout(600)
    return page.locator(BLOCK_MENU).count() > 0


def block_menu_items(page) -> list[str]:
    return page.eval_on_selector_all(
        f"{BLOCK_MENU} button", "els => els.map(e => e.textContent.trim()).filter(Boolean)")


def formatting_bar_visible(page) -> bool:
    return page.locator(FORMAT_BAR).count() > 0


def bar_button(label: str) -> str:
    """格式条上某个按钮的选择器，例如 bar_button("加粗")。

    图标按钮没有文字，只有 `aria-label`；实测可用值：加粗 / 斜体 / 下划线 / 删除线 /
    左对齐 / 居中 / 右对齐 / 颜色 / 嵌套 / 取消嵌套 / 添加链接（首个「段落」是下拉，
    没有 aria-label）。"""
    return f'{FORMAT_BAR} button[aria-label="{label}"]'


def formatting_bar_items(page) -> list[str]:
    """格式条上的按钮名，优先取 aria-label（图标按钮），否则退回文字（如「段落」）。"""
    return page.eval_on_selector_all(
        f"{FORMAT_BAR} button",
        "els => els.map(e => (e.getAttribute('aria-label') || e.innerText).trim()).filter(Boolean)")


# ── 名字自动识别 ──────────────────────────────────────────────────────────────
def mentions(page) -> list[dict]:
    """正文里被识别成链接的名字（`{'text': ..., 'target': 卡片 id}`）。"""
    return page.eval_on_selector_all(
        MENTION, "els => els.map(e => ({ text: e.textContent, target: e.dataset.target }))")

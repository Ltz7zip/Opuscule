# -*- coding: utf-8 -*-
"""服务层：不依赖 ``world.views`` 的领域逻辑。

按领域拆成几个模块，各自只碰模型与 ``world.normalize`` / ``world.services.sanitize``：

* ``publish``   —— 发布成只读站点（站点级 / 文档级状态）
* ``exchange``  —— 导入 / 导出（Markdown 为主、JSON 为备份）
* ``autolink``  —— 正文里已存在的卡片名 / 别名识别
* ``graph``     —— 世界图谱（节点 + 连线的即时计算）
* ``geo``       —— 地图实体 ⇄ 世界编辑器 的桥
* ``sanitize``  —— 区块富文本的白名单净化
"""

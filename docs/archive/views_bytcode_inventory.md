# views.py 结构清单（从 bytecode 提取，重建源码时的对照表）

共 124 个顶层定义，原始行号范围 126–2706

## json_response(data, status)  — 原第 126 行
> 中文直接输出，不转义成 \uXXXX（与 timeline 应用一致）。
- 调用/属性：JsonResponse
- 字面量：'ensure_ascii'; 'no-store'; 'Cache-Control'

## parse_json(request)  — 原第 137 行
- 调用/属性：json, loads, body, ValueError, UnicodeDecodeError, isinstance, dict

## error(message, status)  — 原第 145 行
> error
- 调用/属性：json_response
- 字面量：'error'

## current_world_or_none()  — 原第 149 行
- 调用/属性：permissions, current_world_or_none

## __annotate__(format)  — 原第 153 行
- 字面量：'return'; 'World'

## current_world()  — 原第 153 行
> 单世界模式：取第一个世界；一个都没有就按调研文档 §16.1 的默认主题建一个。
- 调用/属性：World, objects, order_by, first, create, make_slug, timezone, now, isoformat, dict
- 字面量：'单世界模式：取第一个世界；一个都没有就按调研文档 §16.1 的默认主题建一个。'; 'id'; '新世界'; 'world'; 'dark-fantasy'; '通用 12 × 30'

## __annotate__(format)  — 原第 167 行
- 字面量：'world'; 'World'; 'return'; 'Document | None'

## get_document(world, doc_id)  — 原第 167 行
- 调用/属性：documents, filter, as_int, first

## __annotate__(format)  — 原第 171 行
- 字面量：'world'; 'World'; 'return'; 'EntityType | None'

## get_type(world, type_id)  — 原第 171 行
- 调用/属性：types, filter, as_int, first

## __annotate__(format)  — 原第 175 行
- 字面量：'world'; 'World'; 'return'; 'TimelineEvent | None'

## get_event(world, event_id)  — 原第 175 行
- 调用/属性：TimelineEvent, objects, filter, as_int, first

## __annotate__(format)  — 原第 179 行
- 字面量：'document'; 'Document'; 'return'; 'dict'

## timeline_state(document)  — 原第 179 行
> 时间线的完整状态：日历 + 纪元 + 事件 + 视野。
- 调用/属性：world, isinstance, settings, dict, as_int, get, calendars, filter, first, order_by
- 字面量：'时间线的完整状态：日历 + 纪元 + 事件 + 视野。'; 'calendar'; 'id'; '通用 12 × 30'; 'settings'; 'era'

## __annotate__(format)  — 原第 206 行
- 字面量：'document'; 'Document | None'; 'label'; 'str'; 'return'; 'None'

## touch_document(document, label, author)  — 原第 206 行
> 顶一下文档的 updated_at（auto_now 会在 save 时刷新）——发布状态靠它算 stale。
- 调用/属性：isinstance, settings, dict, as_int, get, save, snapshot_document, Exception
- 字面量：'revision'; 'updated_at'; 'settings'; '内容改动'

## __annotate__(format)  — 原第 224 行
- 字面量：'document'; 'Document'; 'patch'; 'dict'; 'return'; 'None'

## save_document_settings(document, patch)  — 原第 224 行
- 调用/属性：isinstance, settings, dict, update

## __annotate__(format)  — 原第 230 行
- 字面量：'card'; 'Card'; 'world'; 'World'; 'payload'; 'dict'

## apply_card_payload(card, world, payload)  — 原第 230 行
> 把请求体里的别名 / 属性值 / 区块写进卡片（属性值逐条按类型校验）。
- 调用/属性：as_alias_list, get, aliases, str, strip, dict, models, ERA_MODES, era_mode, isinstance
- 字面量：'把请求体里的别名 / 属性值 / 区块写进卡片（属性值逐条按类型校验）。'; 'aliases'; 'era_mode'; 'era_ids'; 'blocks'; 'entity_type'

## workspace(request)  — 原第 271 行
> 工作区页面：前端自己再拉 /api/world/state 启动。
- 调用/属性：render
- 字面量：'工作区页面：前端自己再拉 /api/world/state 启动。'; 'workspace.html'

## world_detail(request)  — 原第 281 行
> 读 / 改当前世界（名称、主题、AI 与自动识别开关、题材）。
- 调用/属性：current_world, method, json_response, to_payload, parse_json, as_text, get, name, description, isinstance
- 字面量：'读 / 改当前世界（名称、主题、AI 与自动识别开关、题材）。'; 'GET'; 'name'; 'description'; 'theme_config'; 'genres'

## state(request)  — 原第 310 行
- 调用/属性：current_world, documents, filter, order_by, to_payload, Card, objects, document_id, era_mode, isinstance
- 字面量：'position'; 'id'; 'world'; 'viewer'; 'online'; 'types'

## document_collection(request)  — 原第 348 行
> GET
- 调用/属性：current_world, method, documents, filter, GET, get, as_int, as_text, json_response, order_by
- 字面量：'GET'; 'type'; 'parent'; 'documents'; 'position'; 'id'

## document_detail(request, doc_id)  — 原第 406 行
> hard
- 调用/属性：current_world, GET, get, method, documents, filter, as_int, first, get_document, json_response
- 字面量：'hard'; 'DELETE'; 'GET'; 'children'; 'revision'; 'success'

## __annotate__(format)  — 原第 484 行
- 字面量：'mode'; 'str'; 'error'; 'status'; 'int'

## _auth_page(request, mode, error, status)  — 原第 484 行
- 调用/属性：current_world_or_none, permissions, users_exist, POST, get, GET, strip, InviteCode, objects, filter
- 字面量：'invite'; '这个邀请码不存在，检查一下是不是复制少了字符'; '这个邀请码已经用完了，找所有者再要一个'; '邀请码有效，填好用户名和密码就能进'; 'register'; 'mode'

## login_page(request)  — 原第 523 行
> /world
- 调用/属性：user, is_authenticated, redirect, permissions, users_exist, method, _auth_page, django.contrib.auth, authenticate, login
- 字面量：'/world'; '/register'; 'POST'; 'login'; 'username'; 'password'

## register_page(request)  — 原第 544 行
- 调用/属性：django.contrib.auth.models, User, django.contrib.auth.password_validation, validate_password, django.core.exceptions, ValidationError, models, ROLE_OWNER, method, _auth_page
- 字面量：'POST'; 'register'; 'username'; 'password'; 'invite'; 'display_name'

## logout_page(request)  — 原第 607 行
- 调用/属性：django.contrib.auth, logout, user, is_authenticated, Presence, objects, filter, delete, redirect
- 字面量：'/world'

## document_data(request, doc_id)  — 原第 621 行
> 文档的"工具数据"：存在 settings.data 里，各工具自己解释结构。
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, isinstance, settings, dict, get, method, to_payload
- 字面量：'data'; 'GET'; 'document'; 'media'; 'data 必须是对象'; '这份数据太大了（上限约 400 KB）'

## document_media(request, doc_id)  — 原第 664 行
> 文档里的媒体（语音、图片…）：文件落盘，元数据挂在 settings.media。
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, isinstance, settings, dict, get, list, method
- 字面量：'文档里的媒体（语音、图片…）：文件落盘，元数据挂在 settings.media。'; 'media'; 'DELETE'; 'id'; 'path'; 'settings'

## __annotate__(format)  — 原第 721 行
- 字面量：'document'; 'Document'; 'return'; 'dict'

## _table_config(world, document)  — 原第 721 行
> 表格配置；没配过类型就猜一个（第一张卡的类型 / 世界的第一个类型），
- 调用/属性：isinstance, settings, dict, get, get_type, Document, objects, filter, exclude, order_by
- 字面量：'表格配置；没配过类型就猜一个（第一张卡的类型 / 世界的第一个类型），\n这样新建的表格不会是一张空表。'; 'table'; 'entity_type'; 'card'; 'position'; 'id'

## __annotate__(format)  — 原第 735 行
- 字面量：'document'; 'Document'; 'return'; 'dict'

## table_payload(world, document)  — 原第 735 行
> 表格内容：列（属性）+ 行（这一类型的卡片）。
- 调用/属性：_table_config, Document, objects, filter, as_int, all_properties, id, select_related, order_by, getattr
- 字面量：'表格内容：列（属性）+ 行（这一类型的卡片）。'; 'entity_type'; 'card'; 'parent'; 'columns'; 'position'

## table_detail(request, doc_id)  — 原第 767 行
- 调用/属性：current_world, get_document, document_type, json_response, DOC_NOT_FOUND, method, table_payload, parse_json, isinstance, settings
- 字面量：'table'; 'GET'; 'entity_type'; 'columns'; 'settings'

## table_cell(request, doc_id)  — 原第 793 行
> 改一个单元格 = 改那张卡片的属性值（这就是"双向绑定"）。
- 调用/属性：current_world, get_document, document_type, json_response, DOC_NOT_FOUND, parse_json, get, error, Card, objects
- 字面量：'改一个单元格 = 改那张卡片的属性值（这就是"双向绑定"）。'; 'table'; 'row'; '找不到这一行对应的卡片'; 'entity_type'; 'name'

## table_rows(request, doc_id)  — 原第 832 行
> 加一行（= 建一张卡片）或删一行。
- 调用/属性：current_world, get_document, document_type, json_response, DOC_NOT_FOUND, _table_config, method, parse_json, get, timezone
- 字面量：'加一行（= 建一张卡片）或删一行。'; 'table'; 'DELETE'; 'row'; 'deleted_at'; '删表格行'

## table_csv(request, doc_id)  — 原第 862 行
> CSV 进出：导出当前视图；导入按"名称"匹配已有行并更新。
- 调用/属性：csv, io, django.http, HttpResponse, current_world, get_document, document_type, json_response, DOC_NOT_FOUND, table_payload
- 字面量：'CSV 进出：导出当前视图；导入按"名称"匹配已有行并更新。'; 'table'; 'columns'; 'GET'; '名称'; 'name'

## __annotate__(format)  — 原第 937 行
- 字面量：'return'; 'dict'

## _user_payload(user)  — 原第 937 行
> id
- 调用/属性：id, get_full_name, username, upper, email
- 字面量：'id'; 'username'; 'handle'; 'initial'; 'email'

## auth_me(request)  — 原第 947 行
> 我是谁、能不能编辑、要不要先做初始化。
- 调用/属性：current_world_or_none, json_response, permissions, viewer_payload, user
- 字面量：'我是谁、能不能编辑、要不要先做初始化。'

## auth_register(request)  — 原第 955 行
> 注册。第一个账号直接成为所有者；之后必须带有效的邀请码。
- 调用/属性：django.contrib.auth, login, django.contrib.auth.models, User, django.core.exceptions, ValidationError, django.contrib.auth.password_validation, validate_password, models, InviteCode
- 字面量：'注册。第一个账号直接成为所有者；之后必须带有效的邀请码。'; 'username'; 'password'; 'invite'; 'display_name'; '用户名至少 3 个字符'

## _any_document(world)  — 原第 1017 行
> id
- 调用/属性：documents, order_by, first, Document, objects, create
- 字面量：'id'; 'folder'; '资料'

## auth_login(request)  — 原第 1024 行
- 调用/属性：django.contrib.auth, authenticate, login, parse_json, get, strip, error, current_world, Membership, objects
- 字面量：'username'; 'password'; '用户名或密码不对'; 'owner'; 'user'; 'viewer'

## auth_logout(request)  — 原第 1045 行
- 调用/属性：django.contrib.auth, logout, user, is_authenticated, Presence, objects, filter, delete, json_response
- 字面量：'ok'

## collaborators(request)  — 原第 1056 行
> 成员列表 + 邀请码（有权限的人才能看邀请码）。
- 调用/属性：current_world, permissions, viewer_payload, user, memberships, select_related, to_payload, InviteCode, objects, filter
- 字面量：'成员列表 + 邀请码（有权限的人才能看邀请码）。'; 'user'; 'members'; 'viewer'; 'invites'; 'can_admin'

## invite_create(request)  — 原第 1069 行
> 只有所有者能发邀请码
- 调用/属性：current_world, permissions, can_admin, user, error, parse_json, get, dict, Membership, _meta
- 字面量：'只有所有者能发邀请码'; 'role'; 'editor'; 'code'; '这个邀请码已经存在'; 'note'

## invite_delete(request, invite_id)  — 原第 1091 行
> 只有所有者能删邀请码
- 调用/属性：current_world, permissions, can_admin, user, error, InviteCode, objects, filter, as_int, delete
- 字面量：'只有所有者能删邀请码'; 'ok'

## member_detail(request, member_id)  — 原第 1101 行
> 只有所有者能改成员
- 调用/属性：current_world, permissions, can_admin, user, error, memberships, filter, as_int, select_related, first
- 字面量：'只有所有者能改成员'; 'user'; '成员不存在'; 'DELETE'; 'owner'; '至少要留一个所有者'

## presence(request)  — 原第 1124 行
> 在线状态：GET 看谁在，POST 打一次心跳。
- 调用/属性：current_world, method, user, is_authenticated, json_response, parse_json, get, get_document, Presence, touch
- 字面量：'在线状态：GET 看谁在，POST 打一次心跳。'; 'POST'; 'online'; 'document'; 'count'

## __annotate__(format)  — 原第 1140 行
- 字面量：'document'; 'Document'; 'label'; 'str'; 'return'; 'DocumentVersion | None'

## snapshot_document(document, label, author)  — 原第 1140 行
> 给文档留一版快照。同一作者 90 秒内的连续改动合并成一版（不然打字会刷屏）。
- 调用/属性：, exchange, document_payload, pop, versions, order_by, first, author_id, getattr, timezone
- 字面量：'给文档留一版快照。同一作者 90 秒内的连续改动合并成一版（不然打字会刷屏）。'; 'updated_at'; 'publish_state'; '-index'; 'id'; 'is_authenticated'

## __annotate__(format)  — 原第 1175 行
- 字面量：'document'; 'Document'; 'return'; 'str'

## _summarize(document)  — 原第 1175 行
> card
- 调用/属性：getattr, blocks, isinstance, dict, get, len, join, document_type, events, count
- 字面量：'card'; 'title'; ' 个区块'; 'timeline'; ' 个事件'; 'map'

## document_versions(request, doc_id)  — 原第 1190 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, versions, all, MAX_VERSIONS, id, name, to_payload
- 字面量：'document'; 'id'; 'name'; 'versions'

## document_version_detail(request, doc_id, index)  — 原第 1204 行
- 调用/属性：, exchange, current_world, get_document, json_response, DOC_NOT_FOUND, versions, filter, as_int, first
- 字面量：'没有这一版'; 'GET'; '回滚前的自动备份'; 'card'; 'entity_type'; 'name'

## export_world(request)  — 原第 1237 行
> 导出整个世界的 zip（Markdown + JSON 备份），或只要 JSON。
- 调用/属性：django.http, HttpResponse, , exchange, current_world, GET, get, lower, timezone, now
- 字面量：'导出整个世界的 zip（Markdown + JSON 备份），或只要 JSON。'; 'format'; 'zip'; '%Y%m%d-%H%M'; '[\\\\/:*?"<>|]+'; 'world'

## export_document(request, doc_id)  — 原第 1262 行
> 单份文档导出：Markdown（默认）或 JSON。
- 调用/属性：django.http, HttpResponse, , exchange, current_world, get_document, json_response, DOC_NOT_FOUND, re, sub
- 字面量：'单份文档导出：Markdown（默认）或 JSON。'; '[\\\\/:*?"<>|]+'; 'document'; 'format'; 'markdown'; 'json'

## import_files(request)  — 原第 1289 行
> 导入 Markdown / zip / world.json。
- 调用/属性：io, zipfile, , exchange, current_world, content_type, startswith, POST, get, get_document
- 字面量：'card'; 'multipart/form-data'; 'parent'; 'as_type'; 'files'; '.zip'

## calendar_month(request, calendar_id)  — 原第 1374 行
> 一个月的网格（含月相与当天事件），给「日历视图」用。
- 调用/属性：, calendarview, current_world, calendars, filter, as_int, first, error, GET, get
- 字面量：'一个月的网格（含月相与当天事件），给「日历视图」用。'; '日历不存在'; 'year'; 'month'; 'document'; 'moons'

## suggestions(request)  — 原第 1394 行
> 「值得添加」：本地规则统计，不调用任何外部模型。
- 调用/属性：, autolink, current_world, ai_enabled, json_response, list, Card, objects, filter, select_related
- 字面量：'enabled'; 'entities'; 'empty_cards'; 'orphans'; 'events'; 'document'

## trash_collection(request)  — 原第 1457 行
> 回收站：软删除（``deleted_at``）的文档列出来，可恢复或彻底删。
- 调用/属性：current_world, documents, filter, order_by, json_response, count, to_payload
- 字面量：'回收站：软删除（``deleted_at``）的文档列出来，可恢复或彻底删。'; '-deleted_at'; 'count'; 'documents'

## document_restore(request, doc_id)  — 原第 1469 行
> 从回收站恢复；父文件夹也被删了就提到顶层，免得恢复出一个看不见的孤儿。
- 调用/属性：current_world, documents, filter, as_int, first, deleted_at, json_response, DOC_NOT_FOUND, parent, save
- 字面量：'从回收站恢复；父文件夹也被删了就提到顶层，免得恢复出一个看不见的孤儿。'; 'parent'; 'deleted_at'

## document_duplicate(request, doc_id)  — 原第 1484 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, transaction, atomic, Document, objects, create, document_type
- 字面量：'（副本）'; 'card'

## type_collection(request)  — 原第 1539 行
> GET
- 调用/属性：current_world, method, json_response, types, all, to_payload, parse_json, as_text, get, filter
- 字面量：'GET'; 'types'; 'name'; '新类型'; '已经有一个叫「'; '」的类型了'

## type_detail(request, type_id)  — 原第 1568 行
- 调用/属性：current_world, get_type, json_response, TYPE_NOT_FOUND, method, children, update, parent, documents, to_payload
- 字面量：'DELETE'; 'success'; 'removed'; 'name'; '已经有一个叫「'; '」的类型了'

## property_collection(request, type_id)  — 原第 1606 行
- 调用/属性：current_world, get_type, json_response, TYPE_NOT_FOUND, parse_json, as_text, get, properties, filter, exists
- 字面量：'name'; '新属性'; '」已经有「'; '」这个属性了'; 'options'; 'reference_type'

## property_detail(request, property_id)  — 原第 1643 行
- 调用/属性：current_world, PropertyDef, objects, filter, as_int, first, json_response, method, to_payload, delete
- 字面量：'error'; '未找到该属性'; 'DELETE'; 'success'; 'removed'; 'name'

## card_detail(request, doc_id)  — 原第 1680 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, Card, objects, get_or_create, entity_type, method, to_payload
- 字面量：'entity_type'; 'GET'; 'document'; 'card'; 'revision'; 'error'

## timeline_state_view(request, doc_id)  — 原第 1728 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, document_type, DOC_TIMELINE, error, timeline_state
- 字面量：'这个文档不是时间线'

## __annotate__(format)  — 原第 1740 行
- 字面量：'world'; 'World'; 'payload'; 'dict'; 'document'; 'Document'

## _clean_event_payload(world, payload, document, event)  — 原第 1740 行
> 把请求体写进事件对象（精度决定哪些字段有意义）。
- 调用/属性：TimelineEvent, as_text, get, title, VALID_PRECISIONS, precision, setattr, as_int, getattr, eras
- 字面量：'把请求体写进事件对象（精度决定哪些字段有意义）。'; 'title'; '未命名事件'; 'precision'; 'era'; 'description'

## event_collection(request, doc_id)  — 原第 1767 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, document_type, DOC_TIMELINE, error, _clean_event_payload, parse_json, save
- 字面量：'这个文档不是时间线'

## event_detail(request, event_id)  — 原第 1782 行
- 调用/属性：current_world, get_event, json_response, EVENT_NOT_FOUND, method, to_payload, document, delete, touch_document, _clean_event_payload
- 字面量：'DELETE'; 'success'; 'removed'; '编辑时间线'

## event_cards(request, event_id, card_id)  — 原第 1802 行
- 调用/属性：current_world, get_event, json_response, EVENT_NOT_FOUND, method, as_int, parse_json, get, get_document, DOC_NOT_FOUND
- 字面量：'DELETE'; 'card_id'; 'featured_card'; 'success'; 'event'; 'featured'

## __annotate__(format)  — 原第 1836 行
- 字面量：'payload'; 'dict'; 'calendar'; 'Calendar'; 'return'

## _clean_calendar_payload(payload, calendar)  — 原第 1836 行
> name
- 调用/属性：as_text, get, name, CAL_EARTH, CAL_CUSTOM, mode, max, min, as_int, hours_per_day
- 字面量：'name'; 'mode'; 'hours_per_day'; 'months'; 'Month '; 'days'

## calendar_collection(request)  — 原第 1879 行
> GET
- 调用/属性：current_world, method, json_response, calendars, all, to_payload, parse_json, _clean_calendar_payload, Calendar, save
- 字面量：'GET'; 'calendars'; '新日历'

## calendar_detail(request, calendar_id)  — 原第 1891 行
- 调用/属性：current_world, calendars, filter, as_int, first, json_response, CALENDAR_NOT_FOUND, method, count, error
- 字面量：'DELETE'; '至少要保留一个日历'; 'success'; 'events'

## calendar_preset(request, calendar_id)  — 原第 1915 行
> 把当前日历存成预设（调研文档 §6.1：预设可应用到本世界任意时间线）。
- 调用/属性：current_world, calendars, filter, as_int, first, json_response, CALENDAR_NOT_FOUND, parse_json, Calendar, objects
- 字面量：'把当前日历存成预设（调研文档 §6.1：预设可应用到本世界任意时间线）。'; 'name'; ' 预设'

## calendar_apply_preset(request, doc_id)  — 原第 1938 行
> 把某个预设应用到一条时间线。
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, parse_json, calendars, filter, as_int, get, first
- 字面量：'把某个预设应用到一条时间线。'; 'preset'; 'mode'; 'hours_per_day'; 'months'; 'moons'

## era_collection(request)  — 原第 1968 行
> GET
- 调用/属性：current_world, method, json_response, eras, all, to_payload, parse_json, as_text, get, Era
- 字面量：'GET'; 'eras'; 'theme'; 'name'; '新纪元'; 'length_years'

## era_detail(request, era_id)  — 原第 1989 行
- 调用/属性：current_world, eras, filter, as_int, first, json_response, ERA_NOT_FOUND, method, to_payload, delete
- 字面量：'DELETE'; 'success'; 'removed'; 'name'; 'length_years'; 'theme_config'

## search(request)  — 原第 2022 行
> 全库搜索：标题、别名、正文、属性值都能命中（⌘K 用它）。
- 调用/属性：current_world, as_text, GET, get, min, max, as_int, json_response, casefold, documents
- 字面量：'全库搜索：标题、别名、正文、属性值都能命中（⌘K 用它）。'; 'limit'; 'query'; 'results'; 'entity_type'; 'card'

## autolink_view(request)  — 原第 2076 行
> 正文里的名字识别：返回命中的卡片与位置（前端据此渲染链接）。
- 调用/属性：current_world, parse_json, as_text, get, as_int, json_response, autolink, find_mentions
- 字面量：'正文里的名字识别：返回命中的卡片与位置（前端据此渲染链接）。'; 'text'; 'exclude'; 'matches'

## backlinks(request, doc_id)  — 原第 2087 行
> 谁提到了这张卡（按名字/别名在正文与标题里出现来算）。
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, getattr, mention_names, name, documents, filter, exclude
- 字面量：'谁提到了这张卡（按名字/别名在正文与标题里出现来算）。'; 'card'; 'id'; 'name'; 'type'; 'matched'

## __annotate__(format)  — 原第 2115 行
- 字面量：'return'; 'Document | None'

## _timeline_document(request, doc_id)  — 原第 2115 行
- 调用/属性：get_document, current_world, document_type, DOC_TIMELINE

## classic_timeline(request, doc_id)  — 原第 2122 行
> 整条时间线，结构与传统 /api/timeline 完全一致。
- 调用/属性：_timeline_document, json_response, DOC_NOT_FOUND, classic_service, classic_payload
- 字面量：'整条时间线，结构与传统 /api/timeline 完全一致。'

## classic_items(request, doc_id)  — 原第 2132 行
> 新建：``kind="era"`` 走纪元，其余走事件。
- 调用/属性：_timeline_document, json_response, DOC_NOT_FOUND, parse_json, get, classic_service, create_era, apply_item
- 字面量：'新建：``kind="era"`` 走纪元，其余走事件。'; 'kind'; 'era'

## classic_item_detail(request, doc_id, item_id)  — 原第 2145 行
> 更新 / 删除：id ≥ 1_000_000 的是纪元，其余是事件。
- 调用/属性：_timeline_document, json_response, DOC_NOT_FOUND, method, classic_service, delete_item, ERA_ID_BASE, ITEM_NOT_FOUND, parse_json, apply_era
- 字面量：'更新 / 删除：id ≥ 1_000_000 的是纪元，其余是事件。'; 'DELETE'; 'error'; '未找到该纪元'; 'success'; 'removed'

## classic_view(request, doc_id)  — 原第 2172 行
> 记住视野（编辑器滑到哪儿，下次回来还在哪儿）。
- 调用/属性：_timeline_document, json_response, DOC_NOT_FOUND, parse_json, get, float, TypeError, ValueError, classic_service, save_view
- 字面量：'记住视野（编辑器滑到哪儿，下次回来还在哪儿）。'; 'start'; 'end'

## __annotate__(format)  — 原第 2199 行
- 字面量：'world'; 'World'; 'return'; 'TreeNode | None'

## get_tree_node(world, node_id)  — 原第 2199 行
- 调用/属性：TreeNode, objects, filter, as_int, first

## __annotate__(format)  — 原第 2203 行
- 字面量：'world'; 'World'; 'return'; 'TreeVariant | None'

## get_variant(world, variant_id)  — 原第 2203 行
- 调用/属性：TreeVariant, objects, filter, as_int, first

## __annotate__(format)  — 原第 2207 行
- 字面量：'document'; 'Document'; 'return'; 'dict'

## tree_state(document)  — 原第 2207 行
> Main
- 调用/属性：list, tree_variants, all, TreeVariant, objects, create, as_int, settings, get, next
- 字面量：'Main'; 'family'; 'active_variant'; 'document'; 'variants'; 'active'

## tree_state_view(request, doc_id)  — 原第 2222 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, document_type, error, tree_state
- 字面量：'familyTree'; '这个文档不是关系树'

## tree_variant_collection(request, doc_id)  — 原第 2234 行
> 新建一棵树；``fork_from`` 给出源 variant 时复制它（对齐 New variant (forks the current one)）。
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, parse_json, get, get_variant, fork, as_text, TreeVariant
- 字面量：'fork_from'; 'name'; 'kind'; 'family'; 'Variant '; 'active_variant'

## tree_variant_detail(request, variant_id)  — 原第 2259 行
- 调用/属性：current_world, get_variant, json_response, method, document, tree_variants, count, error, delete, parse_json
- 字面量：'error'; '未找到这棵树'; 'DELETE'; '至少要保留一棵树'; 'success'; 'name'

## tree_node_collection(request, variant_id)  — 原第 2291 行
- 调用/属性：current_world, get_variant, json_response, parse_json, get, get_document, TreeNode, objects, create, as_text
- 字面量：'error'; '未找到这棵树'; 'card'; 'name'; '新成员'; 'subtitle'

## tree_node_detail(request, node_id)  — 原第 2316 行
- 调用/属性：current_world, get_tree_node, json_response, method, to_payload, variant, delete, touch_document, document, parse_json
- 字面量：'error'; '未找到这个成员'; 'DELETE'; 'success'; 'removed'; 'card'

## tree_node_card(request, node_id)  — 原第 2353 行
> 给树上的人**新建一张卡片**并吸附上去（对齐 "any person can get ... a new card"）。
- 调用/属性：current_world, get_tree_node, json_response, parse_json, get, get_type, Document, objects, create, DOC_CARD
- 字面量：'给树上的人**新建一张卡片**并吸附上去（对齐 "any person can get ... a new card"）。'; 'error'; '未找到这个成员'; 'entity_type'; 'name'; 'id'

## tree_edge_collection(request, variant_id)  — 原第 2379 行
- 调用/属性：current_world, get_variant, json_response, parse_json, get_tree_node, get, id, error, variant_id, as_text
- 字面量：'error'; '未找到这棵树'; 'source'; 'target'; '关系的两端必须是树上的两个人'; '两个人不在同一棵树上'

## tree_edge_detail(request, edge_id)  — 原第 2406 行
- 调用/属性：current_world, TreeEdge, objects, filter, as_int, first, json_response, method, to_payload, variant
- 字面量：'error'; '未找到这条关系'; 'DELETE'; 'success'; 'removed'; 'kind'

## __annotate__(format)  — 原第 2437 行
- 字面量：'world'; 'World'; 'return'; 'MapMarker | None'

## get_marker(world, marker_id)  — 原第 2437 行
- 调用/属性：MapMarker, objects, filter, as_int, first

## __annotate__(format)  — 原第 2441 行
- 字面量：'document'; 'Document'; 'return'; 'dict'

## map_state(document)  — 原第 2441 行
> 默认
- 调用/属性：list, map_layers, all, MapLayer, objects, create, isinstance, settings, dict, to_payload
- 字面量：'默认'; 'document'; 'layers'; 'markers'; 'card'; 'background'

## map_state_view(request, doc_id)  — 原第 2461 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, document_type, error, map_state
- 字面量：'map'; '这个文档不是地图'

## map_background(request, doc_id)  — 原第 2473 行
> 设置底图：上传文件（multipart）或粘贴 URL；``clear=1`` 清空。
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, content_type, startswith, FILES, get, error, size
- 字面量：'设置底图：上传文件（multipart）或粘贴 URL；``clear=1`` 清空。'; 'multipart/'; 'file'; '没有收到文件'; '图片超过 25 MB，建议先压缩'; '只支持 PNG / JPEG / WebP / GIF / AVIF'

## map_layer_collection(request, doc_id)  — 原第 2511 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, parse_json, MapLayer, objects, create, as_text, get
- 字面量：'name'; '图层 '

## map_layer_detail(request, layer_id)  — 原第 2527 行
- 调用/属性：current_world, MapLayer, objects, filter, as_int, first, json_response, method, document, map_layers
- 字面量：'error'; '未找到这个图层'; 'DELETE'; '至少要保留一个图层'; 'success'; 'removed'

## map_marker_collection(request, doc_id)  — 原第 2554 行
- 调用/属性：current_world, get_document, json_response, DOC_NOT_FOUND, parse_json, as_text, get, MARKER_PIN, MapLayer, objects
- 字面量：'kind'; 'layer'; 'card'; 'color'; 'name'; 'description'

## map_marker_detail(request, marker_id)  — 原第 2588 行
- 调用/属性：current_world, get_marker, json_response, method, to_payload, document, delete, touch_document, parse_json, as_text
- 字面量：'error'; '未找到这个标注'; 'DELETE'; 'success'; 'removed'; 'kind'

## graph_view(request)  — 原第 2638 行
> 世界图谱：节点 + 连线（引用 / 事件关联 / 正文提及）。
- 调用/属性：current_world, graph_service, build_graph, as_text, GET, get, as_int, clamp_int, get_document, name
- 字面量：'hide_isolated'; 'center'; 'depth'; 'limit'; 'center_name'; 'isolated_suggestions'

## __annotate__(format)  — 原第 2662 行
- 字面量：'value'; 'int'; 'low'; 'high'; 'return'

## clamp_int(value, low, high)  — 原第 2662 行
- 调用/属性：max, min

## publish_view(request)  — 原第 2669 行
> GET 看站点状态；POST 发布 / 重新发布。
- 调用/属性：current_world, method, json_response, publish_summary, AUDIENCES, parse_json, as_text, get, audience, publish_service
- 字面量：'GET 看站点状态；POST 发布 / 重新发布。'; 'GET'; 'publish'; 'audiences'; 'value'; 'label'

## unpublish_view(request)  — 原第 2695 行
> 下线站点：内容保留，站点立刻 404。
- 调用/属性：current_world, json_response, publish_service, unpublish
- 字面量：'下线站点：内容保留，站点立刻 404。'; 'publish'

## api_fallback(request)  — 原第 2706 行
- 调用/属性：json_response, API_NOT_FOUND

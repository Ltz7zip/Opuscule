// Opuscule 正文编辑器孤岛（React + BlockNote）。
//
// 这个文件是整个工作区里唯一跑在 React 上的东西：它只管一张卡的正文块，
// 外面那圈（侧栏 / 属性 / 评论 / 顶栏 / 地图）仍然是 vanilla。
//
// 对外只暴露一个全局 `window.OpusEditorIsland`，桥接层（static/workspace.js）
// 通过它挂载 / 卸载 / 取回文档，岛内不碰网络、不碰全局状态。

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BlockNoteSchema,
  createExtension,
  defaultBlockSpecs,
  defaultProps,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from '@blocknote/core';
// 名字自动识别要往视图上贴一层装饰。state / view 两包是 BlockNote 自己的依赖，
// 这里顺手 declare 进了 package.json，只取 Plugin / PluginKey / Decoration 这几个符号。
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  useCreateBlockNote,
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from '@blocknote/react';
// 带样式的 BlockNoteView 在 mantine 包（react 包只导出无样式的 BlockNoteViewRaw）。
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';

// 样式：core 是编辑器骨架，mantine 是 UI 组件（斜杠菜单 / 悬浮工具条）。
// 刻意不引 `@blocknote/core/fonts/inter.css`——字形交给工作区自己的字体栈。
import '@blocknote/core/style.css';
import '@blocknote/mantine/style.css';
// 孤岛自己的样式（自定义块外观），排在最后以便覆盖上面两包。
import './editor.css';

export const ISLAND_VERSION = '0.5.2';

// 一期只放行后端 `normalize_doc` 认得的那 10 种块。这里必须与后端
// `apps/world/normalize.py` 的 `_DOC_BLOCK_TYPES` 保持一致：
// 多注册一种，用户就能建出保存时被静默丢弃的块。
const {
  paragraph,
  heading,
  quote,
  bulletListItem,
  numberedListItem,
  checkListItem,
  codeBlock,
  divider,
  toggleListItem,
} = defaultBlockSpecs;

// BlockNote 没有 callout 块，但旧数据里有——写一个最简的顶上：
// 只做行内内容 + 默认 props（对齐 / 文字色 / 底色），外观全靠 editor.css。
// 注意 `createReactBlockSpec` 返回的是工厂，必须再调用一次才是 BlockSpec。
const callout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: { ...defaultProps },
    content: 'inline',
  },
  {
    render: ({ contentRef }) => <div className="opus-callout" ref={contentRef} />,
  },
)();

// ── 重块嵌入 ────────────────────────────────────────────────────────────────
// image / bookmark / card / collection 的数据都在 props 里，孤岛搬得动；但它们的
// 「长相」（图床、卡片预览、内联数据库表格）是一大坨 vanilla DOM，重建代价高。
// 一期做法是**嵌现有渲染器**：孤岛只挂一个空容器，通过桥接层回调让
// static/workspace.js 用旧渲染器把 DOM 画进来（见 TECHNO §8.4）。
// 由此重块在孤岛内渲染出来是**只读**的——vanilla 渲染器那套点击 / 输入事件不接。
// 新建重块走反方向：斜杠菜单点重块 → bridge.prepareHeavyBlock 弹 vanilla 对话框
// 拿数据 → 写进 doc（见下方 HEAVY_SLASH_ITEMS / insertHeavyBlock）。
/* ── 名字自动识别（正文里写到的卡片名 / 别名）────────────────────────────────
   接入孤岛前，这下活由 vanilla 硬干：拿服务端匹配结果去重写 `.block-text` 的
   innerHTML，把命中的名字包成 `<span class="mentions-inline">`。正文改由孤岛渲染
   之后这条路断了（`.block-text` 不复存在），而且**不能照搬**——正文是 ProseMirror
   管的，直接在它的 DOM 上重写会连光标、选区和撤销栈一起打坏。

   改成 ProseMirror 的**装饰（decoration）**：只往视图上贴一层外壳，
   文档、选区、撤销栈一概不动，编辑行为完全不受影响。

   名单由桥接层喂进来（岛内依旧不碰网络）：handle.setMentions([{ name, id }])。
   装饰在文档每次变化时按当前名单重算，所以刚敲出来的名字也会立刻被识别。
   点击由桥接层挂在容器上的委托监听接管，见 static/workspace.js。 */
const MENTIONS_PLUGIN_KEY = new PluginKey('opusMentions');

/** 按名单在文档里找名字，返回装饰集。
 *  长的名字优先占位（"开雾纪元" 不该被 "纪元" 抢走），已被链接标记的文本不重复贴。 */
function mentionDecorations(doc, list) {
  if (!list || !list.length) return DecorationSet.empty;
  const names = list.slice().sort((a, b) => b.name.length - a.name.length);
  const taken = [];
  const spans = [];
  const conflicts = (from, to) => taken.some(([start, end]) => from < end && to > start);

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark) => mark.type.name === 'link')) return;
    names.forEach((item) => {
      let cursor = 0;
      for (;;) {
        const at = node.text.indexOf(item.name, cursor);
        if (at < 0) return;
        const from = pos + at;
        const to = from + item.name.length;
        cursor = at + item.name.length;
        if (conflicts(from, to)) continue;
        taken.push([from, to]);
        spans.push(Decoration.inline(from, to, {
          class: 'mentions-inline',
          'data-target': String(item.id),
        }));
      }
    });
  });
  return DecorationSet.create(doc, spans);
}

/** 一份可变的 { list } 由 mount 传给每座岛（多张卡同时开着也不会串味）。 */
const mentionHighlight = createExtension(({ options }) => {
  const holder = options.mentions;
  return {
    key: 'opusMentions',
    prosemirrorPlugins: [
      new Plugin({
        key: MENTIONS_PLUGIN_KEY,
        state: {
          init: (_config, state) => mentionDecorations(state.doc, holder.list),
          // 文档没变、名单也没换就不重算（打字之外的每帧都不必扫全文）。
          apply: (tr, value, _oldState, nextState) => (
            tr.docChanged || tr.getMeta(MENTIONS_PLUGIN_KEY)
              ? mentionDecorations(nextState.doc, holder.list)
              : value
          ),
        },
        props: {
          decorations: (state) => MENTIONS_PLUGIN_KEY.getState(state),
        },
      }),
    ],
  };
});

const BridgeContext = createContext(null);

function HeavyMount({ kind, data }) {
  const bridge = useContext(BridgeContext);
  const ref = useRef(null);
  // data 是个每次渲染都新建的对象，直接进依赖数组会无限重画；序列化成字符串比。
  const payload = JSON.stringify(data);
  useEffect(() => {
    const node = ref.current;
    if (!node || !bridge || !bridge.renderHeavyBlock) return undefined;
    bridge.renderHeavyBlock(node, kind, JSON.parse(payload));
    return () => {
      node.innerHTML = '';
    };
  }, [bridge, kind, payload]);
  // 容器交给桥接层填充，自带类名方便只读样式挂钩。
  return <div className={`opus-heavy opus-heavy-${kind}`} ref={ref} />;
}

// 四个重块共同骨架：无行内内容，props 全部是 string / number。
function createHeavyBlock(type, propSchema, toData) {
  return createReactBlockSpec(
    { type, propSchema, content: 'none' },
    {
      render: ({ block }) => <HeavyMount kind={type} data={toData(block.props)} />,
    },
  )();
}

const imageBlock = createHeavyBlock(
  'image',
  { url: { default: '' }, caption: { default: '' } },
  (props) => ({ url: props.url, caption: props.caption }),
);

const bookmarkBlock = createHeavyBlock(
  'bookmark',
  { url: { default: '' }, caption: { default: '' } },
  (props) => ({ url: props.url, caption: props.caption }),
);

const cardBlock = createHeavyBlock(
  'card',
  { document: { default: 0 } },
  (props) => ({ document: props.document }),
);

const collectionBlock = createHeavyBlock(
  'collection',
  // 内联数据库的 settings 是嵌套结构，BlockNote 的 props 只收标量，
  // 所以后端把它序列化成 JSON 字符串（`_normalize_collection_settings`）。
  { settings: { default: '' } },
  (props) => ({ settings: props.settings }),
);

const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    heading,
    quote,
    bulletListItem,
    numberedListItem,
    checkListItem,
    codeBlock,
    divider,
    toggleListItem,
    callout,
    image: imageBlock,
    bookmark: bookmarkBlock,
    card: cardBlock,
    collection: collectionBlock,
  },
});

// 斜杠菜单里 callout 项的图标。BlockNote 默认项用的是 react-icons，但那个包
// 不是我们的直接依赖（它被 @blocknote/react 内联进产物了，import 不到），
// 所以自己画一个 18px 的方图，描边跟着文字色走。
function CalloutIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <line x1="7" y1="9.5" x2="17" y2="9.5" />
      <line x1="7" y1="14" x2="14" y2="14" />
    </svg>
  );
}

// 斜杠菜单里四个重块的图标。同样自己画，不引 react-icons。
function HeavyIcon({ kind, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (kind === 'image') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M4 19l5.5-5.5L14 18l2.5-2.5L20 19" />
      </svg>
    );
  }
  if (kind === 'bookmark') {
    return (
      <svg {...common}>
        <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4-6.5 4V4.5a1 1 0 0 1 1-1z" />
      </svg>
    );
  }
  if (kind === 'card') {
    return (
      <svg {...common}>
        <rect x="3" y="4.5" width="18" height="15" rx="3" />
        <line x1="7" y1="9.5" x2="17" y2="9.5" />
        <line x1="7" y1="13.5" x2="12" y2="13.5" />
      </svg>
    );
  }
  // collection：表格外框 + 分栏
  return (
    <svg {...common}>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9.5" y1="10" x2="9.5" y2="19.5" />
      <line x1="15.5" y1="10" x2="15.5" y2="19.5" />
    </svg>
  );
}

// 斜杠菜单项：默认项由 schema 自检生成（所以只会列出我们注册过的块）。
// 我们补两类：
//   1) callout——BlockNote 不认识的块，文案对齐旧 vanilla「提示框 / 规则或需要记住的事」；
//   2) 四个重块（image / bookmark / card / collection）——它们的数据不是敲出来的，
//      得先弹对话框问用户（图片地址、卡片、集合设置）。默认项里那一项只会插出空块，
//      一律摘掉，换成下面这组「先问后插」的版本。
// 重块的对话框住在 vanilla 侧（workspace.js），孤岛只通过 bridge.prepareHeavyBlock
// 拿到 props 再写进 doc；用户取消（返回 null）时当前块留作空段落。
const HEAVY_SLASH_KEYS = new Set(['image', 'video', 'audio', 'file', 'table']);

const HEAVY_SLASH_ITEMS = [
  {
    kind: 'image',
    title: '图片',
    subtext: '上传或粘贴图片地址',
    aliases: ['image', '图片', '图', 'img', 'picture', 'photo'],
  },
  {
    kind: 'bookmark',
    title: '书签',
    subtext: '把一个网址摆成卡片',
    aliases: ['bookmark', '书签', '链接', 'link', 'url'],
  },
  {
    kind: 'card',
    title: '嵌入卡',
    subtext: '把另一张卡片摘要放这里',
    aliases: ['card', '卡片', '嵌入', 'embed'],
  },
  {
    kind: 'collection',
    title: '内联数据库',
    subtext: '某个类型的卡片集合',
    aliases: ['collection', '数据库', '集合', '视图', 'database', 'db', 'table'],
  },
];

// 点重块菜单项：此时此刻 SuggestionMenuWrapper 已经 closeMenu + clearQuery，
// 当前块内容为空，所以拿到 props 后直接原地 updateBlock 替换它即可，不会留下
// `/关键词`。对话框可能挂着很久，故先记下块引用，等回来再写。
async function insertHeavyBlock(editor, bridge, kind) {
  if (!bridge || typeof bridge.prepareHeavyBlock !== 'function') return;
  const currentBlock = editor.getTextCursorPosition().block;
  let props;
  try {
    props = await bridge.prepareHeavyBlock(kind);
  } catch (error) {
    return;
  }
  if (!props) return;
  editor.updateBlock(currentBlock, { type: kind, props });
}

function slashMenuItems(editor, bridge) {
  const items = getDefaultReactSlashMenuItems(editor).filter(
    (item) => !HEAVY_SLASH_KEYS.has(item.key),
  );
  const calloutItem = {
    title: '提示框',
    subtext: '规则或需要记住的事',
    aliases: ['callout', '提示', '提示框', 'tip', 'note', '备注'],
    group: '基础',
    icon: <CalloutIcon size={18} />,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' }),
  };
  const heavyItems = HEAVY_SLASH_ITEMS.map((spec) => ({
    title: spec.title,
    subtext: spec.subtext,
    aliases: spec.aliases,
    group: '嵌入',
    icon: <HeavyIcon kind={spec.kind} size={18} />,
    onItemClick: () => insertHeavyBlock(editor, bridge, spec.kind),
  }));

  // callout 插到「段落」后面（同组「基础」），重块单独成组「嵌入」跟在最后。
  const at = items.findIndex((item) => item.key === 'paragraph');
  const withCallout =
    at === -1
      ? [...items, calloutItem]
      : [...items.slice(0, at + 1), calloutItem, ...items.slice(at + 1)];
  return [...withCallout, ...heavyItems];
}

// 一份文档是否为「空」（没有任何可见内容）——用来决定要不要给 BlockNote
// 塞 initialContent。空文档传 undefined，让它自己生成一个空段落光标位。
function isEmptyDoc(doc) {
  if (!Array.isArray(doc) || doc.length === 0) return true;
  if (doc.length > 1) return false;
  const only = doc[0];
  if (!only || only.type !== 'paragraph') return false;
  const content = only.content;
  return !Array.isArray(content) || content.length === 0;
}

function Island({ options, apiRef }) {
  const blockNoteEditor = useCreateBlockNote({
    schema: editorSchema,
    dictionary: zh,
    initialContent: isEmptyDoc(options.doc) ? undefined : options.doc,
    // 名字自动识别：装饰层读的就是 options.mentions 这份名单（由桥接层写）。
    extensions: [mentionHighlight({ mentions: options.mentions })],
  });

  // 把实例交给外层 handle，桥接层靠它取文档 / 切只读。
  useEffect(() => {
    apiRef.current = blockNoteEditor;
    options.onReady?.();
    return () => {
      if (apiRef.current === blockNoteEditor) apiRef.current = null;
    };
  }, [blockNoteEditor, apiRef, options]);

  // 只读是外部（权限 / 世界角色）说了算，可能后到，所以要能动态切。
  useEffect(() => {
    blockNoteEditor.isEditable = !options.readonly;
  }, [blockNoteEditor, options.readonly]);

  return (
    <div className="opuscule-editor-island">
      {/* 桥接层：重块容器靠它回调外面的 vanilla 渲染器（端口由 mount 传入）。 */}
      <BridgeContext.Provider value={options.bridge || null}>
        <BlockNoteView
          editor={blockNoteEditor}
          editable={!options.readonly}
          theme={options.theme === 'dark' ? 'dark' : 'light'}
          // 关掉自带斜杠菜单，换成下面这个：不自建的话 `/` 会同时弹出两套菜单。
          slashMenu={false}
          onChange={() => {
            options.onChange?.(blockNoteEditor.document);
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(slashMenuItems(blockNoteEditor, options.bridge), query)
            }
          />
        </BlockNoteView>
      </BridgeContext.Provider>
    </div>
  );
}

// 已挂载的岛：容器元素 → handle。`unmount(container)` 靠它找回实例。
const islands = new Map();

function mount(container, options = {}) {
  if (!container) throw new Error('OpusEditorIsland.mount: 缺少容器元素');

  // 同一个容器重复挂载：先把上一份收干净，免得留下两个 ProseMirror。
  if (islands.has(container)) unmount(container);

  const opts = {
    doc: [],
    readonly: false,
    theme: 'light',
    // 名字自动识别的名单（{ name, id }[]）：每座岛一份，桥接层用 handle.setMentions 写。
    mentions: { list: [] },
    // 桥接端口：
    //   renderHeavyBlock(container, kind, data) → 画重块 DOM；
    //   prepareHeavyBlock(kind) → Promise<props|null>，弹对话框问用户重块数据。
    bridge: null,
    ...options,
  };

  const apiRef = { current: null };
  const root = createRoot(container);
  root.render(<Island options={opts} apiRef={apiRef} />);

  const handle = {
    version: ISLAND_VERSION,
    getDoc() {
      return apiRef.current ? apiRef.current.document : [];
    },
    isReady() {
      return !!apiRef.current;
    },
    focus() {
      apiRef.current?.focus?.();
    },
    // 外部改了正文（撤销 / 采用了服务端版本）：整篇换掉。
    // 空文档要给一个段落，否则编辑器里没有可以落光标的地方。
    setDoc(doc) {
      const editor = apiRef.current;
      if (!editor) return;
      const next = Array.isArray(doc) && doc.length ? doc : [{ type: 'paragraph' }];
      editor.replaceBlocks(editor.document, next);
    },
    setReadonly(flag) {
      if (apiRef.current) apiRef.current.isEditable = !flag;
    },
    // 名字自动识别：桥接层把「名字 → 目标卡片」的名单推过来（岛内不碰网络）。
    // 名单换了但文档没换，所以要自己促一次事务，否则装饰不会重算。
    setMentions(list) {
      const editor = apiRef.current;
      opts.mentions.list = (Array.isArray(list) ? list : [])
        .filter((item) => item && item.name && item.id);
      if (!editor) return false;
      const view = editor.prosemirrorView;
      if (view) view.dispatch(view.state.tr.setMeta(MENTIONS_PLUGIN_KEY, true));
      return true;
    },
    // 粘贴 / 拖拽上传的图片：追加一个图片块到文档末尾（正文权威在孤岛里）。
    insertImage(url, caption = '') {
      const editor = apiRef.current;
      if (!editor) return false;
      const doc = editor.document;
      const last = doc[doc.length - 1];
      editor.insertBlocks([{ type: 'image', props: { url, caption } }], last, 'after');
      return true;
    },
    destroy() {
      root.unmount();
    },
  };

  islands.set(container, handle);
  return handle;
}

function unmount(container) {
  const handle = islands.get(container);
  if (!handle) return;
  islands.delete(container);
  try {
    handle.destroy();
  } finally {
    // createRoot().unmount() 只拆 React 树，容器自身的残留属性得自己抹掉。
    container.innerHTML = '';
  }
}

window.OpusEditorIsland = {
  version: ISLAND_VERSION,
  mount,
  unmount,
};

export { mount, unmount, editorSchema };

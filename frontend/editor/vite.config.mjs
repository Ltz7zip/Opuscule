import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 正文编辑器孤岛：React 只活在正文区，外面那圈（侧栏 / 属性 / 评论 / 顶栏）还是 vanilla。
//
// 产物路径跟地图那边对齐（static/map/vendor 也是入库的构建结果）：
// 构建结果提交进仓库，部署机只要 Python，不需要 Node。
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // lib 模式下 Vite 不会替掉 process.env.NODE_ENV，浏览器里没有 process →
    // 模块一加载就 "process is not defined"，孤岛直接降级。钉成生产值，
    // 顺带把 React 的开发分支摇掉。
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: '../../static/editor/dist',
    emptyOutDir: true,
    // 孤岛只有一个入口，不做代码分割：产物就是 editor.js + editor.css 两个文件，
    // 模板 / 桥接层能直接用 ?v=<static_version> 引用。
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.jsx',
      formats: ['es'],
      fileName: () => 'assets/editor.js',
    },
    rollupOptions: {
      output: {
        // 单入口就不要分块：否则会额外吐出 module-*.js / native-*.js 这类
        // 带哈希的 chunk，桥接层得逐个去猜文件名。
        codeSplitting: false,
        assetFileNames: 'assets/editor.[ext]',
      },
    },
  },
});

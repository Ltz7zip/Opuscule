import { BookOpen, Clock3, FileText, Map, Plus } from "lucide-react";

interface EmptyStateProps {
  worldSlug: string;
  onNewCard: () => void;
}

export function EmptyState({ worldSlug, onNewCard }: EmptyStateProps) {
  return (
    <section className="empty" aria-label="空工作区">
      <span className="empty-icon">
        <FileText size={20} />
      </span>
      <div>
        <h2>还没有打开任何文档</h2>
        <p>
          从左侧选一张卡片，或直接新建一张。地图与时间线已经可用，写完的内容可以发布成只读
          Wiki。
        </p>
      </div>
      <div className="empty-grid">
        <a className="empty-card" href={`/w/${worldSlug}/timeline`}>
          <Clock3 size={16} />
          <strong>时间线画布</strong>
          <span>按年代排布事件与纪元</span>
        </a>
        <a className="empty-card" href={`/w/${worldSlug}/map`}>
          <Map size={16} />
          <strong>地图编辑器</strong>
          <span>在底图上标注地点与航线</span>
        </a>
        <a className="empty-card" href={`/w/${worldSlug}/wiki`}>
          <BookOpen size={16} />
          <strong>公开 Wiki</strong>
          <span>以读者视角查看已经发布的条目</span>
        </a>
      </div>
      <button type="button" className="btn btn-primary" onClick={onNewCard}>
        <Plus size={16} />
        新建卡片
      </button>
    </section>
  );
}

interface SiteFooterProps {
  worldName?: string;
  collections?: number;
  cards?: number;
  note?: string;
}

/** Public footer in the original site's centered form. */
export function SiteFooter(_props: SiteFooterProps) {
  return (
    <footer className="site-foot">
      <p className="site-foot-version">Opuscule · 世界观共建工作台</p>
      <nav className="site-foot-links" aria-label="站点链接">
        <a href="/explore">公开世界</a>
        <span aria-hidden="true">·</span>
        <a href="/w/">我的世界</a>
      </nav>
    </footer>
  );
}

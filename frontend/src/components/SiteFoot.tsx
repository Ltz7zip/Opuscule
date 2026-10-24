interface SiteFootProps {
  worldName?: string;
  worldDescription?: string;
  publishedAt?: string | null;
  showAuthLinks?: boolean;
  authenticated?: boolean;
}

/** Legacy 0.8.1 footer: world line, edition line, "Powered by Opuscule". */
export function SiteFoot({
  worldName,
  worldDescription,
  publishedAt,
  showAuthLinks = true,
  authenticated = false,
}: SiteFootProps) {
  const date = publishedAt ? publishedAt.slice(0, 10) : "";
  if (worldName) {
    return (
      <footer className="site-foot">
        <div>{worldName}{worldDescription ? ` · ${worldDescription}` : ""}</div>
        <div className="site-foot-meta">
          公开版本 · 公开可读{date ? ` · ${date}` : ""}
        </div>
        <div className="site-foot-app">Powered by Opuscule</div>
      </footer>
    );
  }
  return (
    <footer className="site-foot">
      <div>Opuscule · 世界观共建工作台</div>
      <div className="site-foot-meta">
        {authenticated ? "公开世界 · 我的世界" : showAuthLinks ? "登录 · 注册" : "公开世界"}
      </div>
    </footer>
  );
}

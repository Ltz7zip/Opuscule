interface WorldNavProps {
  worldSlug: string;
  worldName?: string;
  active?: "wiki" | "cards" | "map" | "timeline";
}

const TABS = [
  { key: "wiki", label: "世界", path: "wiki" },
  { key: "cards", label: "设定", path: "wiki/cards" },
  { key: "timeline", label: "时间线", path: "timeline" },
  { key: "map", label: "地图", path: "map" },
] as const;

/** One click between a world's public surfaces. Without this, the map and the
 *  timeline are only reachable by typing the URL or going through the editor. */
export function WorldNav({ worldSlug, worldName, active }: WorldNavProps) {
  return (
    <nav className="world-nav" aria-label="世界导航">
      <div className="world-nav-inner">
        {worldName && <span className="world-nav-name">{worldName}</span>}
        <div className="world-nav-links">
          {TABS.map((tab) => (
            <a
              key={tab.key}
              className={`world-nav-link${active === tab.key ? " active" : ""}`}
              href={`/w/${worldSlug}/${tab.path}`}
              aria-current={active === tab.key ? "page" : undefined}
            >
              {tab.label}
            </a>
          ))}
          <a className="world-nav-link" href={`/w/${worldSlug}`}>
            工作区
          </a>
        </div>
      </div>
    </nav>
  );
}

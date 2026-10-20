interface EditionLineProps {
  revision?: number;
  updatedAt?: string;
  label?: string;
}

/** The archival edition line: revision, date, visibility. */
export function EditionLine({ revision, updatedAt, label = "公开条目" }: EditionLineProps) {
  return (
    <span className="edition-line">
      {typeof revision === "number" && <span>修订 r{revision}</span>}
      {updatedAt && (
        <>
          <i aria-hidden="true">·</i>
          <span>更新于 {updatedAt.slice(0, 10)}</span>
        </>
      )}
      {label && (
        <>
          <i aria-hidden="true">·</i>
          <span>{label}</span>
        </>
      )}
    </span>
  );
}

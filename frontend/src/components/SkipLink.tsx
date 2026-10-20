/** First tab stop on every page: jumps past the header and sidebar. */
export function SkipLink() {
  return (
    <a className="skip-link" href="#main-content">
      跳到正文
    </a>
  );
}

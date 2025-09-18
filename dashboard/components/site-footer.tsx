export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <span className="site-footer__brand">Pumpstreams</span>
      <span className="site-footer__meta">Streaming the Pump.fun firehose · {year}</span>
    </footer>
  );
}

export default function Loading() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="正在加载">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </div>
  );
}

export default function DashboardCard({ title, value, subtitle }) {
  return (
    <div className="dashboard-card">
      <span className="card-title">{title}</span>
      <strong className="card-value">{value}</strong>
      {subtitle && <span className="card-subtitle">{subtitle}</span>}
    </div>
  );
}

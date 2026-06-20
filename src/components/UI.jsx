import { STATUS_LABEL, statusClass } from '../utils.js';

export function Tag({ status, label, variant }) {
  const cls = variant || statusClass(status);
  const text = label || STATUS_LABEL[status] || status;
  return <span className={`tag tag-${cls}`}>{text}</span>;
}

export function Row({ label, value, valueClass }) {
  return (
    <div className="data-row">
      <span className="row-label">{label}</span>
      <span className={`row-value mono${valueClass ? ' ' + valueClass : ''}`}>{value}</span>
    </div>
  );
}

export function Card({ title, children, style }) {
  return (
    <div className="card" style={style}>
      {title && <div className="card-title">{title}</div>}
      {children}
    </div>
  );
}

export function HaircutBar({ writeOff, total }) {
  const p = total ? Math.round((writeOff / total) * 100) : 0;
  return (
    <div className="haircut-wrap">
      <div className="haircut-labels">
        <span>Διαγραφή {p}%</span>
        <span>Ρύθμιση {100 - p}%</span>
      </div>
      <div className="haircut-bar">
        <div className="haircut-red" style={{ width: `${p}%` }} />
        <div className="haircut-green" style={{ width: `${100 - p}%` }} />
      </div>
    </div>
  );
}

export function Alert({ type, children }) {
  return <div className={`alert alert-${type}`}>{children}</div>;
}

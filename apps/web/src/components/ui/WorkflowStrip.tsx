import { Link } from 'react-router-dom';

export type WorkflowStripItem = {
  id: string;
  label: string;
  title: string;
  description: string;
  actionLabel: string;
  to?: string;
  current?: boolean;
};

type WorkflowStripProps = {
  items: WorkflowStripItem[];
  title?: string;
  subtitle?: string;
  className?: string;
  compact?: boolean;
};

export default function WorkflowStrip({
  items,
  title,
  subtitle,
  className,
  compact = false
}: WorkflowStripProps) {
  return (
    <section className={`workflow-picker${compact ? ' workflow-picker--compact' : ''}${className ? ` ${className}` : ''}`}>
      {title || subtitle ? (
        <div className="workflow-picker__header">
          {title ? <h2 className="workflow-picker__title">{title}</h2> : null}
          {subtitle ? <p className="workflow-picker__subtitle">{subtitle}</p> : null}
        </div>
      ) : null}

      <div className="workflow-picker__grid">
        {items.map((item) => (
          <article key={item.id} className={`workflow-card${item.current ? ' workflow-card--current' : ''}`}>
            <div className="workflow-card__label">{item.label}</div>
            <div className="workflow-card__title">{item.title}</div>
            <div className="workflow-card__description">{item.description}</div>

            {item.current || !item.to ? (
              <div className="workflow-card__action workflow-card__action--current">{item.actionLabel}</div>
            ) : (
              <Link to={item.to} className="workflow-card__action">
                {item.actionLabel}
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
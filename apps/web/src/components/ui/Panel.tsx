// apps/web/src/components/ui/Panel.tsx
import type { ReactNode } from 'react';

type PanelVariant = 'primary' | 'secondary' | 'utility';

type PanelProps = {
  children: ReactNode;
  className?: string;
  variant?: PanelVariant;
};

export default function Panel({
  children,
  className,
  variant = 'secondary'
}: PanelProps) {
  return (
    <section className={`panel panel--${variant}${className ? ` ${className}` : ''}`}>
      {children}
    </section>
  );
}
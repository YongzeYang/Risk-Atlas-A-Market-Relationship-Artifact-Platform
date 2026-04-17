import type { ReactNode } from 'react';

type PanelProps = {
  children: ReactNode;
  className?: string;
};

export default function Panel({ children, className }: PanelProps) {
  return <section className={`panel${className ? ` ${className}` : ''}`}>{children}</section>;
}
import type { ReactNode } from 'react';

type PlainSummaryProps = {
  children: ReactNode;
};

export default function PlainSummary({ children }: PlainSummaryProps) {
  return <div className="plain-summary">{children}</div>;
}

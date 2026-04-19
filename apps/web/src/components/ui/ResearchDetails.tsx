type ResearchDetailsProps = {
  summary: string;
  children: React.ReactNode;
  open?: boolean;
};

export default function ResearchDetails({
  summary,
  children,
  open = false
}: ResearchDetailsProps) {
  return (
    <details className="research-details" open={open}>
      <summary className="research-details__summary">{summary}</summary>
      <div className="research-details__body">{children}</div>
    </details>
  );
}
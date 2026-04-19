type BoundaryNoteProps = {
  title?: string;
  children: React.ReactNode;
  variant?: 'default' | 'accent';
};

export default function BoundaryNote({
  title,
  children,
  variant = 'default'
}: BoundaryNoteProps) {
  return (
    <div className={`boundary-note boundary-note--${variant}${title ? '' : ' boundary-note--untitled'}`}>
      {title ? <div className="boundary-note__title">{title}</div> : null}
      <div className="boundary-note__body">{children}</div>
    </div>
  );
}
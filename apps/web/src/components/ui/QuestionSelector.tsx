type QuestionItem = {
  id: string;
  label: string;
  description: string;
};

type QuestionSelectorProps = {
  items: QuestionItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function QuestionSelector({ items, selectedId, onSelect }: QuestionSelectorProps) {
  return (
    <div className="question-selector">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`question-selector__card${selectedId === item.id ? ' question-selector__card--active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          <div className="question-selector__label">{item.label}</div>
          <div className="question-selector__description">{item.description}</div>
        </button>
      ))}
    </div>
  );
}

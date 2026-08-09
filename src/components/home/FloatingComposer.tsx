import { ArrowUp } from "lucide-react";
import { useState, type FormEvent } from "react";

interface FloatingComposerProps {
  onSubmit: (value: string) => void;
}

export function FloatingComposer({ onSubmit }: FloatingComposerProps) {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = value.trim();
    if (!next) return;
    onSubmit(next);
    setValue("");
  };

  return (
    <div className="floating-composer-layer">
      <form className="floating-composer" data-testid="floating-composer" onSubmit={submit}>
        <span className="floating-composer__edge" aria-hidden="true" />
        <label className="sr-only" htmlFor="floating-instruction">
          输入新的生活指令
        </label>
        <input
          id="floating-instruction"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="继续追问，或输入新指令"
          autoComplete="off"
        />
        <button type="submit" aria-label="发送新指令">
          <ArrowUp size={17} strokeWidth={2} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';

export function OffsetInput({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  const [localValue, setLocalValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const handleCommit = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      if (parsed !== value) {
        onChange(parsed);
      }
    } else {
      setLocalValue(value.toString());
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={localValue}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
          setLocalValue(val);
        }
      }}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleCommit();
          inputRef.current?.blur();
        }
      }}
      className="w-24 bg-white border border-zinc-200 rounded px-2 py-1 text-xs font-mono focus:ring-2 focus:ring-zinc-900/5 outline-none"
    />
  );
}


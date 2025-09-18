'use client';

import { useMemo } from 'react';

type DebugEntry = {
  label: string;
  value: string | number | boolean | null | undefined;
};

type DebugSection = {
  title: string;
  entries: DebugEntry[];
};

type DebugConsoleProps = {
  open: boolean;
  onClose: () => void;
  sections: DebugSection[];
};

export function DebugConsole({ open, onClose, sections }: DebugConsoleProps) {
  const flatText = useMemo(() => {
    const parts: string[] = [];
    for (const section of sections) {
      parts.push(`# ${section.title}`);
      for (const entry of section.entries) {
        parts.push(`${entry.label}: ${formatValue(entry.value)}`);
      }
    }
    return parts.join('\n');
  }, [sections]);

  if (!open) return null;

  return (
    <aside className="debug-console" role="complementary" aria-label="Debug console">
      <header className="debug-console__header">
        <span>Debug feed</span>
        <div className="debug-console__actions">
          <button type="button" onClick={() => navigator.clipboard.writeText(flatText)}>
            Copy
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div className="debug-console__body">
        {sections.map((section) => (
          <section key={section.title}>
            <h4>{section.title}</h4>
            <dl>
              {section.entries.map((entry) => (
                <div key={entry.label} className="debug-console__row">
                  <dt>{entry.label}</dt>
                  <dd>{formatValue(entry.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </aside>
  );
}

function formatValue(value: DebugEntry['value']): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

import { useCallback, useState, type ReactNode } from 'react';
import { ChevronIcon } from './icons';

// Stav sbalení skupin se pamatuje v prohlížeči zvlášť pro každý seznam (scope)
export function useCollapsed(scope: string) {
  const storageKey = `collapsed:${scope}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
    } catch {
      return new Set<string>();
    }
  });

  const save = useCallback(
    (next: Set<string>) => {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    },
    [storageKey],
  );

  const toggle = useCallback(
    (key: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        return save(next);
      }),
    [save],
  );
  const setAll = useCallback((keys: string[], isCollapsed: boolean) => setCollapsed(save(new Set(isCollapsed ? keys : []))), [save]);

  return { collapsed, toggle, setAll };
}

interface Props {
  title: string;
  icon: ReactNode;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

// Sbalitelná skupina; výška se animuje přes grid-template-rows (0fr ↔ 1fr)
export function Section({ title, icon, count, collapsed, onToggle, children }: Props) {
  return (
    <section className={`group${collapsed ? ' is-collapsed' : ''}`}>
      <h4 className="group-title">
        <button className="group-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <span className="chev">
            <ChevronIcon size={14} />
          </span>
          {icon}
          <span>{title}</span>
          <em>{count}</em>
        </button>
      </h4>
      <div className="collapse">
        <div className="collapse-inner">{children}</div>
      </div>
    </section>
  );
}

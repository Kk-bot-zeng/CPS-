"use client";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type BusinessOption = { value: string; label: string };
export default function BusinessSelect({ value, options, onChange, label, className = "", searchable = false }: { value: string; options: BusinessOption[]; onChange: (value: string) => void; label?: string; className?: string; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const current = options.find((x) => x.value === value) || options[0];
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return keyword ? options.filter((option) => option.label.toLocaleLowerCase().includes(keyword)) : options;
  }, [options, query]);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    setHighlightedIndex(-1);
    if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus());
  };

  const selectOption = (option: BusinessOption) => {
    onChange(option.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(Math.max(0, visibleOptions.findIndex((option) => option.value === value)));
    if (searchable) window.requestAnimationFrame(() => searchInput.current?.focus());
  }, [open, searchable, value, visibleOptions]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) closeMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((index) => {
          if (!visibleOptions.length) return -1;
          const next = event.key === "ArrowDown" ? index + 1 : index - 1;
          return (next + visibleOptions.length) % visibleOptions.length;
        });
        return;
      }
      if (event.key === "Enter" && highlightedIndex >= 0 && visibleOptions[highlightedIndex]) {
        event.preventDefault();
        selectOption(visibleOptions[highlightedIndex]);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, searchable, value, visibleOptions, highlightedIndex]);

  useEffect(() => {
    if (highlightedIndex >= 0) optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return <div ref={root} className={`business-select ${open ? "open" : ""} ${className}`}>
    {label && <span className="business-select-label">{label}</span>}
    <button
      ref={trigger}
      type="button"
      className="business-select-trigger"
      onClick={() => open ? closeMenu() : setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!open) setOpen(true);
        } else if (event.key === "Escape" && open) {
          event.preventDefault();
          closeMenu(true);
        }
      }}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={menuId}
      aria-label={label ? undefined : "选择业务"}
    >
      <span>{current?.label}</span><ChevronDown size={15}/>
    </button>
    {open && <div id={menuId} className="business-select-menu" role="listbox" aria-label={label || "业务选项"}>
      {searchable && <div className="business-select-search"><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词搜索" aria-label="搜索选项" /></div>}
      {visibleOptions.map((option, index) => <button ref={(element) => { optionRefs.current[index] = element; }} type="button" role="option" aria-selected={option.value === value} key={option.value} className={`${option.value === value ? "selected" : ""} ${highlightedIndex === index ? "highlighted" : ""}`} style={highlightedIndex === index && option.value !== value ? { backgroundColor: "#edf4ff", color: "#1554bf" } : undefined} onClick={() => selectOption(option)}><span>{option.label}</span>{option.value === value && <Check size={14}/>}</button>)}
      {!visibleOptions.length && <div className="business-select-empty" role="status">没有匹配项</div>}
    </div>}
  </div>;
}

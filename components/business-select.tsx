"use client";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type BusinessOption = { value: string; label: string };
type BusinessSelectProps = {
  value: string | string[];
  options: BusinessOption[];
  onChange: (value: string | string[]) => void;
  label?: string;
  className?: string;
  searchable?: boolean;
  multiple?: boolean;
};
export default function BusinessSelect({ value, options, onChange, label, className = "", searchable = false, multiple = false }: BusinessSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const selectedValues = Array.isArray(value) ? value : [value];
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  // Keep selected names available when a date/channel refresh returns no sales
  // for one of them; users can still see and uncheck every active selection.
  const selectOptions = useMemo(() => {
    if (!multiple) return options;
    const byValue = new Map(options.map((option) => [option.value, option]));
    selectedValues.filter((selected) => selected !== "all").forEach((selected) => {
      if (!byValue.has(selected)) byValue.set(selected, { value: selected, label: selected });
    });
    return [...byValue.values()];
  }, [multiple, options, selectedValues]);
  const allOption = selectOptions.find((option) => option.value === "all");
  const current = selectOptions.find((x) => x.value === value) || selectOptions[0];
  const displayLabel = multiple
    ? selectedValues.includes("all") || selectedValues.length === 0
      ? allOption?.label || "全部"
      : selectedValues.length === 1
        ? selectOptions.find((option) => option.value === selectedValues[0])?.label || selectedValues[0]
        : `已选 ${selectedValues.length} 项`
    : current?.label;
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return keyword ? selectOptions.filter((option) => option.label.toLocaleLowerCase().includes(keyword)) : selectOptions;
  }, [selectOptions, query]);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    setHighlightedIndex(-1);
    if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus());
  };

  const selectOption = (option: BusinessOption) => {
    if (multiple) {
      if (option.value === "all") {
        onChange(allOption ? [allOption.value] : []);
      } else {
        const withoutAll = selectedValues.filter((selected) => selected !== "all");
        const next = withoutAll.includes(option.value)
          ? withoutAll.filter((selected) => selected !== option.value)
          : [...withoutAll, option.value];
        onChange(next.length ? next : allOption ? [allOption.value] : []);
      }
      return;
    }
    onChange(option.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(Math.max(0, visibleOptions.findIndex((option) => selectedSet.has(option.value))));
    if (searchable) window.requestAnimationFrame(() => searchInput.current?.focus());
  }, [open, searchable, selectedSet, visibleOptions]);

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
  }, [open, searchable, selectedValues, visibleOptions, highlightedIndex, multiple]);

  useEffect(() => {
    if (highlightedIndex >= 0) optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return <div ref={root} className={`business-select ${open ? "open" : ""} ${multiple ? "multiple" : ""} ${className}`}>
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
      <span>{displayLabel}</span><ChevronDown size={15}/>
    </button>
    {open && <div id={menuId} className="business-select-menu" role="listbox" aria-multiselectable={multiple || undefined} aria-label={label || "业务选项"}>
      {searchable && <div className="business-select-search"><input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词搜索" aria-label="搜索选项" /></div>}
      {visibleOptions.map((option, index) => <button ref={(element) => { optionRefs.current[index] = element; }} type="button" role="option" aria-selected={selectedSet.has(option.value)} key={option.value} className={`${selectedSet.has(option.value) ? "selected" : ""} ${highlightedIndex === index ? "highlighted" : ""}`} style={highlightedIndex === index && !selectedSet.has(option.value) ? { backgroundColor: "#edf4ff", color: "#1554bf" } : undefined} onClick={() => selectOption(option)}><span>{option.label}</span>{selectedSet.has(option.value) && <Check size={14}/>}</button>)}
      {!visibleOptions.length && <div className="business-select-empty" role="status">没有匹配项</div>}
      {multiple && !selectedValues.includes("all") && selectedValues.length > 0 && <div className="business-select-footer"><button type="button" onClick={() => onChange(allOption ? [allOption.value] : [])}>清空选择</button></div>}
    </div>}
  </div>;
}

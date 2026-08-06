"use client";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type BusinessOption = { value: string; label: string };
export default function BusinessSelect({ value, options, onChange, label, className = "", searchable = false }: { value: string; options: BusinessOption[]; onChange: (value: string) => void; label?: string; className?: string; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const current = options.find((x) => x.value === value) || options[0];
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return keyword ? options.filter((option) => option.label.toLocaleLowerCase().includes(keyword)) : options;
  }, [options, query]);
  return <div ref={root} className={`business-select ${open ? "open" : ""} ${className}`}>
    {label && <span className="business-select-label">{label}</span>}
    <button type="button" className="business-select-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span>{current?.label}</span><ChevronDown size={15}/>
    </button>
    {open && <div className="business-select-menu">{searchable && <div className="business-select-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词搜索" /></div>}{visibleOptions.map((option) => <button type="button" key={option.value} className={option.value === value ? "selected" : ""} onClick={() => { onChange(option.value); setOpen(false); setQuery(""); }}><span>{option.label}</span>{option.value === value && <Check size={14}/>}</button>)}{!visibleOptions.length && <div className="business-select-empty">没有匹配项</div>}</div>}
  </div>;
}

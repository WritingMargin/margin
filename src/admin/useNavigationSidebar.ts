import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../useMediaQuery";

export function useNavigationSidebar(writing: boolean) {
  const narrow = useMediaQuery("(max-width: 1024px)");
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openWhileWriting, setOpenWhileWriting] = useState(false);
  useEffect(() => setMobile(false), [narrow]);
  useEffect(() => {
    if (!writing) setOpenWhileWriting(false);
  }, [writing]);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const desktopOpen = writing ? openWhileWriting : !collapsed;
  const open = narrow ? mobile : desktopOpen;
  function setOpen(value: boolean) {
    if (narrow) setMobile(value);
    else if (writing) setOpenWhileWriting(value);
    else setCollapsed(!value);
  }
  function close() {
    setOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  }
  function search() {
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }
  return { mobile, setMobile, narrow, open, setOpen, close, search, toggleRef, searchRef };
}

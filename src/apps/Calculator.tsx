import React, { useCallback, useEffect, useRef, useState } from "react";
import { useOS, type WinState } from "@/store/os";

/* ------------------------------------------------------------------ */
/* Expression evaluator — tokenizer + precedence-climbing parser.     */
/* No eval(): supports + - * / parentheses, unary minus, and          */
/* postfix % (divide by 100). Division by zero throws.                */
/* ------------------------------------------------------------------ */

type Tok =
  | { t: "num"; v: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "pct" };

export function tokenizeExpr(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      let dots = 0;
      while (j < src.length && /[0-9.]/.test(src[j])) {
        if (src[j] === ".") dots++;
        j++;
      }
      const text = src.slice(i, j);
      if (dots > 1) throw new Error("bad number");
      const v = parseFloat(text);
      if (Number.isNaN(v)) throw new Error("bad number");
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      out.push({ t: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      out.push({ t: "rparen" });
      i++;
      continue;
    }
    if (ch === "%") {
      out.push({ t: "pct" });
      i++;
      continue;
    }
    throw new Error(`unexpected character ${ch}`);
  }
  return out;
}

export function evaluateExpr(src: string): number {
  const toks = tokenizeExpr(src);
  let pos = 0;

  const peek = () => toks[pos];

  function parseExpr(minPrec: number): number {
    let lhs = parseUnary();
    for (;;) {
      const tk = peek();
      if (!tk || tk.t !== "op") break;
      const prec = tk.v === "+" || tk.v === "-" ? 1 : 2;
      if (prec < minPrec) break;
      pos++;
      const rhs = parseExpr(prec + 1);
      if (tk.v === "+") lhs = lhs + rhs;
      else if (tk.v === "-") lhs = lhs - rhs;
      else if (tk.v === "*") lhs = lhs * rhs;
      else {
        if (rhs === 0) throw new Error("division by zero");
        lhs = lhs / rhs;
      }
    }
    return lhs;
  }

  function parseUnary(): number {
    const tk = peek();
    if (tk && tk.t === "op" && (tk.v === "-" || tk.v === "+")) {
      pos++;
      const v = parseUnary();
      return tk.v === "-" ? -v : v;
    }
    return parsePostfix();
  }

  function parsePostfix(): number {
    let v = parsePrimary();
    while (peek()?.t === "pct") {
      pos++;
      v = v / 100;
    }
    return v;
  }

  function parsePrimary(): number {
    const tk = peek();
    if (!tk) throw new Error("unexpected end of expression");
    if (tk.t === "num") {
      pos++;
      return tk.v;
    }
    if (tk.t === "lparen") {
      pos++;
      const v = parseExpr(0);
      if (peek()?.t !== "rparen") throw new Error("missing )");
      pos++;
      return v;
    }
    throw new Error("unexpected token");
  }

  const result = parseExpr(0);
  if (pos !== toks.length) throw new Error("trailing input");
  return result;
}

/** Round away float noise: 0.1+0.2 displays 0.3, 2/3 displays 0.6666666667. */
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  if (n === 0) return "0";
  const rounded = Number.parseFloat(n.toPrecision(11));
  if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) < 1e-9 && rounded !== 0)) {
    return rounded.toExponential(6);
  }
  return String(rounded);
}

/* ------------------------------------------------------------------ */
/* Calculator app                                                     */
/* ------------------------------------------------------------------ */

interface TapeEntry {
  expr: string;
  result: string;
}

type KeyId =
  | "ac" | "neg" | "pct" | "div"
  | "7" | "8" | "9" | "mul"
  | "4" | "5" | "6" | "sub"
  | "1" | "2" | "3" | "add"
  | "sqrt" | "0" | "dot" | "eq"
  | "sq" | "inv";

const KEYS: { id: KeyId; label: string; kind: "fn" | "op" | "num" | "eq" }[] = [
  { id: "ac", label: "AC", kind: "fn" },
  { id: "neg", label: "±", kind: "fn" },
  { id: "pct", label: "%", kind: "fn" },
  { id: "div", label: "÷", kind: "op" },
  { id: "7", label: "7", kind: "num" },
  { id: "8", label: "8", kind: "num" },
  { id: "9", label: "9", kind: "num" },
  { id: "mul", label: "×", kind: "op" },
  { id: "4", label: "4", kind: "num" },
  { id: "5", label: "5", kind: "num" },
  { id: "6", label: "6", kind: "num" },
  { id: "sub", label: "−", kind: "op" },
  { id: "1", label: "1", kind: "num" },
  { id: "2", label: "2", kind: "num" },
  { id: "3", label: "3", kind: "num" },
  { id: "add", label: "+", kind: "op" },
  { id: "sqrt", label: "√", kind: "fn" },
  { id: "sq", label: "x²", kind: "fn" },
  { id: "inv", label: "1/x", kind: "fn" },
  { id: "eq", label: "=", kind: "eq" },
  { id: "0", label: "0", kind: "num" },
  { id: "dot", label: ".", kind: "num" },
];

/** Grid placement overrides inside the 4-col keypad (eq is tall, 0 is wide). */
const KEY_STYLE: Partial<Record<KeyId, React.CSSProperties>> = {
  eq: { gridColumn: 4, gridRow: "5 / span 2" },
  "0": { gridColumn: "1 / span 2" },
};

const OP_CHARS: Record<string, string> = { div: "/", mul: "*", sub: "-", add: "+" };

export default function Calculator({ win }: { win: WinState }) {
  const os = useOS();
  const focused = os.focusedId === win.id;
  // `expr` is the internal expression using ASCII ops; display maps glyphs.
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const stateRef = useRef({ expr, justEvaluated });
  stateRef.current = { expr, justEvaluated };

  useEffect(() => {
    os.setWindowTitle(win.id, "Calculator");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.id]);

  const currentEntry = useCallback((e: string): string => {
    const m = e.match(/(?:^|[+\-*/(])(-?[0-9.]+%?)$/);
    return m ? m[1] : "";
  }, []);

  const press = useCallback(
    (id: KeyId) => {
      let { expr: e, justEvaluated: je } = stateRef.current;

      const setBoth = (nextExpr: string, nextDisplay?: string) => {
        e = nextExpr;
        setExpr(nextExpr);
        setDisplay(nextDisplay ?? (nextExpr === "" ? "0" : displayFor(nextExpr)));
        stateRef.current.expr = nextExpr;
      };
      const displayFor = (x: string): string => {
        const entry = currentEntry(x);
        if (entry) return entry.replace(/^-/, "-").replace("%", "%");
        return x === "" ? "0" : x.replace(/\//g, "÷").replace(/\*/g, "×");
      };

      if (/^[0-9]$/.test(id)) {
        if (je) {
          e = "";
          je = false;
          setJustEvaluated(false);
        }
        if (currentEntry(e) === "0") e = e.slice(0, -1);
        if (e.endsWith(")")) e += "*";
        setBoth(e + id);
        return;
      }

      switch (id) {
        case "dot": {
          if (je) {
            e = "";
            je = false;
            setJustEvaluated(false);
          }
          const entry = currentEntry(e);
          if (entry.includes(".")) return;
          setBoth(e === "" || /[+\-*/(]$/.test(e) ? e + "0." : e + ".");
          return;
        }
        case "add":
        case "sub":
        case "mul":
        case "div": {
          const op = OP_CHARS[id];
          je = false;
          setJustEvaluated(false);
          if (e === "") {
            if (op === "-") setBoth("-");
            return;
          }
          if (/[+\-*/]$/.test(e) && !e.endsWith("(")) {
            setBoth(e.slice(0, -1) + op);
          } else if (e.endsWith("(")) {
            if (op === "-") setBoth(e + "-");
          } else {
            setBoth(e + op);
          }
          return;
        }
        case "ac": {
          setJustEvaluated(false);
          setExpr("");
          setDisplay("0");
          stateRef.current.expr = "";
          stateRef.current.justEvaluated = false;
          return;
        }
        case "neg": {
          const entry = currentEntry(e);
          if (!entry) return;
          const start = e.length - entry.length;
          if (entry.startsWith("-")) setBoth(e.slice(0, start) + entry.slice(1));
          else setBoth(e.slice(0, start) + "-" + entry);
          return;
        }
        case "pct": {
          const entry = currentEntry(e);
          if (!entry || entry.endsWith("%")) return;
          setBoth(e + "%");
          return;
        }
        case "sqrt":
        case "sq":
        case "inv": {
          const entry = currentEntry(e);
          if (!entry) return;
          let v: number;
          try {
            v = evaluateExpr(entry);
          } catch {
            return;
          }
          let r: number;
          if (id === "sqrt") {
            if (v < 0) {
              setDisplay("Error");
              return;
            }
            r = Math.sqrt(v);
          } else if (id === "sq") {
            r = v * v;
          } else {
            if (v === 0) {
              setDisplay("Error");
              return;
            }
            r = 1 / v;
          }
          const start = e.length - entry.length;
          const text = formatResult(r);
          setBoth(e.slice(0, start) + text, text);
          setJustEvaluated(false);
          stateRef.current.justEvaluated = false;
          return;
        }
        case "eq": {
          if (!e) return;
          try {
            const v = evaluateExpr(e);
            const text = formatResult(v);
            const shown = e
              .replace(/\//g, "÷")
              .replace(/\*/g, "×")
              .replace(/-/g, "−")
              .replace(/([0-9.%\)])\s*([+−×÷])\s*/g, "$1 $2 ")
              .trimEnd();
            setTape((t) => [{ expr: shown, result: text }, ...t].slice(0, 30));
            setExpr(text);
            setDisplay(text);
            stateRef.current.expr = text;
            setJustEvaluated(true);
            stateRef.current.justEvaluated = true;
          } catch {
            setDisplay("Error");
          }
          return;
        }
      }
    },
    [currentEntry],
  );

  /* keyboard support while this window is focused */
  useEffect(() => {
    if (!focused) return;
    const onKey = (ev: KeyboardEvent) => {
      const k = ev.key;
      if (/^[0-9]$/.test(k)) press(k as KeyId);
      else if (k === ".") press("dot");
      else if (k === "+") press("add");
      else if (k === "-") press("sub");
      else if (k === "*" || k === "x") press("mul");
      else if (k === "/") {
        ev.preventDefault();
        press("div");
      } else if (k === "Enter" || k === "=") {
        ev.preventDefault();
        press("eq");
      } else if (k === "Escape") press("ac");
      else if (k === "%") press("pct");
      else if (k === "Backspace") {
        const e = stateRef.current.expr;
        const next = e.slice(0, -1);
        setExpr(next);
        stateRef.current.expr = next;
        setDisplay(next === "" ? "0" : next.replace(/\//g, "÷").replace(/\*/g, "×"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, press]);

  /* File menu: Clear + Use result (real actions only) */
  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "Clear (AC)", action: () => press("ac") },
      { label: "Clear History Tape", action: () => setTape([]) },
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, press]);

  const kindCls = (kind: string) =>
    kind === "op" || kind === "eq"
      ? "bg-[#f5a623] text-white hover:bg-[#f7b955]"
      : kind === "fn"
        ? "bg-neutral-300 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-500"
        : "bg-neutral-100 text-neutral-900 hover:bg-white dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-200/70 dark:bg-neutral-900" data-testid="calculator">
      {/* history tape */}
      <div className="uruk-scroll max-h-[86px] min-h-[26px] shrink-0 overflow-y-auto px-3 pt-2 text-right">
        {tape.length === 0 && (
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500">No history yet</div>
        )}
        {tape.map((t, i) => (
          <button
            key={i}
            data-testid="calc-tape-entry"
            className="block w-full truncate text-right text-[12px] text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            title={`${t.expr} = ${t.result} — click to reuse`}
            onClick={() => {
              setExpr(t.result);
              setDisplay(t.result);
              stateRef.current.expr = t.result;
              setJustEvaluated(true);
              stateRef.current.justEvaluated = true;
            }}
          >
            {t.expr} = <span className="font-medium text-neutral-700 dark:text-neutral-200">{t.result}</span>
          </button>
        ))}
      </div>

      {/* display */}
      <div className="shrink-0 px-4 pb-1 pt-1 text-right">
        <div
          data-testid="calc-display"
          className="truncate text-[42px] font-light leading-[1.1] text-neutral-900 dark:text-white"
        >
          {display}
        </div>
        <div className="h-4 truncate text-[12px] text-neutral-400 dark:text-neutral-500" data-testid="calc-expr">
          {expr.replace(/\//g, "÷").replace(/\*/g, "×")}
        </div>
      </div>

      {/* keypad */}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-[1.5px] p-[6px]">
        {KEYS.map((k) => (
          <button
            key={k.id}
            data-testid={`calc-key-${k.id}`}
            className={`flex items-center justify-center rounded-[6px] text-[19px] font-medium transition-colors ${kindCls(k.kind)}`}
            style={KEY_STYLE[k.id]}
            onClick={() => press(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

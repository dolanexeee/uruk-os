import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { php } from "@codemirror/lang-php";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { extOf } from "./associations";

/**
 * Uruk Code language registry — Phase 5.
 *
 * One table drives everything: which CodeMirror grammar a file gets
 * (by extension, or via the manual switcher in the tab bar) and what
 * "Run" honestly means for that language inside a browser:
 *   "js"     → the sandboxed iframe runner (JavaScript/TypeScript)
 *   "html"   → the sandboxed preview pane
 *   "python" → Pyodide (real CPython in WebAssembly, loaded lazily)
 *   null     → editing + highlighting only. There is NO Run button;
 *              the app says so in plain words instead of faking one.
 */

export type RunKind = "js" | "html" | "python" | null;

export interface LanguageDef {
  id: string;
  label: string;
  /** File extensions (no dot) that select this language. */
  extensions: string[];
  make: () => Extension;
  run: RunKind;
}

export const LANGUAGES: LanguageDef[] = [
  { id: "javascript", label: "JavaScript", extensions: ["js", "mjs", "cjs"], make: () => javascript(), run: "js" },
  { id: "jsx", label: "JSX", extensions: ["jsx"], make: () => javascript({ jsx: true }), run: "js" },
  { id: "typescript", label: "TypeScript", extensions: ["ts", "mts", "cts"], make: () => javascript({ typescript: true }), run: "js" },
  { id: "tsx", label: "TSX", extensions: ["tsx"], make: () => javascript({ typescript: true, jsx: true }), run: "js" },
  { id: "python", label: "Python", extensions: ["py"], make: () => python(), run: "python" },
  { id: "html", label: "HTML", extensions: ["html", "htm"], make: () => html(), run: "html" },
  { id: "css", label: "CSS", extensions: ["css"], make: () => css(), run: null },
  { id: "json", label: "JSON", extensions: ["json"], make: () => json(), run: null },
  { id: "markdown", label: "Markdown", extensions: ["md", "markdown"], make: () => markdown(), run: null },
  { id: "c", label: "C", extensions: ["c", "h"], make: () => cpp(), run: null },
  { id: "cpp", label: "C++", extensions: ["cpp", "cc", "cxx", "hpp"], make: () => cpp(), run: null },
  { id: "java", label: "Java", extensions: ["java"], make: () => java(), run: null },
  { id: "rust", label: "Rust", extensions: ["rs"], make: () => rust(), run: null },
  { id: "go", label: "Go", extensions: ["go"], make: () => go(), run: null },
  { id: "php", label: "PHP", extensions: ["php"], make: () => php(), run: null },
  { id: "sql", label: "SQL", extensions: ["sql"], make: () => sql(), run: null },
  { id: "xml", label: "XML", extensions: ["xml"], make: () => xml(), run: null },
  { id: "yaml", label: "YAML", extensions: ["yaml", "yml"], make: () => yaml(), run: null },
  { id: "shell", label: "Shell", extensions: ["sh", "bash"], make: () => StreamLanguage.define(shell), run: null },
];

export const PLAIN_LANGUAGE: LanguageDef = {
  id: "plain",
  label: "Plain text",
  extensions: [],
  make: () => [],
  run: null,
};

const BY_EXT = new Map<string, LanguageDef>();
for (const def of LANGUAGES) for (const ext of def.extensions) BY_EXT.set(ext, def);
const BY_ID = new Map<string, LanguageDef>([
  ...LANGUAGES.map((d) => [d.id, d] as const),
  [PLAIN_LANGUAGE.id, PLAIN_LANGUAGE],
]);

/** The language a file name implies. Unknown extensions = plain text. */
export function languageForName(name: string): LanguageDef {
  return BY_EXT.get(extOf(name)) ?? PLAIN_LANGUAGE;
}

export function languageById(id: string | undefined): LanguageDef | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/* ------------------------------------------------------------------ */
/* New-file templates — hello-world starters, written as real files.  */
/* ------------------------------------------------------------------ */

export interface FileTemplate {
  id: string;
  label: string;
  fileName: string;
  body: string;
}

export const FILE_TEMPLATES: FileTemplate[] = [
  { id: "blank", label: "Blank file", fileName: "script.js", body: "" },
  {
    id: "python",
    label: "Python starter",
    fileName: "hello.py",
    body: `# Uruk Code — Python starter (runs here, via Pyodide)
def greet(name):
    return f"Hello, {name}!"


print(greet("Uruk"))
print("Squares sum:", sum(i * i for i in range(10)))
`,
  },
  {
    id: "javascript",
    label: "JavaScript starter",
    fileName: "hello.js",
    body: `// Uruk Code — JavaScript starter (runs here)
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Uruk"));
console.log("40 + 2 =", 40 + 2);
`,
  },
  {
    id: "html",
    label: "HTML page",
    fileName: "page.html",
    body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Hello from Uruk Code</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 3rem; }
  </style>
</head>
<body>
  <h1>Hello, Uruk!</h1>
  <p>Edit me, then hit Preview.</p>
</body>
</html>
`,
  },
  {
    id: "c",
    label: "C starter",
    fileName: "hello.c",
    body: `/* Uruk Code — C starter (highlighting only: C can't run in a browser) */
#include <stdio.h>

int main(void) {
    printf("Hello, Uruk!\\n");
    return 0;
}
`,
  },
  {
    id: "java",
    label: "Java starter",
    fileName: "Hello.java",
    body: `// Uruk Code — Java starter (highlighting only: Java can't run in a browser)
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, Uruk!");
    }
}
`,
  },
  {
    id: "rust",
    label: "Rust starter",
    fileName: "hello.rs",
    body: `// Uruk Code — Rust starter (highlighting only: Rust can't run in a browser)
fn main() {
    let who = "Uruk";
    println!("Hello, {}!", who);
}
`,
  },
  {
    id: "go",
    label: "Go starter",
    fileName: "hello.go",
    body: `// Uruk Code — Go starter (highlighting only: Go can't run in a browser)
package main

import "fmt"

func main() {
	fmt.Println("Hello, Uruk!")
}
`,
  },
  {
    id: "sql",
    label: "SQL starter",
    fileName: "query.sql",
    body: `-- Uruk Code — SQL starter (highlighting only)
CREATE TABLE scribes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT DEFAULT 'Uruk'
);

INSERT INTO scribes (name) VALUES ('Enheduanna'), ('Sin-leqi-unninni');

SELECT * FROM scribes;
`,
  },
];

/**
 * RESET PASSWORD LOADING — ACTUAL REACT COMPONENT BEHAVIORAL TESTS
 *
 * Mounts and exercises the ACTUAL `AdminResetPasswordForm` React component from
 * `src/components/admin/reset-password-form.tsx` using React 19 (`react-dom/client`
 * + `React.act`), a minimal in-process DOM shim, and Node's `registerHooks` to
 * transpile `.tsx` and stub `next/navigation` + `next/link`.
 *
 * Zero database access, zero network access, zero email sending.
 *
 * Scenarios covered:
 *  C1  Headers received, JSON body hangs, then abort → spinner removed, amber notice shown (NOT invalid-link)
 *  C2  Request hangs before headers                  → spinner removed, amber notice shown
 *  C3  Valid token response                          → spinner removed, user info shown, no amber notice
 *  C4  Explicit invalid-token response (200 & 400)   → spinner removed, "Ogiltig eller utgången länk" shown
 *  C5  Network failure and retry                     → amber notice shown, clicking retry re-fetches & recovers
 *  C6  Component unmount during verification         → cleanup aborts in-flight fetch, no errors
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as nodeModule from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";

// ---------------------------------------------------------------------------
// 1. Minimal DOM shim sufficient for react-dom/client (createRoot + events)
// ---------------------------------------------------------------------------

class MiniNode {
  nodeType: number;
  ownerDocument: MiniDocument;
  parentNode: MiniNode | null = null;
  childNodes: MiniNode[] = [];

  constructor(nodeType: number, ownerDocument: MiniDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
  }

  get firstChild(): MiniNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): MiniNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): MiniNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 ? this.parentNode.childNodes[idx + 1] ?? null : null;
  }

  get previousSibling(): MiniNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx > 0 ? this.parentNode.childNodes[idx - 1] ?? null : null;
  }

  appendChild(child: MiniNode): MiniNode {
    return this.insertBefore(child, null);
  }

  insertBefore(child: MiniNode, refChild: MiniNode | null): MiniNode {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    if (!refChild) {
      this.childNodes.push(child);
    } else {
      const idx = this.childNodes.indexOf(refChild);
      if (idx === -1) {
        this.childNodes.push(child);
      } else {
        this.childNodes.splice(idx, 0, child);
      }
    }
    return child;
  }

  removeChild(child: MiniNode): MiniNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(this.ownerDocument.createTextNode(val));
    }
  }
}

class MiniText extends MiniNode {
  data: string;
  constructor(data: string, ownerDocument: MiniDocument) {
    super(3, ownerDocument);
    this.data = data;
  }
  get nodeValue(): string {
    return this.data;
  }
  set nodeValue(v: string) {
    this.data = v ?? "";
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(v: string) {
    this.data = v ?? "";
  }
}

class MiniComment extends MiniNode {
  data: string;
  constructor(data: string, ownerDocument: MiniDocument) {
    super(8, ownerDocument);
    this.data = data;
  }
  get textContent(): string {
    return "";
  }
}

class MiniEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  target: unknown = null;
  currentTarget: unknown = null;
  constructor(type: string, init?: { bubbles?: boolean; cancelable?: boolean }) {
    this.type = type;
    this.bubbles = Boolean(init?.bubbles);
    this.cancelable = Boolean(init?.cancelable);
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation() {}
}

class MiniElement extends MiniNode {
  tagName: string;
  nodeName: string;
  namespaceURI: string;
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<(e: MiniEvent) => void>>();
  style: Record<string, string> = {};
  value = "";
  disabled = false;
  type = "";

  constructor(tagName: string, ownerDocument: MiniDocument, namespaceURI = "http://www.w3.org/1999/xhtml") {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespaceURI;
  }

  setAttribute(name: string, value: string) {
    const str = String(value);
    this.attributes.set(name, str);
    if (name === "value") this.value = str;
    if (name === "disabled") this.disabled = true;
    if (name === "type") this.type = str;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
  }

  addEventListener(type: string, fn: (e: MiniEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: MiniEvent) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  dispatchEvent(event: MiniEvent): boolean {
    event.target = this;
    let curr: MiniNode | null = event.target as MiniNode;
    while (curr) {
      if (curr instanceof MiniElement) {
        event.currentTarget = curr;
        const set = curr.listeners.get(event.type);
        if (set) {
          for (const fn of set) fn(event);
        }
      }
      if (!event.bubbles) break;
      curr = curr.parentNode;
    }
    return !event.defaultPrevented;
  }

  focus() {}
  blur() {}

  querySelectorAll(predicate: (el: MiniElement) => boolean): MiniElement[] {
    const out: MiniElement[] = [];
    const walk = (node: MiniNode) => {
      if (node instanceof MiniElement && predicate(node)) out.push(node);
      for (const child of node.childNodes) walk(child);
    };
    walk(this);
    return out;
  }
}

class MiniDocument extends MiniNode {
  documentElement: MiniElement;
  body: MiniElement;
  activeElement: MiniElement | null = null;
  listeners = new Map<string, Set<(e: MiniEvent) => void>>();

  constructor() {
    super(9, null as unknown as MiniDocument);
    this.ownerDocument = this;
    this.documentElement = new MiniElement("html", this);
    this.body = new MiniElement("body", this);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): MiniElement {
    return new MiniElement(tag, this);
  }

  createElementNS(ns: string, tag: string): MiniElement {
    return new MiniElement(tag, this, ns);
  }

  createTextNode(text: string): MiniText {
    return new MiniText(text, this);
  }

  createComment(text: string): MiniComment {
    return new MiniComment(text, this);
  }

  addEventListener(type: string, fn: (e: MiniEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: MiniEvent) => void) {
    this.listeners.get(type)?.delete(fn);
  }
}

function setupMiniDom() {
  const doc = new MiniDocument();
  class MiniHTMLIFrameElement extends MiniElement {}
  const win = {
    document: doc,
    Event: MiniEvent,
    HTMLElement: MiniElement,
    HTMLIFrameElement: MiniHTMLIFrameElement,
    Element: MiniElement,
    Node: MiniNode,
    Text: MiniText,
    navigator: { userAgent: "node-test" },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (doc as unknown as { defaultView: typeof win }).defaultView = win;
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    window: win,
    document: doc,
    Event: MiniEvent,
    HTMLElement: MiniElement,
    HTMLIFrameElement: MiniHTMLIFrameElement,
    Element: MiniElement,
    Node: MiniNode,
    Text: MiniText,
  });
  return doc;
}

// ---------------------------------------------------------------------------
// 2. Module hooks: transpile .tsx, resolve @/* aliases, stub Next.js modules
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");
const virtualNextNavUrl = pathToFileURL(path.join(projectRoot, "tests", "__virtual_next_navigation.mjs")).href;
const virtualNextLinkUrl = pathToFileURL(path.join(projectRoot, "tests", "__virtual_next_link.mjs")).href;
const virtualNextImageUrl = pathToFileURL(path.join(projectRoot, "tests", "__virtual_next_image.mjs")).href;
let currentSearchToken = "valid-test-token";

interface ModuleHooks {
  registerHooks(hooks: {
    resolve?: (
      specifier: string,
      context: { parentURL?: string },
      nextResolve: (s: string, c: { parentURL?: string }) => { shortCircuit?: boolean; url: string },
    ) => { shortCircuit?: boolean; url: string };
    load?: (
      url: string,
      context: Record<string, unknown>,
      nextLoad: (u: string, c: Record<string, unknown>) => { shortCircuit?: boolean; format: string; source: string | Uint8Array },
    ) => { shortCircuit?: boolean; format: string; source: string | Uint8Array };
  }): void;
}

const registerHooksFn = (nodeModule as unknown as Partial<ModuleHooks>).registerHooks;
const hasRegisterHooks = typeof registerHooksFn === "function";
const registerHooksSkipReason = hasRegisterHooks
  ? false
  : `Requires Node.js with module.registerHooks (Node >=22.15.0 / CI Node 24); current runtime is ${process.version}`;

if (registerHooksFn) {
  registerHooksFn({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation") {
      return { shortCircuit: true, url: virtualNextNavUrl };
    }
    if (specifier === "next/link") {
      return { shortCircuit: true, url: virtualNextLinkUrl };
    }
    if (specifier === "next/image") {
      return { shortCircuit: true, url: virtualNextImageUrl };
    }
    if (specifier.startsWith("@/")) {
      const rel = specifier.slice(2);
      const base = path.join(projectRoot, "src", rel);
      const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return { shortCircuit: true, url: pathToFileURL(c).href };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === virtualNextNavUrl) {
      const source = `
        export function useRouter() {
          return { replace() {}, refresh() {}, push() {} };
        }
        export function useSearchParams() {
          return {
            get(key) {
              return key === "token" ? globalThis.__TEST_SEARCH_TOKEN__ ?? null : null;
            },
          };
        }
      `;
      return { shortCircuit: true, format: "module", source };
    }
    if (url === virtualNextLinkUrl) {
      const source = `
        import React from "react";
        export default function Link({ href, children, ...rest }) {
          return React.createElement("a", { href, ...rest }, children);
        }
      `;
      return { shortCircuit: true, format: "module", source };
    }
    if (url === virtualNextImageUrl) {
      const source = `
        import React from "react";
        export default function Image({ src, alt, ...rest }) {
          return React.createElement("img", { src, alt, ...rest });
        }
      `;
      return { shortCircuit: true, format: "module", source };
    }
    if (url.startsWith("file:") && url.endsWith(".tsx")) {
      const filePath = fileURLToPath(url);
      const raw = fs.readFileSync(filePath, "utf8");
      const transpiled = ts.transpileModule(raw, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      });
      return { shortCircuit: true, format: "module", source: transpiled.outputText };
    }
    return nextLoad(url, context);
  },
  });
}

// ---------------------------------------------------------------------------
// 3. Shared test helpers
// ---------------------------------------------------------------------------

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn;
let ReactModule: typeof import("react");
let ReactDomClient: typeof import("react-dom/client");
let AdminResetPasswordForm: typeof import("../src/components/admin/reset-password-form").AdminResetPasswordForm;
let doc: MiniDocument;

before(async () => {
  originalFetch = globalThis.fetch;
  if (!hasRegisterHooks) return;
  doc = setupMiniDom();
  ReactModule = await import("react");
  ReactDomClient = await import("react-dom/client");
  const mod = await import("@/components/admin/reset-password-form");
  AdminResetPasswordForm = mod.AdminResetPasswordForm;
});

after(() => {
  globalThis.fetch = originalFetch;
});

async function mountForm(token: string, verifyTimeoutMs = 80, slowThresholdMs = 30) {
  currentSearchToken = token;
  (globalThis as Record<string, unknown>).__TEST_SEARCH_TOKEN__ = currentSearchToken;

  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = ReactDomClient.createRoot(container as unknown as HTMLElement);

  await ReactModule.act(async () => {
    const Component = AdminResetPasswordForm as React.ComponentType<{
      verifyTimeoutMs?: number;
      slowThresholdMs?: number;
    }>;
    root.render(
      ReactModule.createElement(Component, {
        verifyTimeoutMs,
        slowThresholdMs,
      }),
    );
  });

  return {
    container,
    async unmount() {
      await ReactModule.act(async () => {
        root.unmount();
      });
      doc.body.removeChild(container);
    },
  };
}

function findButtonByText(container: MiniElement, text: string): MiniElement | undefined {
  return container
    .querySelectorAll((el) => el.tagName === "BUTTON")
    .find((btn) => btn.textContent.includes(text));
}

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 4. Actual-Component Behavioral Tests
// ---------------------------------------------------------------------------

const componentTestOptions = { timeout: 2000, skip: registerHooksSkipReason };

test("C1: headers received, JSON body hangs, then abort → spinner removed, amber notice shown (NOT invalid-link)", componentTestOptions, async () => {
  let seenSignal: AbortSignal | undefined;

  globalThis.fetch = (async (_url, init) => {
    seenSignal = init?.signal ?? undefined;
    // Headers arrive immediately with HTTP 200 OK
    return {
      ok: true,
      status: 200,
      // Body read hangs until the AbortController aborts it
      json: () =>
        new Promise((_resolve, reject) => {
          if (seenSignal?.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          seenSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted.", "AbortError")),
            { once: true },
          );
        }),
    } as unknown as Response;
  }) as FetchFn;

  const mounted = await mountForm("token-body-stall", 80, 30);

  // Immediately after mount, spinner must be visible
  assert.ok(
    mounted.container.textContent.includes("Verifierar återställningslänk…"),
    "spinner should be visible while body read is pending",
  );

  // Wait past the 80ms abort timeout inside act()
  await ReactModule.act(async () => {
    await wait(140);
  });

  assert.equal(seenSignal?.aborted, true, "AbortController must abort stalled body read");
  const text = mounted.container.textContent;
  assert.ok(!text.includes("Verifierar återställningslänk…"), "spinner must be removed after abort");
  assert.ok(!text.includes("Ogiltig eller utgången länk"), "aborted body read must NEVER show invalid-link");
  assert.ok(
    text.includes("Förhandsgranskningen tog längre tid än väntat"),
    "amber unverified notice must be displayed",
  );
  assert.ok(text.includes("Spara nytt lösenord"), "password form must be accessible");

  await mounted.unmount();
});

test("C2: request hangs before headers → spinner removed after timeout and amber notice shown", componentTestOptions, async () => {
  let seenSignal: AbortSignal | undefined;

  globalThis.fetch = ((_url, init) => {
    seenSignal = init?.signal ?? undefined;
    return new Promise((_resolve, reject) => {
      if (seenSignal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      seenSignal?.addEventListener(
        "abort",
        () => reject(new DOMException("The operation was aborted.", "AbortError")),
        { once: true },
      );
    });
  }) as FetchFn;

  const mounted = await mountForm("token-headers-hang", 80, 30);

  assert.ok(mounted.container.textContent.includes("Verifierar återställningslänk…"));

  await ReactModule.act(async () => {
    await wait(140);
  });

  assert.equal(seenSignal?.aborted, true);
  const text = mounted.container.textContent;
  assert.ok(!text.includes("Verifierar återställningslänk…"), "spinner must disappear");
  assert.ok(!text.includes("Ogiltig eller utgången länk"), "timeout must NOT show invalid-link");
  assert.ok(text.includes("Förhandsgranskningen tog längre tid än väntat"));
  assert.ok(text.includes("Spara nytt lösenord"));

  await mounted.unmount();
});

test("C3: valid token response → spinner removed, user info rendered, no amber notice", componentTestOptions, async () => {
  globalThis.fetch = (async () =>
    mockJsonResponse(200, { valid: true, email: "admin@falken.se", name: "Admin" })) as FetchFn;

  const mounted = await mountForm("valid-token-123");

  const text = mounted.container.textContent;
  assert.ok(!text.includes("Verifierar återställningslänk…"), "spinner must be removed");
  assert.ok(text.includes("Admin (admin@falken.se)"), "verified user identity should be displayed");
  assert.ok(!text.includes("Förhandsgranskningen tog längre tid än väntat"), "no amber notice for valid token");
  assert.ok(text.includes("Spara nytt lösenord"), "reset password form should be rendered");

  await mounted.unmount();
});

test("C4: explicit invalid-token response (200 valid:false and HTTP 400) → invalid-link screen shown", componentTestOptions, async () => {
  // Case A: HTTP 200 with { valid: false }
  globalThis.fetch = (async () =>
    mockJsonResponse(200, { valid: false, reason: "invalid_or_expired" })) as FetchFn;

  const mountedA = await mountForm("expired-token-123");
  assert.ok(!mountedA.container.textContent.includes("Verifierar återställningslänk…"));
  assert.ok(mountedA.container.textContent.includes("Ogiltig eller utgången länk"));
  assert.ok(!mountedA.container.textContent.includes("Spara nytt lösenord"));
  await mountedA.unmount();

  // Case B: HTTP 400
  globalThis.fetch = (async () =>
    mockJsonResponse(400, { valid: false, reason: "missing_token" })) as FetchFn;

  const mountedB = await mountForm("bad-format-token");
  assert.ok(!mountedB.container.textContent.includes("Verifierar återställningslänk…"));
  assert.ok(mountedB.container.textContent.includes("Ogiltig eller utgången länk"));
  await mountedB.unmount();
});

test("C5: network failure and retry → amber notice shown, clicking retry re-fetches and recovers", componentTestOptions, async () => {
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new TypeError("Failed to fetch");
    }
    return mockJsonResponse(200, { valid: true, email: "admin@falken.se", name: "Admin" });
  }) as FetchFn;

  const mounted = await mountForm("retry-token-123");

  assert.equal(callCount, 1);
  assert.ok(mounted.container.textContent.includes("Förhandsgranskningen tog längre tid än väntat"));
  assert.ok(!mounted.container.textContent.includes("Ogiltig eller utgången länk"));

  const retryBtn = findButtonByText(mounted.container, "Försök verifiera igen");
  assert.ok(retryBtn, "retry button must be rendered in amber notice");

  await ReactModule.act(async () => {
    retryBtn.dispatchEvent(new MiniEvent("click", { bubbles: true, cancelable: true }));
  });

  assert.equal(callCount, 2, "clicking retry must trigger a new verification request");
  const textAfterRetry = mounted.container.textContent;
  assert.ok(textAfterRetry.includes("Admin (admin@falken.se)"), "recovered state must show verified user");
  assert.ok(!textAfterRetry.includes("Förhandsgranskningen tog längre tid än väntat"), "amber notice cleared after retry succeeds");

  await mounted.unmount();
});

test("C6: component unmount during verification → cleanup aborts in-flight fetch with no errors", componentTestOptions, async () => {
  let seenSignal: AbortSignal | undefined;

  globalThis.fetch = ((_url, init) => {
    seenSignal = init?.signal ?? undefined;
    return new Promise((_resolve, reject) => {
      seenSignal?.addEventListener(
        "abort",
        () => reject(new DOMException("The operation was aborted.", "AbortError")),
        { once: true },
      );
    });
  }) as FetchFn;

  const mounted = await mountForm("unmount-token", 500, 200);
  assert.equal(seenSignal?.aborted, false, "request should still be in flight before unmount");

  await mounted.unmount();
  assert.equal(seenSignal?.aborted, true, "unmount cleanup must abort in-flight request");

  // Wait briefly to ensure no late timers or state mutations throw
  await wait(80);
});

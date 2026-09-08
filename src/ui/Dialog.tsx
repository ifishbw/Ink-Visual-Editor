/**
 * In-app prompt/confirm. Native `window.prompt` / `confirm` throw (and do nothing) in any browser
 * that blocks them, including embedded webviews — which is how "New knot" and the header × used
 * to fail silently. One host is mounted in App; the ask* helpers are Promise-based so canvas
 * handlers can await them without owning UI state.
 */
import { useEffect, useId, useRef, useState } from 'react';

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  submitLabel?: string;
  initial?: string;
  hint?: string;
  validate?: (value: string) => string | null;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, a "don't ask again" checkbox writes `1` here and later calls skip the dialog. */
  skipKey?: string;
}

type Request =
  | { type: 'text'; opts: PromptOptions; resolve: (value: string | null) => void }
  | { type: 'confirm'; opts: ConfirmOptions; resolve: (ok: boolean) => void };

let openRequest: ((r: Request) => void) | null = null;

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function askText(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!openRequest) return resolve(null);
    openRequest({ type: 'text', opts, resolve });
  });
}

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (opts.skipKey && readLS(opts.skipKey) === '1') return Promise.resolve(true);
  return new Promise((resolve) => {
    if (!openRequest) return resolve(false);
    openRequest({ type: 'confirm', opts, resolve });
  });
}

export const DELETE_SKIP_KEY = 'inkvisual:skipDeleteConfirm';

export function confirmDeleteKnots(names: string[]): Promise<boolean> {
  if (names.length === 0) return Promise.resolve(false);
  const one = names.length === 1;
  return askConfirm({
    title: one ? `Delete knot “${names[0]}”?` : `Delete ${names.length} knots?`,
    message: one
      ? `“${names[0]}” and all of its text will be removed from the .ink file. You can undo afterwards.`
      : `${names.join(', ')} and all of their text will be removed from the .ink files. You can undo afterwards.`,
    confirmLabel: 'Delete',
    danger: true,
    skipKey: DELETE_SKIP_KEY,
  });
}

export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    openRequest = setReq;
    return () => {
      if (openRequest === setReq) openRequest = null;
    };
  }, []);
  if (!req) return null;
  return <DialogCard req={req} onDone={() => setReq(null)} />;
}

function DialogCard({ req, onDone }: { req: Request; onDone: () => void }) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(req.type === 'text' ? (req.opts.initial ?? '') : '');
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const closeText = (result: string | null) => {
    if (req.type === 'text') req.resolve(result);
    onDone();
  };
  const closeConfirm = (ok: boolean) => {
    if (req.type === 'confirm') {
      if (ok && skip && req.opts.skipKey) writeLS(req.opts.skipKey, '1');
      req.resolve(ok);
    }
    onDone();
  };

  const submitText = () => {
    if (req.type !== 'text') return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter a name');
      return;
    }
    const invalid = req.opts.validate?.(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }
    closeText(trimmed);
  };

  return (
    <div
      className="dialog-back"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (req.type === 'text') closeText(null);
          else closeConfirm(false);
        }
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (req.type === 'text') closeText(null);
            else closeConfirm(false);
          }
          if (e.key === 'Enter' && req.type === 'confirm') {
            e.preventDefault();
            closeConfirm(true);
          }
        }}
      >
        <h2 id={titleId}>{req.type === 'text' ? req.opts.title : req.opts.title}</h2>
        {req.type === 'text' && req.opts.message && <p>{req.opts.message}</p>}
        {req.type === 'confirm' && <p>{req.opts.message}</p>}
        {req.type === 'text' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText();
            }}
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder={req.opts.placeholder}
              spellCheck={false}
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="error">{error}</p>}
            {req.opts.hint && <p className="muted">{req.opts.hint}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={() => closeText(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                {req.opts.submitLabel ?? 'OK'}
              </button>
            </div>
          </form>
        )}
        {req.type === 'confirm' && (
          <>
            {req.opts.skipKey && (
              <label className="check">
                <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
                Don’t ask again
              </label>
            )}
            <div className="dialog-actions">
              <button type="button" onClick={() => closeConfirm(false)}>
                Cancel
              </button>
              <button type="button" className={req.opts.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)}>
                {req.opts.confirmLabel ?? 'OK'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

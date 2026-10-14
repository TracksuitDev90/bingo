// Small shared helpers: storage that never throws, toasts, dialogs.

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or storage full: the game still works, it just won't persist */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

let toastEl;
let toastTimer;
export function toast(message, ms = 2200) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  requestAnimationFrame(() => toastEl.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), ms);
}

/** Open a <dialog class="sheet">; resolves with the button value that closed it. */
export function openSheet(dialog) {
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue);
    };
    dialog.returnValue = '';
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

/** Ask a yes/no question in a paper sheet. */
export function confirmSheet({ title, body, ok = 'OK', cancel = 'Cancel', danger = false }) {
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.innerHTML = `
    <form method="dialog" class="sheet__body">
      <h2></h2><p></p>
      <div class="sheet__actions">
        <button class="btn btn--small" value="cancel"></button>
        <button class="btn btn--small ${danger ? 'btn--red' : 'btn--royal'}" value="ok"></button>
      </div>
    </form>`;
  d.querySelector('h2').textContent = title;
  d.querySelector('p').textContent = body;
  d.querySelector('[value=cancel]').textContent = cancel;
  d.querySelector('[value=ok]').textContent = ok;
  document.body.append(d);
  return openSheet(d).then((v) => {
    d.remove();
    return v === 'ok';
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* ignore */
    }
    ta.remove();
    return ok;
  }
}

export const formatTime = (secs) =>
  new Date(secs * 1000).toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });

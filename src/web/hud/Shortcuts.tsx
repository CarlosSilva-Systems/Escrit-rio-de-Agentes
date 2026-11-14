import { useT } from '../AppContext';
import { Modal } from './Modal';

const KEYS = ['short.c', 'short.t', 'short.a', 'short.m', 'short.help', 'short.esc'] as const;

export function Shortcuts({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal titleId="shortcuts-title" title={t('set.shortcuts')} onClose={onClose}>
      <ul className="shortcut-list">
        {KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <p className="muted">{t('short.note')}</p>
    </Modal>
  );
}

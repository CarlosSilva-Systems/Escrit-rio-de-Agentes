import { useServices, useT } from '../AppContext';
import { Modal } from './Modal';

/**
 * Short confirmation before signing out. The header's Close button has the initial focus (the safe
 * choice); Esc cancels through the global shortcut layer; focus returns to the Settings button.
 */
export function LogoutConfirm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { connection } = useServices();
  return (
    <Modal titleId="logout-title" title={t('logout.title')} onClose={onClose}>
      <p>{t('logout.body')}</p>
      <div className="screen__actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          data-testid="logout-confirm"
          onClick={() => {
            onClose();
            void connection.logout();
          }}
        >
          {t('logout.confirm')}
        </button>
      </div>
    </Modal>
  );
}

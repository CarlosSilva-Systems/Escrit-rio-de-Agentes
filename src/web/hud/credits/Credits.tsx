import { useT } from '../../AppContext';
import { Modal } from '../Modal';
import { CREDITS } from './creditEntries';

export function Credits({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal titleId="credits-title" title={t('credits.title')} onClose={onClose}>
      <p>{t('credits.intro')}</p>
      <p>{t('credits.origin')}</p>
      <p>{t('credits.art')}</p>
      <p>{t('credits.fonts')}</p>
      <h3>{t('credits.list')}</h3>
      <table className="credits-table">
        <thead>
          <tr>
            <th scope="col">{t('credits.col.name')}</th>
            <th scope="col">{t('credits.col.author')}</th>
            <th scope="col">{t('credits.col.license')}</th>
            <th scope="col">{t('credits.col.status')}</th>
          </tr>
        </thead>
        <tbody>
          {CREDITS.map((c) => (
            <tr key={c.name ?? c.nameKey}>
              <th scope="row">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {c.name}
                  </a>
                ) : c.nameKey ? (
                  t(c.nameKey)
                ) : (
                  c.name
                )}
              </th>
              <td>{c.author}</td>
              <td>{c.license}</td>
              <td>{t(`credits.status.${c.status}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t('credits.file')}</p>
    </Modal>
  );
}

import type { RecentFile } from '@shared/types';

interface RecentFilesPanelProps {
  files: RecentFile[];
  onOpen: (filePath: string) => void;
  onRemove: (filePath: string) => void;
  emptyState: string;
}

function extractParts(filePath: string): { folder: string; fileName: string } {
  const segments = filePath.replace(/\\/g, '/').split('/');
  const fileName = segments.pop() || filePath;
  const folder = segments.pop() || '';
  return { folder, fileName };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const RecentFilesPanel = ({ files, onOpen, onRemove, emptyState }: RecentFilesPanelProps) => {
  return (
    <div className="recent-panel">
      <h3 className="recent-panel__title">Recents</h3>
      {files.length === 0 && <p className="recent-panel__empty">{emptyState}</p>}
      <ul className="recent-list">
        {files.map((file) => {
          const { folder, fileName } = extractParts(file.path);
          return (
            <li key={file.path} className="recent-list__item">
              <button
                className="recent-item"
                onClick={() => onOpen(file.path)}
                title={file.path}
              >
                <div className="recent-item__icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 2h4l1.5 1.5H13a1 1 0 011 1V13a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="recent-item__text">
                  <span className="recent-item__name">
                    {folder && <span className="recent-item__name-folder">{folder}/</span>}
                    {fileName}
                  </span>
                  <span className="recent-item__folder">
                    {timeAgo(file.openedAt)}
                  </span>
                </div>
              </button>
              <button
                className="recent-item__remove"
                onClick={() => onRemove(file.path)}
                title="Remove from recents"
                aria-label={`Remove ${fileName} from recents`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M4 4l6 6M10 4l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RecentFilesPanel;


import React from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import './ChatHistorySidebar.css';

export interface HistoryItem {
  session_id: string;
  title: string;
  updated_at: string;
}

interface ChatHistorySidebarProps {
  history: HistoryItem[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectChat: (sessionId: string) => void;
}

// 时间分组逻辑
const groupHistoryByDate = (history: HistoryItem[]) => {
  const groups: { [key: string]: HistoryItem[] } = {
    '今天': [],
    '7天内': [],
    '30天内': [],
    '更早': [],
  };

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  history.forEach(item => {
    const itemDate = new Date(item.updated_at);
    const diffDays = Math.round((now.getTime() - itemDate.getTime()) / oneDay);

    if (diffDays <= 1) {
      groups['今天'].push(item);
    } else if (diffDays <= 7) {
      groups['7天内'].push(item);
    } else if (diffDays <= 30) {
      groups['30天内'].push(item);
    } else {
      groups['更早'].push(item);
    }
  });

  return groups;
};

export const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  history,
  activeSessionId,
  onNewChat,
  onSelectChat,
}) => {
  const groupedHistory = groupHistoryByDate(history);
  const hasAnyHistory = history.length > 0;

  return (
    <div className="chat-history-sidebar">
      <div className="history-header">
        <button className="new-chat-btn" onClick={onNewChat}>
          <Plus size={16} />
          <span>开启新对话</span>
        </button>
      </div>

      <div className="history-list">
        {!hasAnyHistory ? (
          <div className="history-empty">暂无历史记录，发送消息后将自动保存</div>
        ) : (
          Object.entries(groupedHistory).map(([groupName, items]) => (
            items.length > 0 && (
              <div key={groupName} className="history-group">
                <div className="group-title">{groupName}</div>
                {items.map(item => (
                  <div 
                    key={item.session_id}
                    className={clsx('history-item', { active: item.session_id === activeSessionId })}
                    onClick={() => onSelectChat(item.session_id)}
                    title={item.title}
                  >
                    <span className="history-item-title">{item.title}</span>
                    <button className="history-item-actions">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )
          ))
        )}
      </div>
    </div>
  );
};

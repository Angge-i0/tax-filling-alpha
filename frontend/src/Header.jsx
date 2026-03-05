import React, { useState } from 'react';
import {
    Filter,
    Search,
    ChevronDown,
    Check,
    X,
    Bell,
    Trash2
} from 'lucide-react';
import { apiGet, apiPost, apiDelete } from './api';

export default function Header({ barangays = [], onBarangaySelect, username }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCategories, setSelectedCategories] = useState(['Residential']);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifications = () => {
        apiGet('/api/auth/notifications/')
            .then(r => r.json())
            .then(data => {
                const notes = data.notifications || [];
                setNotifications(notes);
                setUnreadCount(notes.filter(n => !n.is_read).length);
            })
            .catch(err => console.error("Notif error:", err));
    };

    React.useEffect(() => {
        if (username) {
            fetchNotifications();
            const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
            return () => clearInterval(interval);
        }
    }, [username]);

    const markAllAsRead = async () => {
        const res = await apiPost('/api/auth/notifications/', {});
        if (res.ok) {
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        }
    };

    const handleDeleteNotif = async (e, id) => {
        e.stopPropagation();
        const res = await apiDelete(`/api/auth/notifications/${id}/`);
        if (res.ok) {
            setNotifications(prev => prev.filter(n => n.id !== id));
            // Recalculate unread if needed, though usually they are read when clicked
        }
    };

    const handleClearAll = async () => {
        if (!window.confirm("Clear all notification history?")) return;
        const res = await apiDelete('/api/auth/notifications/');
        if (res.ok) {
            setNotifications([]);
            setUnreadCount(0);
        }
    };

    const categories = ['Residential', 'Agriculture', 'Commercial', 'Industrial'];

    const toggleCategory = (cat) => {
        if (selectedCategories.includes(cat)) {
            setSelectedCategories(selectedCategories.filter(c => c !== cat));
        } else {
            setSelectedCategories([...selectedCategories, cat]);
        }
    };

    const handleApply = () => {
        if (onBarangaySelect) {
            onBarangaySelect(searchQuery);
        }
        setIsModalOpen(false);
    };

    const filteredBarangays = barangays.filter(brgy =>
        brgy.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="app-header">
            <div className="header-user">
                <div className="user-avatar">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
                </div>
                <span className="user-name">{username || 'User Name'}</span>
            </div>

            <div className="header-actions">
                <div style={{ position: 'relative' }}>
                    <button className="filter-trigger-btn" onClick={() => { setIsNotifOpen(!isNotifOpen); if (!isNotifOpen) markAllAsRead(); }}>
                        <Bell size={20} fill={unreadCount > 0 ? "currentColor" : "none"} />
                        {unreadCount > 0 && (
                            <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: '#fff', fontSize: '10px', padding: '2px 5px', borderRadius: '50%', border: '2px solid #0f1d35' }}>
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {isNotifOpen && (
                        <div className="notif-dropdown" style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            width: '320px',
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            marginTop: '10px',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#fff' }}>Notifications</span>
                                <button onClick={() => setIsNotifOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}><X size={16} /></button>
                            </div>
                            <div style={{
                                maxHeight: '180px', // Show roughly 2 notifications before scrolling
                                overflowY: 'auto'
                            }}>
                                {notifications.length === 0 ? (
                                    <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No notifications</div>
                                ) : (
                                    notifications.map(n => (
                                        <div key={n.id} className="notif-item" style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid #334155',
                                            opacity: n.is_read ? 0.7 : 1,
                                            position: 'relative',
                                            transition: 'background 0.2s',
                                            cursor: 'default'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ fontWeight: '600', fontSize: '13px', color: '#fff', marginBottom: '4px', paddingRight: '20px' }}>{n.title}</div>
                                                <button
                                                    onClick={(e) => handleDeleteNotif(e, n.id)}
                                                    className="delete-notif-btn"
                                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', opacity: 0.5 }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' }}>{n.message}</div>
                                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '6px' }}>{new Date(n.created_at).toLocaleString()}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {notifications.length > 0 && (
                                <div style={{ padding: '8px', borderTop: '1px solid #334155', textAlign: 'center' }}>
                                    <button
                                        onClick={handleClearAll}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#ef4444',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            width: '100%',
                                            padding: '8px'
                                        }}
                                    >
                                        <Trash2 size={14} />
                                        Clear all history
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="filter-group">
                    <button className="filter-trigger-btn" onClick={() => setIsModalOpen(true)}>
                        <Filter size={20} fill="currentColor" />
                        <span className="filter-label">Filter</span>
                    </button>
                </div>
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title-group">
                                <Filter size={20} fill="currentColor" />
                                <span className="filter-label">Filter</span>
                            </div>
                            <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                                <X size={24} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="filter-controls-vertical">
                                <div className="search-container">
                                    <div className="search-box">
                                        <input
                                            type="text"
                                            className="search-input"
                                            placeholder="Type Brgy."
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                setIsDropdownOpen(true);
                                            }}
                                            onFocus={() => setIsDropdownOpen(true)}
                                            onBlur={() => {
                                                setTimeout(() => setIsDropdownOpen(false), 200);
                                            }}
                                            autoFocus
                                        />
                                        <Search size={18} className="search-icon" />
                                    </div>
                                    <div className={`dropdown-panel ${isDropdownOpen ? 'visible' : ''}`}>
                                        {filteredBarangays.length > 0 ? (
                                            filteredBarangays.map(brgy => (
                                                <div
                                                    key={brgy}
                                                    className="dropdown-item"
                                                    onClick={() => {
                                                        setSearchQuery(brgy);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                >
                                                    {brgy}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="dropdown-item disabled">No barangays found</div>
                                        )}
                                    </div>
                                </div>

                                <div className="pin-container">
                                    <span className="pin-label">PIN</span>
                                </div>

                                <div className="category-section">
                                    <span className="category-title">Category</span>
                                    <div className="category-grid">
                                        {categories.map(cat => (
                                            <div
                                                key={cat}
                                                className="category-item"
                                                onClick={() => toggleCategory(cat)}
                                            >
                                                <div className={`checkbox ${selectedCategories.includes(cat) ? 'checked' : ''}`}>
                                                    {selectedCategories.includes(cat) && <Check size={12} strokeWidth={4} />}
                                                </div>
                                                <span>{cat}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="apply-btn" onClick={handleApply}>Apply Filter</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect } from 'react';
// Đã fix: Import thêm hàm renameProject từ api service của bồ
import { fetchProjectsList, createProject, deleteProject, renameProject } from '../services/api';

interface ProjectItem {
  id: number;
  name: string;
  updated_at: string;
}

interface ProjectSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (projectId: number, projectName: string) => void;
  currentUser: any;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({ isOpen, onClose, onSelectProject, currentUser }) => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Tự động tải danh sách dự án mỗi khi mở Sidebar
  useEffect(() => {
    if (isOpen && currentUser) {
      loadProjects();
    }
  }, [isOpen, currentUser]);

  const loadProjects = async () => {
    const res = await fetchProjectsList();
    if (res.success && res.projects) {
      setProjects(res.projects);
      setErrorMsg(''); // Xóa thông báo lỗi cũ nếu có
    } else {
      setErrorMsg(res.message || 'Không thể tải danh sách dự án.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    // Sinh code boilerplate mặc định cho dự án mới tạo (UC-19)
    const defaultCode = `#include <stdio.h>\n\nint main() {\n    printf("Dự án mới: ${newProjectName}\\n");\n    return 0;\n}`;
    
    const res = await createProject(newProjectName, defaultCode);
    if (res.success) {
      setNewProjectName('');
      loadProjects(); // Reload lại bảng danh sách
    } else {
      alert(res.message);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Chặn hành vi click lan ra thẻ cha (mở nhầm project)
    if (window.confirm('Đồng môn có chắc chắn muốn xóa dự án này khỏi DB?')) {
      const res = await deleteProject(id);
      if (res.success) {
        loadProjects();
      } else {
        alert(res.message);
      }
    }
  };

  // =========================================================================
  // CHỨC NĂNG MỚI: HÀM XỬ LÝ ĐỔI TÊN DỰ ÁN MỚI THÊM
  // =========================================================================
  const handleRename = async (id: number, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Chặn hành vi mở nhầm dự án khi bấm nút đổi tên
    const newName = window.prompt(`Nhập tên mới cho dự án "${currentName}":`, currentName);
    
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const res = await renameProject(id, newName.trim());
      if (res.success) {
        loadProjects(); // Reload lại danh sách sidebar sau khi đổi tên thành công
      } else {
        alert(res.message);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sidebar} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3>📁 Dự án của bạn</h3>
          <button onClick={onClose} style={styles.closeBtn}>&times;</button>
        </div>

        {currentUser ? (
          <>
            {/* Form tạo nhanh dự án mới (UC-19) */}
            <form onSubmit={handleCreate} style={styles.createForm}>
              <input 
                type="text" 
                placeholder="+ Tên dự án mới..." 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={styles.input}
                required
              />
              <button type="submit" style={styles.addBtn}>Tạo</button>
            </form>

            {errorMsg && <p style={{ color: '#f87171', fontSize: '13px', margin: '0 0 10px 0' }}>{errorMsg}</p>}

            {/* Danh sách dự án (UC-21) */}
            <div style={styles.listContainer}>
              {projects.length === 0 ? (
                <p style={styles.emptyText}>Chưa có dự án nào được lưu.</p>
              ) : (
                projects.map((p) => (
                  <div key={p.id} style={styles.item} onClick={() => onSelectProject(p.id, p.name)}>
                    <div style={styles.itemInfo}>
                      <span style={styles.itemName}>📄 {p.name}</span>
                      <span style={styles.itemTime}>Cập nhật: {new Date(p.updated_at).toLocaleDateString()}</span>
                    </div>
                    
                    {/* KHU VỰC ĐIỀU KHIỂN TÁC VỤ */}
                    <div style={styles.actionGroup}>
                      {/* NÚT ĐỔI TÊN MỚI THÊM */}
                      <button 
                        onClick={(e) => handleRename(p.id, p.name, e)} 
                        style={styles.renameBtn} 
                        title="Đổi tên dự án"
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={(e) => handleDelete(p.id, e)} 
                        style={styles.deleteBtn} 
                        title="Xóa dự án"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <p style={styles.warningText}>⚠️ Vui lòng đăng nhập để sử dụng không gian lưu trữ đám mây.</p>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 900 },
  sidebar: { position: 'absolute', top: 0, left: 0, width: '320px', height: '100%', backgroundColor: '#1e1e1e', color: '#fff', padding: '20px', boxShadow: '4px 0 10px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '15px' },
  closeBtn: { background: 'none', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' },
  createForm: { display: 'flex', gap: '8px', marginBottom: '20px' },
  input: { flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2d2d2d', color: '#fff', fontSize: '13px', outline: 'none' },
  addBtn: { padding: '8px 12px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' },
  listContainer: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#2d2d2d', borderRadius: '6px', cursor: 'pointer', border: '1px solid transparent', transition: '0.2s' },
  itemInfo: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflow: 'hidden' },
  itemName: { fontSize: '14px', fontWeight: 'bold', color: '#3b82f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemTime: { fontSize: '11px', color: '#888' },
  actionGroup: { display: 'flex', gap: '4px', alignItems: 'center' },
  renameBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px', marginRight: '2px' },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px' },
  emptyText: { textAlign: 'center', fontSize: '13px', color: '#666', marginTop: '20px', fontStyle: 'italic' },
  warningText: { textAlign: 'center', fontSize: '14px', color: '#eab308', marginTop: '4px', lineHeight: '1.5' }
};
import React, { useState } from 'react';
import { signinUser, signupUser, changePasswordUser } from '../services/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
  currentUser?: string; // Nhận username của người dùng đang đăng nhập nếu có
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess, currentUser }) => {
  if (!isOpen) return null;

  // Chuyển view sang string để gánh thêm tính năng changepass
  const [viewState, setViewState] = useState<'login' | 'signup' | 'changepass'>('login');
  const [username, setUsername] = useState(currentUser || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (viewState === 'login') {
      const res = await signinUser({ username, password });
      if (res.success && res.user) {
        onAuthSuccess(res.user);
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    } else if (viewState === 'signup') {
      const res = await signupUser({ username, email, password });
      if (res.success) {
        setSuccessMsg('🎉 Đăng ký thành công! Hãy đăng nhập.');
        setViewState('login');
        setEmail('');
      } else {
        setErrorMsg(res.message);
      }
    } else if (viewState === 'changepass') {
      const targetUser = currentUser || username;
      if (!targetUser) {
        setErrorMsg('Vui lòng điền tên tài khoản cần đổi mật khẩu.');
        return;
      }
      const res = await changePasswordUser({ username: targetUser, oldPassword, newPassword });
      if (res.success) {
        setSuccessMsg('🎉 Đổi mật khẩu thành công! Hãy đăng nhập lại.');
        setViewState('login');
        setOldPassword('');
        setNewPassword('');
      } else {
        setErrorMsg(res.message);
      }
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2>
            {viewState === 'login' && 'Đăng nhập hệ thống'}
            {viewState === 'signup' && 'Đăng ký tài khoản'}
            {viewState === 'changepass' && 'Đổi mật khẩu tài khoản'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Ô Tài khoản luôn xuất hiện hoặc tự động khóa nếu đã đăng nhập */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Tài khoản</label>
            <input 
              type="text" 
              value={currentUser || username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="Nhập tên tài khoản (5-20 ký tự)"
              style={styles.input} 
              disabled={!!currentUser && viewState === 'changepass'}
              required 
            />
          </div>

          {/* Trường dành riêng cho Đăng ký */}
          {viewState === 'signup' && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="Nhập địa chỉ email của bạn"
                style={styles.input} 
                required 
              />
            </div>
          )}

          {/* Trường dành cho Đăng ký / Đăng nhập thường */}
          {viewState !== 'changepass' && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Mật khẩu</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Nhập mật khẩu (tối thiểu 8 ký tự)"
                style={styles.input} 
                required 
              />
            </div>
          )}

          {/* Hai trường dành riêng cho Đổi mật khẩu */}
          {viewState === 'changepass' && (
            <>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Mật khẩu cũ</label>
                <input 
                  type="password" 
                  value={oldPassword} 
                  onChange={(e) => setOldPassword(e.target.value)} 
                  placeholder="Nhập mật khẩu đang sử dụng"
                  style={styles.input} 
                  required 
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Mật khẩu mới</label>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)"
                  style={styles.input} 
                  required 
                />
              </div>
            </>
          )}

          {errorMsg && <div style={styles.error}>{errorMsg}</div>}
          {successMsg && <div style={styles.success}>{successMsg}</div>}

          <button type="submit" style={styles.submitBtn}>
            {viewState === 'login' && 'Đăng nhập'}
            {viewState === 'signup' && 'Đăng ký'}
            {viewState === 'changepass' && 'Xác nhận đổi'}
          </button>
        </form>

        <div style={styles.footer}>
          {viewState === 'login' ? (
            <>
              <p>Chưa có tài khoản? <span onClick={() => { setViewState('signup'); setErrorMsg(''); }} style={styles.switchLink}>Đăng ký ngay</span></p>
              <p style={{ marginTop: '8px' }}><span onClick={() => { setViewState('changepass'); setErrorMsg(''); }} style={styles.switchLink}>Đổi mật khẩu?</span></p>
            </>
          ) : (
            <p>Đã có tài khoản? <span onClick={() => { setViewState('login'); setErrorMsg(''); }} style={styles.switchLink}>Đăng nhập ngay</span></p>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#1e1e1e', color: '#ffffff', width: '400px', padding: '24px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' },
  closeBtn: { background: 'none', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '14px', color: '#ccc' },
  input: { padding: '10px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#2d2d2d', color: '#fff', fontSize: '14px', outline: 'none' },
  submitBtn: { padding: '12px', borderRadius: '4px', border: 'none', backgroundColor: '#007acc', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' },
  error: { color: '#ff6b6b', fontSize: '14px', backgroundColor: 'rgba(255,107,107,0.1)', padding: '8px', borderRadius: '4px' },
  success: { color: '#51cf66', fontSize: '14px', backgroundColor: 'rgba(81,207,102,0.1)', padding: '8px', borderRadius: '4px' },
  footer: { marginTop: '20px', textAlign: 'center', fontSize: '14px', color: '#aaa' },
  switchLink: { color: '#007acc', cursor: 'pointer', textDecoration: 'underline' }
};
import React from 'react';

interface GdbVariable {
  name: string;
  type: string;
  value: string;
}

interface DebuggerProps {
  isDebugMode: boolean;
  currentDebugLine: number | null;
  debugStatusText: string;
  variablesList: GdbVariable[];
  onContinue: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStop: () => void;
}

export const Debugger: React.FC<DebuggerProps> = ({
  isDebugMode,
  currentDebugLine,
  debugStatusText,
  variablesList,
  onContinue,
  onStepOver,
  onStepInto,
  onStop
}) => {
  if (!isDebugMode) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 1. THANH ĐIỀU KHIỂN NÚT BẤM MOUSE INTERACTIVE */}
      <div style={styles.panel}>
        <div style={styles.title}>
          🛠️ DEBUG LINE TABLE {currentDebugLine && `[LINE ${currentDebugLine}]`}
        </div>
        <div style={styles.btnGroup}>
          <button onClick={onContinue} style={{ ...styles.btn, backgroundColor: '#2563eb' }}>
            🔵 Continue (F8)
          </button>
          <button onClick={onStepOver} style={{ ...styles.btn, backgroundColor: '#d97706' }}>
            🟡 Step Over (F10)
          </button>
          <button onClick={onStepInto} style={{ ...styles.btn, backgroundColor: '#06b6d4' }}>
            🟢 Step Into (F11)
          </button>
          <button onClick={onStop} style={{ ...styles.btn, backgroundColor: '#dc2626' }}>
            🛑 Stop Debug
          </button>
        </div>
        <span style={styles.statusText}>💬 {debugStatusText}</span>
      </div>

      {/* 2. BẢNG THEO DÕI BIẾN CỤC BỘ (WATCH TRACKER) */}
      <div style={styles.watchContainer}>
        <div style={styles.watchTitle}>🔍 VARIABLES WATCH TRACKER</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={{ padding: '4px' }}>Tên biến</th>
                <th style={{ padding: '4px' }}>Kiểu dữ liệu</th>
                <th style={{ padding: '4px' }}>Giá trị hiện tại</th>
              </tr>
            </thead>
            <tbody>
              {variablesList.length === 0 ? (
                <tr>
                  <td colSpan={3} style={styles.emptyCell}>
                    Chưa có biến cục bộ nào được khởi tạo tại phạm vi này.
                  </td>
                </tr>
              ) : (
                variablesList.map((v, idx) => (
                  <tr key={idx} style={styles.trRow}>
                    <td style={{ padding: '4px', fontWeight: 'bold' }}>{v.name}</td>
                    <td style={{ padding: '4px', color: '#ff7b72' }}>{v.type}</td>
                    <td style={{ padding: '4px', color: '#79c0ff', fontWeight: 'bold' }}>{v.value}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: { backgroundColor: '#1e152a', border: '1px solid #a855f7', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' },
  title: { fontSize: '12px', fontWeight: 'bold', color: '#c084fc', letterSpacing: '0.05em' },
  btnGroup: { display: 'flex', gap: '8px' },
  btn: { padding: '6px 12px', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' },
  statusText: { fontSize: '12px', color: '#aaa', fontStyle: 'italic' },
  watchContainer: { height: '140px', display: 'flex', flexDirection: 'column', border: '1px solid #4b5563', borderRadius: '6px', backgroundColor: '#161b22', padding: '10px', overflow: 'hidden' },
  watchTitle: { fontSize: '12px', fontWeight: 'bold', color: '#58a6ff', marginBottom: '4px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'monospace' },
  thRow: { borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' },
  trRow: { borderBottom: '1px solid #21262d', color: '#58a6ff' },
  emptyCell: { padding: '8px', color: '#8b949e', textAlign: 'center', fontStyle: 'italic' }
};
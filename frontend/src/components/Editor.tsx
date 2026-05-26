import React, { useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';

interface EditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onEditorMount: (editorInstance: any) => void; // <-- THÊM PROP MỚI NÀY
}

export const Editor: React.FC<EditorProps> = ({ code, onChange, onEditorMount }) => {
  const editorRef = useRef<any>(null);

  function handleEditorDidMount(editor: any) {
    editorRef.current = editor;
    onEditorMount(editor); // Đẩy thực thể editor ra ngoài App.tsx quản lý
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#1e1e1e' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#2d2d2d', borderBottom: '1px solid #333', color: '#ccc', fontSize: '14px' }}>
        <span>📝 main.c</span>
        <span style={{ fontSize: '12px', color: '#888' }}>Language: C (GCC)</span>
      </div>
      
      <div style={{ flex: 1, minHeight: '450px' }}>
        <MonacoEditor
          height="100%"
          language="c"
          theme="vs-dark"
          value={code}
          onChange={onChange}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            minimap: { enabled: true },
            automaticLayout: true,
            tabSize: 4,
            cursorBlinking: 'smooth',
          }}
        />
      </div>
    </div>
  );
};
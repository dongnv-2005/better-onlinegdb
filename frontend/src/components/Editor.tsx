import React from 'react';
import MonacoEditor, { Monaco } from '@monaco-editor/react';

interface EditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onEditorMount: (editor: any) => void;
}
// lSP
export const Editor: React.FC<EditorProps> = ({ code, onChange, onEditorMount }) => {
  
  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    onEditorMount(editor);

    // --- ĐĂNG KÝ BỘ ĐỆM AUTO COMPLETE CHUẨN KIỂU DỮ LIỆU ---
    monaco.languages.registerCompletionItemProvider('c', {
      // Định nghĩa kiểu dữ liệu rõ ràng cho model và position để triệt tiêu lỗi "implicitly any"
      provideCompletionItems: (model: any, position: any) => {
        const suggestions = [
          {
            label: 'printf',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'printf("${1:%d}\\n", ${2:var});',
            insertTextRules: monaco.languages.CompletionItemInsertRule.InsertAsSnippet,
            documentation: 'Hàm in dữ liệu có định dạng ra màn hình console (stdio.h)',
          },
          {
            label: 'scanf',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'scanf("${1:%d}", &${2:var});',
            insertTextRules: monaco.languages.CompletionItemInsertRule.InsertAsSnippet,
            documentation: 'Hàm nhập dữ liệu có định dạng từ bàn phím (stdio.h)',
          },
          {
            label: 'getchar',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'getchar();',
            documentation: 'Đọc một ký tự tiếp theo từ stdin (stdio.h)',
          },
          {
            label: 'sqrt',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'sqrt(${1:x})',
            insertTextRules: monaco.languages.CompletionItemInsertRule.InsertAsSnippet,
            documentation: 'Hàm tính căn bậc hai của một số (math.h)',
          },
          {
            label: 'pow',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'pow(${1:base}, ${2:exponent})',
            insertTextRules: monaco.languages.CompletionItemInsertRule.InsertAsSnippet,
            documentation: 'Hàm tính lũy thừa base^exponent (math.h)',
          },
          {
            label: 'abs',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'abs(${1:x})',
            insertTextRules: monaco.languages.CompletionItemInsertRule.InsertAsSnippet,
            documentation: 'Hàm lấy giá trị tuyệt đối của số nguyên (stdlib.h)',
          },
          {
            label: 'main_init',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n\t${1}\n\treturn 0;\n}',
            insertTextRules: monaco.languages.CompletionItemInsertRule.InsertAsSnippet,
            documentation: 'Khởi tạo nhanh cấu trúc hàm main() chuẩn C',
          }
        ];

        return { suggestions: suggestions };
      }, 
    }); 
  };

  return (
    <div style={{ height: '100%', border: '1px solid #2d2d2d', borderRadius: '6px', overflow: 'hidden' }}>
      <MonacoEditor
        height="100%"
        language="c"
        theme="vs-dark"
        value={code}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          automaticLayout: true,
          suggestOnTriggerCharacters: true,
          wordBasedSuggestions: 'currentDocument',
        }}
      />
    </div>
  );
};
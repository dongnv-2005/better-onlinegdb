import React, { useState, useEffect, useRef } from 'react';
import { Editor } from './components/Editor';
import { Terminal } from './components/Terminal';
import { AuthModal } from './components/AuthModal';
import { Debugger } from './components/Debugger';
import { ProjectSidebar } from './components/ProjectSidebar';
import { compileAndRunCode, saveCurrentProject, api, signoutUser } from './services/api'; 
import { getWebSocketService } from './services/websocket';

const DEFAULT_C_CODE = `#include <stdio.h>\n\nint main() {\n    int a = 10;\n    int b = 20;\n    int sum = a + b;\n    printf("Sum = %d\\n", sum);\n    return 0;\n}`;

interface ParsedError {
    line: number;
    column: number;
    severity: 'error' | 'warning';
    message: string;
}

interface GdbVariable {
    name: string;
    type: string;
    value: string;
}

export default function App() {
    const [code, setCode] = useState<string>(DEFAULT_C_CODE);
    const [stdin, setStdin] = useState<string>('');
    const [stdout, setStdout] = useState<string>('');
    const [stderr, setStderr] = useState<string>('');
    const [status, setStatus] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [errorsList, setErrorsList] = useState<ParsedError[]>([]);
    const [editorInstance, setEditorInstance] = useState<any>(null);
    const [isMounted, setIsMounted] = useState<boolean>(false);

    // --- STATES PHÂN HỆ DEBUGGER, AUTH & PROJECTS ---
    const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
    const [debugStatusText, setDebugStatusText] = useState<string>('');
    const [variablesList, setVariablesList] = useState<GdbVariable[]>([]);
    const [currentDebugLine, setCurrentDebugLine] = useState<number | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
    const [activeProjectName, setActiveProjectName] = useState<string>('');

    // BẬT ĐÈN VÀNG: Biến tham chiếu lưu vết ID lớp bôi màu cũ để dọn dẹp, chống trùng lặp dòng
    const debugDecorationsRef = useRef<string[]>([]);

    // Hàm dọn sạch vệt bôi màu vàng của Monaco Editor khi kết thúc hoặc chuyển dòng
    const clearDebugDecorations = (editor: any) => {
        if (editor && debugDecorationsRef.current.length > 0) {
            editor.deltaDecorations(debugDecorationsRef.current, []);
            debugDecorationsRef.current = [];
        }
    };

    useEffect(() => {
        setIsMounted(true);
        const ws = getWebSocketService();

        ws.on('DEBUG_STATUS', (data: { status: string; message: string }) => {
            setDebugStatusText(data.message);
            if (data.status === 'READY') {
                setIsDebugMode(true);
            } else if (data.status === 'IDLE' || data.status === 'ERROR') {
                setIsDebugMode(false);
                setCurrentDebugLine(null);
                setVariablesList([]);
                clearDebugDecorations(editorInstance); 
            }
        });

        ws.on('DEBUG_STOPPED', (stoppedInfo: { line?: number; func?: string; reason?: string }) => {
            if (stoppedInfo.line) {
                setCurrentDebugLine(stoppedInfo.line);
                
                if (editorInstance) {
                    // Tự động cuộn màn hình đưa dòng lệnh vào chính giữa tâm nhìn
                    editorInstance.revealLineInCenter(stoppedInfo.line);
                    editorInstance.setPosition({ lineNumber: stoppedInfo.line, column: 1 });

                    // CƠ CHẾ BÔI MÀU CHUẨN (MONACO DECORATIONS API) - CHỐNG TRÔI LỆCH DÒNG
                    const newDecorations = [
                        {
                            range: {
                                startLineNumber: stoppedInfo.line,
                                startColumn: 1,
                                endLineNumber: stoppedInfo.line,
                                endColumn: 1
                            },
                            options: {
                                isWholeLine: true,
                                className: 'myLineHighlight',         // Màu nền vàng nhạt đè toàn dòng
                                glyphMarginClassName: 'myGlyphMarginHighlight' // Khối chỉ thị vàng đậm ở lề trái
                            }
                        }
                    ];

                    // Đè lớp màu mới lên và xóa sạch lớp màu cũ ở dòng trước đó
                    debugDecorationsRef.current = editorInstance.deltaDecorations(
                        debugDecorationsRef.current,
                        newDecorations
                    );
                }
            }
        });

        ws.on('DEBUG_VARIABLES', (vars: GdbVariable[]) => {
            setVariablesList(vars);
        });

        return () => {
            ws.off('DEBUG_STATUS');
            ws.off('DEBUG_STOPPED');
            ws.off('DEBUG_VARIABLES');
            ws.disconnect();
        };
    }, [editorInstance]); 

    // UC-18: Hàm xử lý Đăng xuất xóa Cookie và làm sạch không gian soạn thảo
    const handleSignout = async () => {
        if (window.confirm('Đồng môn có chắc chắn muốn đăng xuất không?')) {
            const res = await signoutUser();
            if (res.success) {
                setCurrentUser(null);
                setActiveProjectId(null);
                setActiveProjectName('');
                setCode(DEFAULT_C_CODE); 
                clearDebugDecorations(editorInstance);
                alert(res.message);
            } else {
                alert(res.message);
            }
        }
    };

    // UC-20: Hàm lưu đè mã nguồn đang viết xuống Cloud DB
    const handleSaveProject = async () => {
        if (!activeProjectId) return;
        const res = await saveCurrentProject(activeProjectId, code);
        alert(res.message);
    };

    // UC-21: Hàm sửa đổi nạp chi tiết mã nguồn từ DB lên Editor (Đã fix lỗi mất nội dung)
    const handleSelectProject = async (id: number, name: string) => {
        try {
            setLoading(true);
            clearDebugDecorations(editorInstance); // Làm sạch vệt debug cũ nếu đang bật
            
            // Gọi chính xác endpoint GET chi tiết của dự án theo ID cụ thể
            const res = await api.get(`/projects/${id}`);
            
            if (res.data.success && res.data.project) {
                setActiveProjectId(id);
                setActiveProjectName(name);
                // Đổ chuẩn xác dữ liệu text mã nguồn C từ MySQL vào Editor
                setCode(res.data.project.source_code || '');
            }
            
            setIsSidebarOpen(false);
            setLoading(false);
        } catch (e: any) {
            setLoading(false);
            if (e.response && e.response.status === 401) {
                alert('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!');
                setIsAuthModalOpen(true);
            } else {
                alert('Không thể tải nội dung chi tiết của dự án.');
            }
        }
    };

    const handleStartDebug = () => {
        setStdout(''); setStderr(''); setErrorsList([]); setStatus('Debugging...');
        const ws = getWebSocketService();
        ws.connect(); 
        ws.emit('START_DEBUG', { sourceCode: code });
    };

    const handleStopDebug = () => {
        getWebSocketService().emit('DEBUG_STOP');
        setIsDebugMode(false);
        setCurrentDebugLine(null);
        setVariablesList([]);
        clearDebugDecorations(editorInstance);
        setDebugStatusText('Đã đóng trình gỡ lỗi.');
    };

    const handleRun = async () => {
        if (isDebugMode) getWebSocketService().emit('DEBUG_STOP');
        setLoading(true); setStdout(''); setStderr(''); setErrorsList([]); setStatus('Compiling & Running...');
        const result = await compileAndRunCode({ sourceCode: code, stdin });
        setLoading(false); setStatus(result.status);
        if (result.success) setStdout(result.stdout);
        else {
            setStderr(result.stderr);
            if (result.status === 'COMPILATION_ERROR') setErrorsList(parseCompilerErrors(result.stderr));
        }
    };

    const parseCompilerErrors = (rawStderr: string): ParsedError[] => {
        const errors: ParsedError[] = [];
        const regex = /main\.c:(\d+):(\d+):\s+(error|warning):\s+(.*)/g;
        let match;
        while ((match = regex.exec(rawStderr)) !== null) {
            errors.push({ line: parseInt(match[1], 10), column: parseInt(match[2], 10), severity: match[3] as 'error' | 'warning', message: match[4] });
        }
        return errors;
    };

    return (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#121212', color: '#fff', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', overflow: 'hidden' }}>
            <style>{`
            .myLineHighlight {
                background: rgba(234, 179, 8, 0.15) !important;
            }

            .myGlyphMarginHighlight {
                background: #eab308 !important;
                width: 6px !important;
                border-radius: 2px;
            }
        `}</style>
            {/* HEADER BAR */}
            <header style={{ height: '56px', backgroundColor: '#1a1a1a', borderBottom: '1px solid #2d2d2d', display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        onClick={() => setIsSidebarOpen(true)}
                        style={{ padding: '6px 12px', backgroundColor: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        ☰ PROJECTS
                    </button>
                    <h1 style={{ fontWeight: 'bold', fontSize: '18px', color: '#3b82f6', margin: 0, letterSpacing: '0.05em' }}>
                        BETTER-ONLINEGDB {activeProjectName && ` - [${activeProjectName}]`}
                    </h1>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {activeProjectId && (
                        <button
                            onClick={handleSaveProject}
                            style={{ padding: '8px 16px', backgroundColor: '#1e3a8a', color: '#60a5fa', fontWeight: 'bold', border: '1px solid #2563eb', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            SAVE FILE
                        </button>
                    )}

                    {currentUser ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ fontSize: '14px', color: '#4ade80', fontWeight: '500' }}>
                                👋 {currentUser.username}
                            </div>
                            <button
                                onClick={handleSignout}
                                style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                🚪 LOGOUT
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsAuthModalOpen(true)}
                            style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            🔐 LOGIN
                        </button>
                    )}

                    <button
                        onClick={handleStartDebug}
                        disabled={loading || isDebugMode}
                        style={{ padding: '8px 16px', backgroundColor: (loading || isDebugMode) ? '#4b5563' : '#a855f7', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: (loading || isDebugMode) ? 'not-allowed' : 'pointer' }}
                    >
                        🐞 DEBUG
                    </button>
                    <button
                        onClick={handleRun}
                        disabled={loading}
                        style={{ padding: '8px 24px', backgroundColor: loading ? '#4b5563' : '#16a34a', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer' }}
                    >
                        {loading ? 'Running...' : '▶ RUN'}
                    </button>
                </div>
            </header>

            {/* WORKSPACE CHIA LƯỚI */}
            <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '16px', overflow: 'hidden' }}>
                <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
                    <Editor code={code} onChange={(val) => setCode(val || '')} onEditorMount={(editor) => setEditorInstance(editor)} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto' }}>
                    <Debugger 
                        isDebugMode={isDebugMode} currentDebugLine={currentDebugLine} debugStatusText={debugStatusText} variablesList={variablesList}
                        onContinue={() => getWebSocketService().emit('DEBUG_CONTINUE')}
                        onStepOver={() => getWebSocketService().emit('DEBUG_STEP_OVER')}
                        onStepInto={() => getWebSocketService().emit('DEBUG_STEP_INTO')}
                        onStop={handleStopDebug}
                    />

                    <div style={{ height: '100px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', marginBottom: '4px' }}>INPUT (STDIN)</label>
                        <textarea style={{ flex: 1, backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '6px', padding: '12px', color: '#fff', fontFamily: 'monospace', outline: 'none', resize: 'none' }} placeholder="Dữ liệu đầu vào..." value={stdin} onChange={(e) => setStdin(e.target.value)} />
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#888' }}>OUTPUT CONSOLE</label>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: status === 'COMPLETED' ? '#4ade80' : status.includes('ERROR') ? '#f87171' : '#3b82f6' }}>{status || 'IDLE'}</span>
                        </div>
                        {isMounted ? <Terminal stdout={stdout} stderr={stderr} /> : <div style={{ flex: 1, backgroundColor: '#1e1e1e', borderRadius: '6px' }} />}
                    </div>
                </div>
            </main>

            {/* CÁC MODAL VÀ SIDEBAR ĐIỀU KHIỂN NGẦM */}
            <ProjectSidebar 
                isOpen={isSidebarOpen} 
                onClose={() => setIsSidebarOpen(false)} 
                onSelectProject={handleSelectProject} 
                currentUser={currentUser} 
            />
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onAuthSuccess={(user) => setCurrentUser(user)} />
        </div>
    );
}
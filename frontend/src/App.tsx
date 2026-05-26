import React, { useState, useEffect } from 'react';
import { Editor } from './components/Editor';
import { Terminal } from './components/Terminal';
import { compileAndRunCode } from './services/api';
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

    // ====== CÁC STATE PHỤC VỤ PHÂN HỆ DEBUGGER (GIAI ĐOẠN 4) ======
    const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
    const [debugStatusText, setDebugStatusText] = useState<string>('');
    const [variablesList, setVariablesList] = useState<GdbVariable[]>([]);
    const [currentDebugLine, setCurrentDebugLine] = useState<number | null>(null);

    // Đăng ký kết nối và lắng nghe WebSocket duy nhất 1 lần khi ứng dụng khởi chạy
    useEffect(() => {
        setIsMounted(true);
        const ws = getWebSocketService();

        // 1. Lắng nghe trạng thái tổng quan của Debugger (UC-11)
        ws.on('DEBUG_STATUS', (data: { status: string; message: string }) => {
            console.log('[WS-Client] Trạng thái phiên dịch:', data);
            setDebugStatusText(data.message);
            if (data.status === 'READY') {
                setIsDebugMode(true);
            } else if (data.status === 'IDLE' || data.status === 'ERROR') {
                setIsDebugMode(false);
                setCurrentDebugLine(null);
                setVariablesList([]);
            }
        });

        // 2. Lắng nghe tín hiệu dừng tiến trình từ GDB để cập nhật vị trí dòng lệnh (UC-13)
        ws.on('DEBUG_STOPPED', (stoppedInfo: { line?: number; func?: string; reason?: string }) => {
            console.log('[WS-Client] Tiến trình đã dừng tại vị trí:', stoppedInfo);
            if (stoppedInfo.line) {
                setCurrentDebugLine(stoppedInfo.line);
                if (editorInstance) {
                    editorInstance.revealLineInCenter(stoppedInfo.line);
                    editorInstance.setPosition({ lineNumber: stoppedInfo.line, column: 1 });
                }
            }
        });

        // 3. Lắng nghe danh sách dữ liệu biến cục bộ do GDB nhả về (UC-14)
        ws.on('DEBUG_VARIABLES', (vars: GdbVariable[]) => {
            console.log('[WS-Client] Danh sách biến nhận được:', vars);
            setVariablesList(vars);
        });

        return () => {
            ws.off('DEBUG_STATUS');
            ws.off('DEBUG_STOPPED');
            ws.off('DEBUG_VARIABLES');
            ws.disconnect();
        };
    }, [editorInstance]); 

    // ====== LẮNG NGHE PHÍM TẮT TOÀN CỤC CHO UC-13 (F8, F10, F11) ======
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (!isDebugMode) return; 

            if (e.key === 'F8') {
                e.preventDefault();
                handleDebugContinue();
            }

            if (e.key === 'F10') {
                e.preventDefault();
                handleDebugStepOver();
            }

            if (e.key === 'F11') {
                e.preventDefault(); // Chặn hành vi mở full màn hình của trình duyệt
                handleDebugStepInto();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => {
            window.removeEventListener('keydown', handleGlobalKeyDown);
        };
    }, [isDebugMode]); 

    // Kích hoạt phiên làm việc Debug ngầm trong Sandbox
    const handleStartDebug = () => {
        setStdout('');
        setStderr('');
        setErrorsList([]);
        setStatus('Debugging...');
        
        const ws = getWebSocketService();
        ws.connect(); 
        ws.emit('START_DEBUG', { sourceCode: code });
    };

    // ====== CÁC HÀM PHÁT LỆNH ĐIỀU KHIỂN LUỒNG QUA WEBSOCKET (UC-13) ======
    const handleDebugContinue = () => {
        getWebSocketService().emit('DEBUG_CONTINUE');
    };

    const handleDebugStepOver = () => {
        getWebSocketService().emit('DEBUG_STEP_OVER');
    };

    const handleDebugStepInto = () => {
        getWebSocketService().emit('DEBUG_STEP_INTO');
    };

    const handleDebugStop = () => {
        getWebSocketService().emit('DEBUG_STOP');
    };

    // Hàm xử lý sự kiện nhảy dòng khi click vào lỗi
    const handleJumpToError = (line: number, column: number) => {
        if (editorInstance) {
            editorInstance.revealLineInCenter(line);
            editorInstance.setPosition({ lineNumber: line, column });
            editorInstance.focus();
        }
    };

    // Hàm sử dụng Regex để bóc tách chuỗi lỗi raw từ GCC compiler
    const parseCompilerErrors = (rawStderr: string): ParsedError[] => {
        const errors: ParsedError[] = [];
        const regex = /main\.c:(\d+):(\d+):\s+(error|warning):\s+(.*)/g;
        let match;

        while ((match = regex.exec(rawStderr)) !== null) {
            errors.push({
                line: parseInt(match[1], 10),
                column: parseInt(match[2], 10),
                severity: match[3] as 'error' | 'warning',
                message: match[4],
            });
        }
        return errors;
    };

    const handleRun = async () => {
        if (isDebugMode) handleDebugStop();

        setLoading(true);
        setStdout('');
        setStderr('');
        setErrorsList([]);
        setStatus('Compiling & Running...');

        const result = await compileAndRunCode({ sourceCode: code, stdin });

        setLoading(false);
        setStatus(result.status);

        if (result.success) {
            setStdout(result.stdout);
        } else {
            setStderr(result.stderr);
            if (result.status === 'COMPILATION_ERROR') {
                const parsed = parseCompilerErrors(result.stderr);
                setErrorsList(parsed);
            }
        }
    };

    return (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#121212', color: '#fff', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', overflow: 'hidden' }}>

            {/* HEADER BAR */}
            <header style={{ height: '56px', backgroundColor: '#1a1a1a', borderBottom: '1px solid #2d2d2d', display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}>
                <h1 style={{ fontWeight: 'bold', fontSize: '18px', color: '#3b82f6', margin: 0, letterSpacing: '0.05em' }}>BETTER-ONLINEGDB</h1>
                
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                        onClick={handleStartDebug}
                        disabled={loading || isDebugMode}
                        style={{ padding: '8px 16px', backgroundColor: (loading || isDebugMode) ? '#4b5563' : '#a855f7', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', marginRight: '8px', cursor: (loading || isDebugMode) ? 'not-allowed' : 'pointer' }}
                    >
                        🐞 START DEBUG
                    </button>
                    <button
                        onClick={handleRun}
                        disabled={loading}
                        style={{ padding: '8px 24px', backgroundColor: loading ? '#4b5563' : '#16a34a', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer' }}
                    >
                        {loading ? 'Running...' : '▶ RUN CODE'}
                    </button>
                </div>
            </header>

            {/* WORKSPACE CHIA ĐÔI MÀN HÌNH */}
            <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '16px', overflow: 'hidden' }}>

                {/* CỘT TRÁI: EDITOR SOẠN THẢO */}
                <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
                    <Editor
                        code={code}
                        onChange={(val) => setCode(val || '')}
                        onEditorMount={(editor) => setEditorInstance(editor)}
                    />
                    {currentDebugLine !== null && (
                        <div style={{ position: 'absolute', top: `${(currentDebugLine - 1) * 19 + 55}px`, left: 0, width: '4px', height: '19px', backgroundColor: '#eab308', zIndex: 10 }} />
                    )}
                </div>

                {/* CỘT PHẢI: BANEL ĐIỀU KHIỂN & TERMINAL CONSOLE */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto' }}>

                    {/* INTERACTIVE DEBUGGER PANEL */}
                    {isDebugMode && (
                        <div style={{ backgroundColor: '#1e152a', border: '1px solid #a855f7', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#c084fc', letterSpacing: '0.05em' }}>
                                🛠️ HỆ THỐNG ĐIỀU HƯỚNG GỠ LỖI GDB INTERACTIVE {currentDebugLine && `[ĐANG DỪNG TẠI DÒNG ${currentDebugLine}]`}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleDebugContinue} style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                    🔵 Continue (F8)
                                </button>
                                <button onClick={handleDebugStepOver} style={{ padding: '6px 12px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                    🟡 Step Over (F10)
                                </button>
                                <button onClick={handleDebugStepInto} style={{ padding: '6px 12px', backgroundColor: '#06b6d4', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                    🟢 Step Into (F11)
                                </button>
                                <button onClick={handleDebugStop} style={{ padding: '6px 12px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                    🛑 Stop Debug
                                </button>
                            </div>
                            <span style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>💬 {debugStatusText}</span>
                        </div>
                    )}

                    {/* BIẾN CỤC BỘ WATCH TRACKER */}
                    {isDebugMode && (
                        <div style={{ height: '140px', display: 'flex', flexDirection: 'column', border: '1px solid #4b5563', borderRadius: '6px', backgroundColor: '#161b22', padding: '10px', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#58a6ff', marginBottom: '4px' }}>🔍 VARIABLES WATCH TRACKER</div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'monospace' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                                            <th style={{ padding: '4px' }}>Tên biến</th>
                                            <th style={{ padding: '4px' }}>Kiểu dữ liệu</th>
                                            <th style={{ padding: '4px' }}>Giá trị hiện tại</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {variablesList.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} style={{ padding: '8px', color: '#8b949e', textAlign: 'center', fontStyle: 'italic' }}>Chưa có biến cục bộ nào được khởi tạo tại phạm vi này.</td>
                                            </tr>
                                        ) : (
                                            variablesList.map((v, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #21262d', color: '#58a6ff' }}>
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
                    )}

                    {/* Ô Nhập Dữ Liệu Đầu Vào (Stdin) */}
                    <div style={{ height: '100px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', marginBottom: '4px', letterSpacing: '0.05em' }}>INPUT (STDIN)</label>
                        <textarea
                            style={{ flex: 1, backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '6px', padding: '12px', color: '#fff', fontFamily: 'monospace', fontSize: '14px', resize: 'none', outline: 'none' }}
                            placeholder="Nhập dữ liệu đầu vào tại đây..."
                            value={stdin}
                            onChange={(e) => setStdin(e.target.value)}
                        />
                    </div>

                    {/* Cửa sổ Terminal ảo xterm.js */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', letterSpacing: '0.05em' }}>OUTPUT CONSOLE</label>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: status === 'COMPLETED' ? '#4ade80' : status.includes('ERROR') ? '#f87171' : '#3b82f6' }}>
                                {status || 'IDLE'}
                            </span>
                        </div>
                        {isMounted ? (
                            <Terminal stdout={stdout} stderr={stderr} />
                        ) : (
                            <div style={{ flex: 1, backgroundColor: '#1e1e1e', borderRadius: '6px' }} />
                        )}
                    </div>

                    {/* Bảng trực quan hóa danh sách lỗi biên dịch */}
                    {errorsList.length > 0 && (
                        <div style={{ height: '150px', display: 'flex', flexDirection: 'column', border: '1px solid #f87171', borderRadius: '6px', backgroundColor: '#1a1515', padding: '10px', overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#f87171', marginBottom: '6px', letterSpacing: '0.05em' }}>❌ DANH SÁCH LỖI BIÊN DỊCH (GCC COMPILER)</div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'monospace' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #444', color: '#aaa', textAlign: 'left' }}>
                                            <th style={{ padding: '4px' }}>Vị trí</th>
                                            <th style={{ padding: '4px' }}>Loại</th>
                                            <th style={{ padding: '4px' }}>Nội dung thông báo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {errorsList.map((err, idx) => (
                                            <tr
                                                key={idx}
                                                style={{ borderBottom: '1px solid #2a2222', cursor: 'pointer', color: err.severity === 'error' ? '#f87171' : '#fbbf24' }}
                                                onClick={() => handleJumpToError(err.line, err.column)}
                                            >
                                                <td style={{ padding: '6px 4px' }}>Dòng {err.line}:{err.column}</td>
                                                <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>{err.severity.toUpperCase()}</td>
                                                <td style={{ padding: '6px 4px', color: '#ddd' }}>{err.message}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}
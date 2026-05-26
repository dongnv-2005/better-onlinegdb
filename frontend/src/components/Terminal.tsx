import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

// @ts-ignore
import 'xterm/css/xterm.css'; 

interface TerminalProps {
  stdout: string;
  stderr: string;
}

export const Terminal: React.FC<TerminalProps> = ({ stdout, stderr }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current || !containerRef.current) return;

    let term: XTerm | null = null;
    let fitAddon: FitAddon | null = null;

    // Khởi tạo một bộ giám sát kích thước DOM (ResizeObserver)
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        
        // CHỈ KHỞI TẠO XTERM KHI VÙNG CHỨA ĐÃ CÓ KÍCH THƯỚC THỰC TẾ TRÊN UI
        if (width > 0 && height > 0 && !xtermRef.current) {
          term = new XTerm({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Courier New, monospace',
            theme: {
              background: '#1e1e1e',
              foreground: '#4ade80', 
              cursor: '#ffffff',
            },
          });

          fitAddon = new FitAddon();
          term.loadAddon(fitAddon);
          term.open(terminalRef.current!);
          
          xtermRef.current = term;
          fitAddonRef.current = fitAddon;

          // Thực hiện fit kích thước và in dòng chữ chào ban đầu
          try {
            fitAddon.fit();
            if (!stdout && !stderr) {
              term.writeln('\x1b[2mChưa có kết quả thực thi. Nhấn nút Run để chạy bài.\x1b[0m');
            }
          } catch (e) {}
        } else if (width > 0 && height > 0 && xtermRef.current && fitAddonRef.current) {
          // Nếu terminal đã tồn tại từ trước và người dùng co giãn cửa sổ, chỉ cần gọi fit() an toàn
          try {
            fitAddonRef.current.fit();
          } catch (e) {}
        }
      }
    });

    // Bắt đầu giám sát vùng chứa Terminal
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, []); // Luồng khởi tạo chạy độc lập và an toàn tuyệt đối với CSS Layout

  // Theo dõi để ghi nhận dữ liệu stdout/stderr đổ về từ Backend
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    term.write('\x1bc'); // Xóa sạch màn hình trước khi in phiên chạy mới

    if (!stdout && !stderr) {
      term.writeln('\x1b[2mChưa có kết quả thực thi. Nhấn nút Run để chạy bài.\x1b[0m');
      return;
    }

    if (stdout) {
      term.write(stdout.replace(/\n/g, '\r\n'));
    }

    if (stderr) {
      term.write(`\r\n\x1b[31m${stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
    }
  }, [stdout, stderr]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        flex: 1, 
        backgroundColor: '#1e1e1e', 
        border: '1px solid #333', 
        borderRadius: '6px', 
        padding: '10px', 
        overflow: 'hidden',
        minHeight: '200px'
      }}
    >
      <div ref={terminalRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};
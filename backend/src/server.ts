import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { DockerDriver } from './sandbox/docker.driver';
import { SecurityGuard } from './sandbox/security.guard';
import { GdbMiParser } from './sandbox/gdb.mi.parser';

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
const sandbox = new DockerDriver();

// --- ENDPOINT RUN CODE HTTP (STATELESS) ---
app.post('/api/v1/sandbox/run', async (req: Request, res: Response) => {
  const { sourceCode, stdin } = req.body;
  if (!sourceCode) return res.status(400).json({ success: false, message: 'Thiếu mã nguồn C.' });

  const securityCheck = SecurityGuard.validateSourceCode(sourceCode);
  if (!securityCheck.isSafe) {
    return res.status(422).json({ success: false, status: 'SECURITY_VIOLATION', stdout: '', stderr: securityCheck.reason });
  }

  try {
    const result = await sandbox.executeCCode(sourceCode, stdin || '');
    return res.status(result.success ? 200 : 422).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ====== CẤU HÌNH HẠ TẦNG WEBSOCKET (GIAI ĐOẠN 4 - STATEFUL) ======
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`[WS] Có kết nối mới kết nối đến Debugger: ${socket.id}`);

  let activeContainer: any = null;
  let activeGdbStream: any = null;

  // Kích hoạt phiên gỡ lỗi GDB (UC-11)
  socket.on('START_DEBUG', async (payload: { sourceCode: string }) => {
    console.log(`[WS] Nhận yêu cầu Debug code từ socket: ${socket.id}`);

    if (activeContainer) {
      try {
        await activeContainer.stop();
        await activeContainer.remove();
      } catch (e) { }
    }

    socket.emit('DEBUG_STATUS', { status: 'INITIALIZING', message: 'Đang biên dịch code -g và khởi tạo môi trường GDB...' });

    try {
      const session = await sandbox.executeGdbSession(payload.sourceCode, (gdbRawOutput) => {
        console.log(`[GDB RAW]:\n${gdbRawOutput}`);

        const lines = gdbRawOutput.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();

          // Kiểm tra sự kiện GDB dừng tiến trình (*stopped)
          const stoppedInfo = GdbMiParser.parseStopped(trimmedLine);
          if (stoppedInfo) {
            socket.emit('DEBUG_STOPPED', stoppedInfo);

            // UC-14: Tự động gửi lệnh ngầm lấy giá trị biến khi chương trình dừng
            if (activeGdbStream) {
              activeGdbStream.write('-stack-list-locals --simple-values\n');
            }
          }

          // Hứng kết quả trả về của danh sách biến cục bộ từ GDB
          if (trimmedLine.startsWith('^done,locals=')) {
            const parsedVariables = GdbMiParser.parseLocals(trimmedLine);
            socket.emit('DEBUG_VARIABLES', parsedVariables);
          }

          // UC-15: Phát hiện và xử lý lỗi Runtime Crash
          if (trimmedLine.includes('reason="signal-received"')) {
            if (trimmedLine.includes('signal-name="SIGFPE"')) {
              socket.emit('DEBUG_STATUS', { status: 'ERROR', message: '❌ Chương trình bị sập do lỗi chia cho số 0 (Floating Point Exception)!' });
            } else if (trimmedLine.includes('signal-name="SIGSEGV"')) {
              socket.emit('DEBUG_STATUS', { status: 'ERROR', message: '❌ Chương trình bị sập do truy cập sai vùng nhớ/con trỏ lậu (Segmentation Fault)!' });
            }
          }
        }
      });

      activeContainer = session.container;
      activeGdbStream = session.execStream;

      socket.emit('DEBUG_STATUS', { status: 'READY', message: 'Môi trường Debug đã sẵn sàng!' });

      // 🌟 KHẮC PHỤC ĐÓNG BĂNG: Găm một điểm dừng tạm thời tại hàm main trước khi chạy
      activeGdbStream.write('-break-insert main\n');

      // Sau đó mới kích hoạt chạy tiến trình để nó dừng ngay tại đầu hàm main chờ lệnh người dùng
      activeGdbStream.write('-exec-run\n');

    } catch (error: any) {
      socket.emit('DEBUG_STATUS', { status: 'ERROR', message: error.message || 'Không thể kết nối trình gỡ lỗi GDB.' });
    }
  });

  // Điều khiển luồng Debugger (UC-13)
  socket.on('DEBUG_STEP_OVER', () => {
    if (activeGdbStream) activeGdbStream.write('-exec-next\n');
  });

  socket.on('DEBUG_CONTINUE', () => {
    if (activeGdbStream) activeGdbStream.write('-exec-continue\n');
  });

  socket.on('DEBUG_STOP', async () => {
    if (activeContainer) {
      try {
        await activeContainer.stop();
        await activeContainer.remove();
        activeContainer = null;
        activeGdbStream = null;
        socket.emit('DEBUG_STATUS', { status: 'IDLE', message: 'Đã đóng trình gỡ lỗi.' });
      } catch (e) { }
    }
  });
  socket.on('DEBUG_STEP_INTO', () => {
    if (activeGdbStream) {
      console.log(`[WS] Thực thi lệnh: Step Into (-exec-step)`);
      activeGdbStream.write('-exec-step\n');
    }
  });

  socket.on('disconnect', async () => {
    console.log(`[WS] Socket đóng kết nối: ${socket.id}`);
    if (activeContainer) {
      try {
        await activeContainer.stop();
        await activeContainer.remove();
      } catch (e) { }
    }
  });
});

const PORT = 5000;
httpServer.listen(PORT, () => {
  console.log(`[OK] Better-OnlineGDB đang chạy tại port ${PORT}`);
});
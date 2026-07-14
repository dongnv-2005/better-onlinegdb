import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve, getRequestListener } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { AuthController } from './controllers/auth.controller';
import { ProjectController } from './controllers/project.controller';
import { DockerDriver } from './sandbox/docker.driver';
import { SecurityGuard } from './sandbox/security.guard';
import { GdbMiParser } from './sandbox/gdb.mi.parser';

const app = new Hono();

app.use('/api/*', cors({
  origin: 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true
}));

const sandbox = new DockerDriver();

// --- CÁC ENDPOINT ĐỊNH TUYẾN XÁC THỰC (PHÂN HỆ 5) ---
app.post('/api/v1/auth/signup', AuthController.signup);
app.post('/api/v1/auth/signin', AuthController.signin);
app.post('/api/v1/auth/signout', AuthController.signout);
app.put('/api/v1/auth/change-password', AuthController.changePassword);

// --- CÁC ENDPOINT QUẢN LÝ DỰ ÁN (PHÂN HỆ 6) ---
app.post('/api/v1/projects', ProjectController.create);
app.get('/api/v1/projects', ProjectController.list);
app.get('/api/v1/projects/:id', ProjectController.getDetail);
app.put('/api/v1/projects/:id', ProjectController.save);
app.put('/api/v1/projects/:id/rename', ProjectController.rename);
app.delete('/api/v1/projects/:id', ProjectController.delete);

// --- ENDPOINT RUN CODE HTTP (STATELESS) ---
app.post('/api/v1/sandbox/run', async (c) => {
  const { sourceCode, stdin } = await c.req.json();
  
  if (!sourceCode) {
    return c.json({ success: false, message: 'Thiếu mã nguồn C.' }, 400);
  }

  const securityCheck = SecurityGuard.validateSourceCode(sourceCode);
  if (!securityCheck.isSafe) {
    return c.json({ success: false, status: 'SECURITY_VIOLATION', stdout: '', stderr: securityCheck.reason }, 422);
  }

  try {
    const result = await sandbox.executeCCode(sourceCode, stdin || '');
    return c.json(result, result.success ? 200 : 422);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

// ====== HẠ TẦNG WEBSOCKET (GIAI ĐOẠN 4 - STATEFUL DEBUGGER) ======
const PORT = 5000;
const httpServer = createServer(getRequestListener(app.fetch));
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`Có kết nối mới: ${socket.id}`);
  let activeContainer: any = null;
  let activeGdbStream: any = null;

  // Hàm helper dùng chung để giải phóng an toàn tài nguyên container ngầm
  const cleanUpDebugSession = async () => {
    if (activeContainer) {
      try {
        await activeContainer.stop();
        await activeContainer.remove();
      } catch (e) { }
      activeContainer = null;
    }
    activeGdbStream = null;
  };

  socket.on('START_DEBUG', async (payload: { sourceCode: string }) => {
    console.log(`[Hono-WS] Nhận yêu cầu Debug từ socket: ${socket.id}`);
    await cleanUpDebugSession(); // Làm sạch session cũ nếu có

    socket.emit('DEBUG_STATUS', { status: 'INITIALIZING', message: 'Đang biên dịch code -g và khởi tạo môi trường GDB...' });

    try {
      const session = await sandbox.executeGdbSession(payload.sourceCode, async (gdbRawOutput) => {
        console.log(`[GDB RAW]:\n${gdbRawOutput}`);
        const lines = gdbRawOutput.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();

          // 1. Tự động kiểm tra cờ kết thúc chương trình bình thường từ GDB MI
          if (trimmedLine.startsWith('*stopped,reason="exited-normally"')) {
            console.log('[Debugger] Chương trình gỡ lỗi đã chạy xong (exited-normally).');
            await cleanUpDebugSession();
            socket.emit('DEBUG_STATUS', { status: 'IDLE', message: 'Chương trình đã kết thúc và thoát bình thường.' });
            return;
          }

          const stoppedInfo = GdbMiParser.parseStopped(trimmedLine);
          if (stoppedInfo) {
            // BẮN SỰ KIỆN DEBUG_STOP TỰ ĐỘNG KHI THOÁT HÀM MAIN (HẠ CONTAINER)
            if (stoppedInfo.func === '??' || !stoppedInfo.line) {
              console.log('[Debugger] Con trỏ lọt vào vùng hệ thống (func="??"). Tự động dừng phiên.');
              await cleanUpDebugSession();
              socket.emit('DEBUG_STATUS', { status: 'IDLE', message: 'Chương trình gỡ lỗi đã hoàn thành và thoát bình thường.' });
              return;
            }

            // Nếu con trỏ vẫn nằm ở các dòng code C hợp lệ thì bắn số dòng về UI bôi màu
            socket.emit('DEBUG_STOPPED', stoppedInfo);
            if (activeGdbStream) {
              activeGdbStream.write('-stack-list-locals --simple-values\n');
            }
          }

          if (trimmedLine.startsWith('^done,locals=')) {
            const parsedVariables = GdbMiParser.parseLocals(trimmedLine);
            socket.emit('DEBUG_VARIABLES', parsedVariables);
          }

          if (trimmedLine.includes('reason="signal-received"')) {
            if (trimmedLine.includes('signal-name="SIGFPE"')) {
              socket.emit('DEBUG_STATUS', { status: 'ERROR', message: 'Chương trình bị sập do lỗi chia cho số 0!' });
            } else if (trimmedLine.includes('signal-name="SIGSEGV"')) {
              socket.emit('DEBUG_STATUS', { status: 'ERROR', message: 'Chương trình bị sập do truy cập sai vùng nhớ!' });
            }
          }
        }
      });

      activeContainer = session.container;
      activeGdbStream = session.execStream;
      socket.emit('DEBUG_STATUS', { status: 'READY', message: 'Môi trường Debug đã sẵn sàng!' });
      activeGdbStream.write('-break-insert main\n');
      activeGdbStream.write('-exec-run\n');
    } catch (error: any) {
      socket.emit('DEBUG_STATUS', { status: 'ERROR', message: error.message || 'Không thể kết nối trình gỡ lỗi GDB.' });
    }
  });

  socket.on('DEBUG_STEP_OVER', () => {
    if (activeGdbStream) activeGdbStream.write('-exec-next\n');
  });

  socket.on('DEBUG_CONTINUE', () => {
    if (activeGdbStream) activeGdbStream.write('-exec-continue\n');
  });

  socket.on('DEBUG_STEP_INTO', () => {
    if (activeGdbStream) activeGdbStream.write('-exec-step\n');
  });

  socket.on('DEBUG_STOP', async () => {
    console.log(`[Debugger] Nhận lệnh dừng gỡ lỗi chủ động từ client: ${socket.id}`);
    await cleanUpDebugSession();
    socket.emit('DEBUG_STATUS', { status: 'IDLE', message: 'Đã đóng trình gỡ lỗi.' });
  });

  socket.on('disconnect', async () => {
    console.log(`Socket đóng kết nối: ${socket.id}`);
    await cleanUpDebugSession();
  });
});

httpServer.listen(PORT, () => {
  console.log(`[🔥 OK] Better-OnlineGDB đang chạy tại port ${PORT}`);
});
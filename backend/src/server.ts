import express, { Request, Response } from 'express';
import { DockerDriver } from './sandbox/docker.driver';

const app = express();

// Middleware bắt buộc để Express hiểu dữ liệu JSON từ Postman gửi lên
app.use(express.json());

const sandbox = new DockerDriver();

// Định nghĩa Endpoint API để tiếp nhận code C từ Frontend/Postman
app.post('/api/v1/sandbox/run', async (req: Request, res: Response) => {
  const { sourceCode, stdin } = req.body;

  // Validation cơ bản đầu vào
  if (!sourceCode) {
    return res.status(400).json({ success: false, message: 'Thiếu mã nguồn C (sourceCode).' });
  }

  try {
    // Chuyển tiếp code vào Sandbox Docker để xử lý
    const result = await sandbox.executeCCode(sourceCode, stdin || '');
    
    if (result.status === 'COMPLETED') {
       return res.json(result);
    } else {
       // Trả về mã 422 nếu lỗi compile, TLE, hoặc MLE để Frontend biết đường xử lý
       return res.status(422).json(result);
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`[OK] Sandbox Core Server đang chạy qua nodemon tại port ${PORT}`);
});
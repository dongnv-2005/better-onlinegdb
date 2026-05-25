import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Docker from 'dockerode';

interface SandboxResult {
    success: boolean;
    status: 'COMPLETED' | 'COMPILATION_ERROR' | 'TIME_LIMIT_EXCEEDED' | 'MEMORY_LIMIT_EXCEEDED' | 'UNKNOWN_ERROR';
    stdout: string;
    stderr: string;
}

export class DockerDriver {
    private docker: Docker;
    private static TMP_DIR = path.normalize(path.join(__dirname, '../../tmp'));
    private static TIMEOUT_LIMIT = 2; // Giới hạn 2 giây thực thi
    private static MEMORY_LIMIT = 64 * 1024 * 1024; // Giới hạn 64MB RAM

    constructor() {
        // Kết nối tới Docker Desktop trên Windows qua Named Pipe mặc định
        this.docker = new Docker({ socketPath: '//./pipe/docker_engine' });

        // Tự động tạo thư mục tmp nếu chưa có để làm nơi chứa code tạm thời
        if (!fs.existsSync(DockerDriver.TMP_DIR)) {
            fs.mkdirSync(DockerDriver.TMP_DIR, { recursive: true });
        }
    }

    public async executeCCode(sourceCode: string, stdin: string): Promise<SandboxResult> {
        const runId = uuidv4();
        const hostProjectDir = path.join(DockerDriver.TMP_DIR, runId);
        fs.mkdirSync(hostProjectDir, { recursive: true });

        // Ghi mã nguồn và dữ liệu vào của người dùng ra file tạm trên máy Windows
        fs.writeFileSync(path.join(hostProjectDir, 'main.c'), sourceCode);
        fs.writeFileSync(path.join(hostProjectDir, 'stdin.txt'), stdin);

        // Lấy đường dẫn tuyệt đối chuẩn hóa để mount vào Docker
        const absoluteHostPath = path.resolve(hostProjectDir);

        try {
            // ===== 1. GIAI ĐOẠN BIÊN DỊCH (COMPILATION) =====
            const compileContainer = await this.docker.createContainer({
                Image: 'c-sandbox:latest',
                Cmd: ['gcc', 'main.c', '-o', 'main'],
                HostConfig: {
                    Binds: [`${absoluteHostPath}:/app`], // Gắn thư mục chứa code vào container
                },
            });

            await compileContainer.start();
            const compileWait = await compileContainer.wait();

            // Thu thập log xem có bị lỗi cú pháp C không
            const compileLogs = await compileContainer.logs({ stdout: true, stderr: true });
            const compileErrorStr = compileLogs.toString('utf8').trim();
            await compileContainer.remove(); // Xóa container dịch ngay sau khi xong

            if (compileWait.StatusCode !== 0) {
                return {
                    success: false,
                    status: 'COMPILATION_ERROR',
                    stdout: '',
                    stderr: compileErrorStr,
                };
            }

            // ===== 2. GIAI ĐOẠN THỰC THI AN TOÀN (SANDBOX EXECUTION) =====
            const runContainer = await this.docker.createContainer({
                Image: 'c-sandbox:latest',
                Cmd: ['sh', '-c', `timeout ${DockerDriver.TIMEOUT_LIMIT}s ./main < stdin.txt`],
                NetworkDisabled: true, // Chặn hoàn toàn Internet để tránh mã độc tán phát
                HostConfig: {
                    Binds: [`${absoluteHostPath}:/app`],
                    Memory: DockerDriver.MEMORY_LIMIT,     // Cấu hình giới hạn RAM 64MB
                    MemorySwap: DockerDriver.MEMORY_LIMIT, // Chặn dùng bộ nhớ đệm Swap ổ cứng
                },
            });

            await runContainer.start();
            const runWait = await runContainer.wait();

            // Đọc toàn bộ kết quả xuất ra màn hình (Stdout)
            const runLogs = await runContainer.logs({ stdout: true, stderr: true, follow: false }) as unknown as Buffer;
            const outputStr = this.parseDockerLogs(runLogs); // Loại bỏ header nhiễu tại đây
            await runContainer.remove(); // Xóa container chạy ngay lập tức

            // Kiểm tra mã thoát (Exit code) để phát hiện Overtime hoặc Tràn RAM
            if (runWait.StatusCode === 124) {
                return {
                    success: false,
                    status: 'TIME_LIMIT_EXCEEDED',
                    stdout: '',
                    stderr: 'Error: Time Limit Exceeded (Chương trình chạy quá 2 giây).'
                };
            }

            if (runWait.StatusCode === 137) {
                return {
                    success: false,
                    status: 'MEMORY_LIMIT_EXCEEDED',
                    stdout: '',
                    stderr: 'Error: Memory Limit Exceeded (Chương trình chiếm dụng quá 64MB RAM).'
                };
            }

            return {
                success: true,
                status: 'COMPLETED',
                stdout: outputStr,
                stderr: '',
            };

        } catch (error: any) {
            return {
                success: false,
                status: 'UNKNOWN_ERROR',
                stdout: '',
                stderr: error.message || 'Hệ thống Sandbox gặp sự cố nội bộ.',
            };
        } finally {
            // Dọn dẹp sạch sẽ file tạm trên máy Windows để tránh rác ổ đĩa
            setTimeout(() => {
                if (fs.existsSync(hostProjectDir)) {
                    fs.rmSync(hostProjectDir, { recursive: true, force: true });
                }
            }, 1000);
        }
    }

    // Hàm loại bỏ 8-byte header multiplexed của Docker để lấy nội dung text sạch
    private parseDockerLogs(rawBuffer: Buffer): string {
        let result = '';
        let offset = 0;

        while (offset < rawBuffer.length) {
            // Header của Docker gồm 8 bytes: byte 0 là stream type (1 = stdout, 2 = stderr)
            // Các byte từ 4-7 chứa độ dài (size) của đoạn text bằng kiểu UInt32 Big Endian
            if (offset + 8 > rawBuffer.length) break;
            const size = rawBuffer.readUInt32BE(offset + 4);
            offset += 8;

            if (offset + size <= rawBuffer.length) {
                result += rawBuffer.toString('utf8', offset, offset + size);
            }
            offset += size;
        }

        return result.trim();
    }

}
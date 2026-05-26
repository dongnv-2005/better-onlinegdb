import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Docker from 'dockerode';

export interface SandboxResult {
    success: boolean;
    // Bổ sung thêm trạng thái SECURITY_VIOLATION cho tầng bảo mật quét tĩnh
    status: 'COMPLETED' | 'COMPILATION_ERROR' | 'TIME_LIMIT_EXCEEDED' | 'MEMORY_LIMIT_EXCEEDED' | 'SECURITY_VIOLATION' | 'UNKNOWN_ERROR';
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
                // Chạy dưới quyền tài quyền khoản không có quyền root (sandbox_user) để chặn phá hoại hệ thống
                User: 'sandbox_user', 
                Cmd: ['sh', '-c', `timeout ${DockerDriver.TIMEOUT_LIMIT}s ./main < stdin.txt`],
                NetworkDisabled: true, // Chặn hoàn toàn Internet (Tương đương --network none)
                HostConfig: {
                    Binds: [`${absoluteHostPath}:/app`],
                    Memory: DockerDriver.MEMORY_LIMIT,     // Cấu hình giới hạn RAM 64MB
                    MemorySwap: DockerDriver.MEMORY_LIMIT, // Chặn dùng bộ nhớ đệm Swap ổ cứng
                },
            });

            await runContainer.start();
            const runWait = await runContainer.wait();

            // Truy vấn sâu vào trạng thái thực tế của container để bắt cờ OOMKilled từ Linux Kernel
            const containerInfo = await runContainer.inspect();
            const isOOMKilled = containerInfo.State.OOMKilled;

            // Đọc toàn bộ kết quả xuất ra màn hình (Stdout)
            const runLogs = await runContainer.logs({ stdout: true, stderr: true, follow: false }) as unknown as Buffer;
            const outputStr = this.parseDockerLogs(runLogs); // Loại bỏ header nhiễu tại đây
            await runContainer.remove(); // Xóa container chạy ngay lập tức

            // ====== KIỂM TRA MÃ THOÁT VÀ TÍN HIỆU NGẮT TÀI NGUYÊN (UC-08 & UC-09) ======
            
            // Trường hợp 1: Tràn bộ nhớ RAM (OOM Killer hoặc ExitCode 137 do Linux cưỡng ép ngắt)
            if (isOOMKilled || runWait.StatusCode === 137) {
                return {
                    success: false,
                    status: 'MEMORY_LIMIT_EXCEEDED',
                    stdout: '',
                    stderr: 'Error: Memory Limit Exceeded (Chương trình bị sập do chạy vượt quá giới hạn tài nguyên 64MB RAM cho phép).'
                };
            }

            // Trường hợp 2: Chạy quá thời gian (ExitCode 124 do lệnh timeout phát SIGKILL)
            if (runWait.StatusCode === 124) {
                return {
                    success: false,
                    status: 'TIME_LIMIT_EXCEEDED',
                    stdout: '',
                    stderr: 'Error: Time Limit Exceeded (Chương trình bị dừng cưỡng ép do chạy quá giới hạn thời gian 2 giây. Vui lòng kiểm tra lại vòng lặp vô hạn).'
                };
            }

            // Trường hợp 3: Hoàn thành chạy mượt mà
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
    /**
     * Khởi chạy một phiên GDB tương tác ngầm bên trong Container qua WebSocket
     * @param sourceCode Mã nguồn C cần gỡ lỗi
     * @param onGdbOutput Callback hàm hứng dữ liệu thô xuất ra từ GDB
     * @returns Trả về thực thể container và tiến trình thực thi để điều khiển ghi lệnh ngầm
     */
    public async executeGdbSession(
        sourceCode: string, 
        onGdbOutput: (data: string) => void
    ): Promise<{ container: any; execStream: any }> {
        const runId = uuidv4();
        const hostProjectDir = path.join(DockerDriver.TMP_DIR, runId);
        fs.mkdirSync(hostProjectDir, { recursive: true });

        // 1. Ghi file code main.c ra bộ nhớ tạm
        fs.writeFileSync(path.join(hostProjectDir, 'main.c'), sourceCode);
        const absoluteHostPath = path.resolve(hostProjectDir);

        // 2. Biên dịch đặc biệt kèm cờ gỡ lỗi "-g" để nạp bảng biểu ký hiệu (Symbol Table)
        const compileContainer = await this.docker.createContainer({
            Image: 'c-sandbox:latest',
            Cmd: ['gcc', '-g', 'main.c', '-o', 'main_debug'], // Thêm cờ -g để debug [cite: 106]
            HostConfig: { Binds: [`${absoluteHostPath}:/app`] },
        });
        await compileContainer.start();
        const compileWait = await compileContainer.wait();

        if (compileWait.StatusCode !== 0) {
            const logs = await compileContainer.logs({ stdout: true, stderr: true });
            await compileContainer.remove();
            throw new Error(`Lỗi biên dịch Debug:\n${logs.toString('utf8')}`);
        }
        await compileContainer.remove();

        // 3. Khởi tạo container chạy duy trì trạng thái ngầm (Stateful)
        const runContainer = await this.docker.createContainer({
            Image: 'c-sandbox:latest',
            User: 'sandbox_user', // Chạy dưới quyền user thường an toàn [cite: 97]
            Cmd: ['sleep', '3600'], // Giữ container sống trong 1 tiếng để debug [cite: 127]
            NetworkDisabled: true, // Chặn Internet bảo mật [cite: 97]
            HostConfig: {
                Binds: [`${absoluteHostPath}:/app`],
                Memory: DockerDriver.MEMORY_LIMIT,
            },
        });
        await runContainer.start();

        // 4. Kích hoạt tiến trình GDB MI ngầm bên trong container
        const execInstance = await runContainer.exec({
            Cmd: ['gdb', '--interpreter=mi2', './main_debug'], // Gọi trình thông dịch máy mi2 [cite: 107]
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: false
        });

        const execStream = await execInstance.start({ hijack: true, stdin: true });

        // Lắng nghe dữ liệu thô xuất ra liên tục từ GDB nhả về qua đường ống stream
        execStream.on('data', (chunk: Buffer) => {
            const cleanedData = this.parseDockerLogs(chunk);
            if (cleanedData) {
                onGdbOutput(cleanedData);
            }
        });

        return { container: runContainer, execStream };
    }
}
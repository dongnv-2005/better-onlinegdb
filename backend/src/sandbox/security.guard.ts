export class SecurityGuard {
    // Danh sách các từ khóa, hàm hệ thống và thư viện bị cấm triệt để
    private static readonly BANNED_KEYWORDS = [
        'system', 'fork', 'exec', 'popen', 'kill', 'signal',
        'socket', 'connect', 'bind', 'listen', 'reboot', 'shutdown'
    ];

    private static readonly BANNED_HEADERS = [
        'sys/socket.h', 'sys/types.h', 'unistd.h', 'signal.h'
    ];

    /**
     * Kiểm tra mã nguồn C xem có chứa hành vi nguy hiểm không
     * @param sourceCode Chuỗi mã nguồn người dùng gửi lên
     * @returns object chứa trạng thái an toàn và thông báo lỗi nếu có
     */
    public static validateSourceCode(sourceCode: string): { isSafe: boolean; reason: string } {
        // 1. Loại bỏ toàn bộ các khoảng trắng và chuyển về chữ thường để tránh bypass qua mặt bằng cách viết hoa/cách thưa
        const cleanCode = sourceCode.replace(/\s+/g, '').toLowerCase();

        // 2. Quét kiểm tra thư viện hệ thống nguy hiểm
        for (const header of this.BANNED_HEADERS) {
            if (cleanCode.includes(`#include<${header}>`) || cleanCode.includes(`#include"${header}"`)) {
                return {
                    isSafe: false,
                    reason: `Phát hiện thư viện bị cấm bảo mật: <${header}>. Hệ thống từ chối biên dịch.`
                };
            }
        }

        // 3. Quét kiểm tra các hàm can thiệp sâu vào nhân OS hoặc gọi lệnh shell
        for (const keyword of this.BANNED_KEYWORDS) {
            // Sử dụng Regex để bắt chính xác tên hàm (tránh bắt nhầm các biến có tên chứa từ khóa)
            const regex = new RegExp(`\\b${keyword}\\s*\\(`, 'g');
            if (regex.test(sourceCode)) {
                return {
                    isSafe: false,
                    reason: `Phát hiện lệnh/hàm nguy hiểm bị chặn thực thi: "${keyword}()".`
                };
            }
        }

        return { isSafe: true, reason: '' };
    }
}
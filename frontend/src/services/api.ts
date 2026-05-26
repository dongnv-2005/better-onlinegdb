import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/v1';

export interface RunPayload {
  sourceCode: string;
  stdin: string;
}

export interface RunResponse {
  success: boolean;
  status: 'COMPLETED' | 'COMPILATION_ERROR' | 'TIME_LIMIT_EXCEEDED' | 'MEMORY_LIMIT_EXCEEDED' | 'UNKNOWN_ERROR';
  stdout: string;
  stderr: string;
}

export const compileAndRunCode = async (payload: RunPayload): Promise<RunResponse> => {
  try {
    const response = await axios.post<RunResponse>(`${API_BASE_URL}/sandbox/run`, payload);
    return response.data;
  } catch (error: any) {
    // Nếu Backend trả về lỗi logic (422), vẫn bắt lấy dữ liệu lỗi để hiển thị lên màn hình console
    if (error.response && error.response.data) {
      return error.response.data;
    }
    return {
      success: false,
      status: 'UNKNOWN_ERROR',
      stdout: '',
      stderr: error.message || 'Không thể kết nối đến hệ thống Sandbox Docker.'
    };
  }
};
import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:5000/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});
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
    const response = await api.post<RunResponse>(`/sandbox/run`, payload);
    return response.data;
  } catch (error: any) {
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

export interface AuthPayload {
  username: string;
  password?: string;
  email?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: {
    id: number;
    username: string;
    email: string;
  };
}

// UC: Gọi API Đăng ký tài khoản
export const signupUser = async (payload: AuthPayload): Promise<AuthResponse> => {
  try {
    const response = await api.post<AuthResponse>('/auth/signup', payload);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Không thể kết nối đến máy chủ Backend.' };
  }
};

// UC: Gọi API Đăng nhập hệ thống
export const signinUser = async (payload: AuthPayload): Promise<AuthResponse> => {
  try {
    const response = await api.post<AuthResponse>('/auth/signin', payload);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Không thể kết nối đến máy chủ Backend.' };
  }
};

// Định nghĩa kiểu dữ liệu Project chuẩn hóa theo Database
export interface ProjectItem {
  id: number;
  name: string;
  updated_at: string;
}

export interface ProjectListResponse {
  success: boolean;
  projects?: ProjectItem[];
  message?: string;
}

export interface ProjectActionResponse {
  success: boolean;
  projectId?: number;
  message: string;
}

// UC: Gọi API tạo dự án mới
export const createProject = async (name: string, sourceCode: string): Promise<ProjectActionResponse> => {
  try {
    const response = await api.post<ProjectActionResponse>('/projects', { name, sourceCode });
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Lỗi kết nối máy chủ.' };
  }
};

// UC: Gọi API lấy danh sách dự án của User
export const fetchProjectsList = async (): Promise<ProjectListResponse> => {
  try {
    const response = await api.get<ProjectListResponse>('/projects');
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Lỗi kết nối máy chủ.' };
  }
};

// UC: Gọi API lưu đè mã nguồn vào dự án hiện tại
export const saveCurrentProject = async (projectId: number, sourceCode: string): Promise<ProjectActionResponse> => {
  try {
    const response = await api.put<ProjectActionResponse>(`/projects/${projectId}`, { sourceCode });
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Lỗi kết nối máy chủ.' };
  }
};

// UC: Gọi API xóa dự án
export const deleteProject = async (projectId: number): Promise<ProjectActionResponse> => {
  try {
    const response = await api.delete<ProjectActionResponse>(`/projects/${projectId}`);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Lỗi kết nối máy chủ.' };
  }
};

export const signoutUser = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.post<{ success: boolean; message: string }>('/auth/signout');
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Không thể kết nối đến máy chủ Backend.' };
  }
};

export const renameProject = async (projectId: number, newName: string): Promise<ProjectActionResponse> => {
  try {
    const response = await api.put<ProjectActionResponse>(`/projects/${projectId}/rename`, { newName });
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Lỗi kết nối máy chủ khi đổi tên.' };
  }
};

export interface ChangePasswordPayload {
  username: string;
  oldPassword?: string;
  newPassword?: string;
}

// UC: Gọi API Đổi mật khẩu hệ thống
export const changePasswordUser = async (payload: ChangePasswordPayload): Promise<AuthResponse> => {
  try {
    const response = await api.put<AuthResponse>('/auth/change-password', payload);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.data) return error.response.data;
    return { success: false, message: 'Không thể kết nối đến máy chủ Backend.' };
  }
};